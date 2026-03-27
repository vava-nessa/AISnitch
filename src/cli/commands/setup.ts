import { execFile as execFileCallback } from 'node:child_process';
import { access, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { promisify } from 'node:util';

import {
  loadConfig,
  saveConfig,
  type AdapterConfig,
  type AISnitchConfig,
  type ConfigPathOptions,
} from '../../core/config/index.js';

/**
 * @file src/cli/commands/setup.ts
 * @description Interactive setup command for configuring external tool hooks and plugins to forward activity into AISnitch.
 * @functions
 *   → parseSetupToolName
 *   → createToolSetup
 *   → runSetupCommand
 * @exports SetupToolName, SetupCliOptions, SetupOutput, ToolSetup, ClaudeCodeSetup, OpenCodeSetup, parseSetupToolName, createToolSetup, runSetupCommand
 * @see ../program.ts
 * @see ../runtime.ts
 */

const execFile = promisify(execFileCallback);

const SETUP_TOOL_NAMES = ['claude-code', 'opencode', 'gemini-cli', 'codex'] as const;
const ANSI_RESET = '\u001B[0m';
const ANSI_RED = '\u001B[31m';
const ANSI_GREEN = '\u001B[32m';
const ANSI_CYAN = '\u001B[36m';
const CLAUDE_FILE_CHANGED_MATCHER = '.*';

const CLAUDE_CODE_HOOK_EVENTS = [
  'SessionStart',
  'UserPromptSubmit',
  'PreToolUse',
  'PermissionRequest',
  'PostToolUse',
  'PostToolUseFailure',
  'Notification',
  'SubagentStart',
  'SubagentStop',
  'TaskCreated',
  'TaskCompleted',
  'Stop',
  'StopFailure',
  'TeammateIdle',
  'InstructionsLoaded',
  'ConfigChange',
  'CwdChanged',
  'FileChanged',
  'WorktreeCreate',
  'WorktreeRemove',
  'PreCompact',
  'PostCompact',
  'Elicitation',
  'ElicitationResult',
  'SessionEnd',
] as const;

const GEMINI_HOOK_EVENTS = [
  'SessionStart',
  'SessionEnd',
  'BeforeAgent',
  'AfterAgent',
  'BeforeTool',
  'AfterTool',
  'Notification',
  'PreCompress',
] as const;

type ClaudeHookEventName = (typeof CLAUDE_CODE_HOOK_EVENTS)[number];

interface ClaudeHookHandler extends Record<string, unknown> {
  readonly async?: boolean;
  readonly type: string;
  readonly url?: string;
}

interface ClaudeHookMatcherGroup extends Record<string, unknown> {
  readonly hooks: ClaudeHookHandler[];
  readonly matcher?: string;
}

interface ClaudeSettings extends Record<string, unknown> {
  readonly hooks?: Record<string, ClaudeHookMatcherGroup[]>;
}

interface GeminiHookHandler extends Record<string, unknown> {
  readonly command?: string;
  readonly description?: string;
  readonly name?: string;
  readonly timeout?: number;
  readonly type: string;
}

interface GeminiHookMatcherGroup extends Record<string, unknown> {
  readonly hooks: GeminiHookHandler[];
  readonly matcher?: string;
  readonly sequential?: boolean;
}

interface GeminiSettings extends Record<string, unknown> {
  readonly hooks?: Record<string, GeminiHookMatcherGroup[]>;
}

interface ToolSetupDependencies {
  readonly binaryExists?: (binaryName: string) => Promise<boolean>;
  readonly confirm?: (diff: string, prompt: string) => Promise<boolean>;
  readonly homeDirectory?: string;
  readonly claudeSettingsPath?: string;
  readonly geminiSettingsPath?: string;
  readonly opencodeConfigDirectory?: string;
  readonly codexHomeDirectory?: string;
  readonly output?: SetupOutput;
}

interface FileMutationSnapshot {
  readonly changed: boolean;
  readonly currentContent: string | null;
  readonly nextContent: string;
}

/**
 * Setup-capable tool names for the CLI.
 */
export type SetupToolName = (typeof SETUP_TOOL_NAMES)[number];

/**
 * Shared options accepted by `aisnitch setup`.
 */
export interface SetupCliOptions {
  readonly config?: string;
  readonly revert?: boolean;
}

/**
 * Minimal output contract for interactive setup commands.
 */
export interface SetupOutput {
  readonly stderr: (text: string) => void;
  readonly stdout: (text: string) => void;
}

/**
 * Generic setup contract implemented by each supported tool.
 */
export interface ToolSetup {
  readonly toolName: SetupToolName;
  detect(): Promise<boolean>;
  getConfigPath(): string;
  computeDiff(): Promise<string>;
  apply(): Promise<void>;
  revert(): Promise<void>;
}

/**
 * Parses and validates the setup tool argument.
 */
export function parseSetupToolName(rawValue: string): SetupToolName {
  if ((SETUP_TOOL_NAMES as readonly string[]).includes(rawValue)) {
    return rawValue as SetupToolName;
  }

  throw new Error(
    `Unsupported setup tool: ${rawValue}. Supported tools: ${SETUP_TOOL_NAMES.join(', ')}`,
  );
}

/**
 * 📖 Setup needs deterministic file writes and reversible backups because it
 * edits user-owned tool configuration rather than internal project state.
 */
abstract class FileToolSetupBase implements ToolSetup {
  protected readonly binaryExists: (binaryName: string) => Promise<boolean>;

  protected constructor(
    public readonly toolName: SetupToolName,
    binaryExists?: (binaryName: string) => Promise<boolean>,
  ) {
    this.binaryExists = binaryExists ?? isBinaryAvailable;
  }

  public abstract detect(): Promise<boolean>;

  public abstract getConfigPath(): string;

  public async computeDiff(): Promise<string> {
    const snapshot = await this.buildSnapshot();

    if (!snapshot.changed) {
      return `${ANSI_CYAN}No changes required for ${this.toolName}.${ANSI_RESET}\n`;
    }

    return renderColoredDiff(
      this.getConfigPath(),
      snapshot.currentContent,
      snapshot.nextContent,
    );
  }

  public async apply(): Promise<void> {
    const snapshot = await this.buildSnapshot();

    if (!snapshot.changed) {
      return;
    }

    const configPath = this.getConfigPath();

    await mkdir(dirname(configPath), { recursive: true });

    if (snapshot.currentContent !== null) {
      await copyFile(configPath, this.getBackupPath());
    }

    await writeFile(configPath, snapshot.nextContent, 'utf8');
  }

  public async revert(): Promise<void> {
    const configPath = this.getConfigPath();
    const backupPath = this.getBackupPath();

    if (await fileExists(backupPath)) {
      await copyFile(backupPath, configPath);
      await rm(backupPath, { force: true });
      return;
    }

    await rm(configPath, { force: true });
  }

  protected abstract buildNextContent(
    currentContent: string | null,
  ): Promise<string>;

  protected getBackupPath(): string {
    return `${this.getConfigPath()}.bak`;
  }

  private async buildSnapshot(): Promise<FileMutationSnapshot> {
    const currentContent = await this.readCurrentContent();
    const nextContent = await this.buildNextContent(currentContent);

    return {
      changed: currentContent !== nextContent,
      currentContent,
      nextContent,
    };
  }

  private async readCurrentContent(): Promise<string | null> {
    try {
      return await readFile(this.getConfigPath(), 'utf8');
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return null;
      }

      throw error;
    }
  }
}

/**
 * Claude Code setup mutates `~/.claude/settings.json` and merges one AISnitch
 * HTTP hook group per event without overwriting unrelated user hooks.
 */
export class ClaudeCodeSetup extends FileToolSetupBase {
  private readonly settingsPath: string;

  private readonly hookUrl: string;

  public constructor(
    httpPort: number,
    dependencies: ToolSetupDependencies = {},
  ) {
    super('claude-code', dependencies.binaryExists);
    this.settingsPath =
      dependencies.claudeSettingsPath ??
      join(dependencies.homeDirectory ?? homedir(), '.claude', 'settings.json');
    this.hookUrl = `http://localhost:${httpPort}/hooks/claude-code`;
  }

  public async detect(): Promise<boolean> {
    return (
      (await this.binaryExists('claude')) ||
      (await fileExists(this.settingsPath))
    );
  }

  public getConfigPath(): string {
    return this.settingsPath;
  }

  protected buildNextContent(
    currentContent: string | null,
  ): Promise<string> {
    const parsedSettings = parseClaudeSettings(currentContent);
    const currentHooks = parsedSettings.hooks ?? {};
    const nextHooks: Record<string, ClaudeHookMatcherGroup[]> = {
      ...currentHooks,
    };

    for (const hookEventName of CLAUDE_CODE_HOOK_EVENTS) {
      nextHooks[hookEventName] = ensureClaudeAISnitchHook(
        currentHooks[hookEventName] ?? [],
        hookEventName,
        this.hookUrl,
      );
    }

    const nextSettings: ClaudeSettings = {
      ...parsedSettings,
      hooks: nextHooks,
    };

    return Promise.resolve(`${JSON.stringify(nextSettings, null, 2)}\n`);
  }
}

/**
 * OpenCode setup uses the officially supported local plugin directory and
 * drops a dependency-free plugin that forwards a curated event subset to AISnitch.
 */
export class OpenCodeSetup extends FileToolSetupBase {
  private readonly pluginPath: string;

  private readonly configDirectory: string;

  private readonly hookUrl: string;

  public constructor(
    httpPort: number,
    dependencies: ToolSetupDependencies = {},
  ) {
    super('opencode', dependencies.binaryExists);
    this.configDirectory =
      dependencies.opencodeConfigDirectory ??
      join(dependencies.homeDirectory ?? homedir(), '.config', 'opencode');
    this.pluginPath = join(this.configDirectory, 'plugins', 'aisnitch.ts');
    this.hookUrl = `http://localhost:${httpPort}/hooks/opencode`;
  }

  public async detect(): Promise<boolean> {
    return (
      (await this.binaryExists('opencode')) ||
      (await fileExists(this.configDirectory))
    );
  }

  public getConfigPath(): string {
    return this.pluginPath;
  }

  protected buildNextContent(): Promise<string> {
    return Promise.resolve(buildOpenCodePluginSource(this.hookUrl));
  }
}

/**
 * Gemini CLI setup mutates `~/.gemini/settings.json` and merges wildcard
 * command hooks that forward the raw stdin JSON into AISnitch over HTTP.
 */
export class GeminiCLISetup extends FileToolSetupBase {
  private readonly settingsPath: string;

  private readonly hookUrl: string;

  public constructor(
    httpPort: number,
    dependencies: ToolSetupDependencies = {},
  ) {
    super('gemini-cli', dependencies.binaryExists);
    this.settingsPath =
      dependencies.geminiSettingsPath ??
      join(dependencies.homeDirectory ?? homedir(), '.gemini', 'settings.json');
    this.hookUrl = `http://localhost:${httpPort}/hooks/gemini-cli`;
  }

  public async detect(): Promise<boolean> {
    return (
      (await this.binaryExists('gemini')) ||
      (await fileExists(this.settingsPath))
    );
  }

  public getConfigPath(): string {
    return this.settingsPath;
  }

  protected buildNextContent(
    currentContent: string | null,
  ): Promise<string> {
    const parsedSettings = parseGeminiSettings(currentContent);
    const currentHooks = parsedSettings.hooks ?? {};
    const nextHooks: Record<string, GeminiHookMatcherGroup[]> = {
      ...currentHooks,
    };

    for (const hookEventName of GEMINI_HOOK_EVENTS) {
      nextHooks[hookEventName] = ensureGeminiAISnitchHook(
        currentHooks[hookEventName] ?? [],
        this.hookUrl,
      );
    }

    const nextSettings: GeminiSettings = {
      ...parsedSettings,
      hooks: nextHooks,
    };

    return Promise.resolve(`${JSON.stringify(nextSettings, null, 2)}\n`);
  }
}

/**
 * Codex uses passive log watching for the MVP, so setup only arms the adapter
 * and documents the watched source path rather than editing Codex files.
 */
export class CodexSetup implements ToolSetup {
  private readonly codexHomeDirectory: string;

  public readonly toolName = 'codex' as const;

  private readonly binaryExists: (binaryName: string) => Promise<boolean>;

  public constructor(dependencies: ToolSetupDependencies = {}) {
    this.binaryExists = dependencies.binaryExists ?? isBinaryAvailable;
    this.codexHomeDirectory =
      dependencies.codexHomeDirectory ??
      join(dependencies.homeDirectory ?? homedir(), '.codex');
  }

  public async detect(): Promise<boolean> {
    return (
      (await this.binaryExists('codex')) ||
      (await fileExists(this.getConfigPath()))
    );
  }

  public getConfigPath(): string {
    return join(this.codexHomeDirectory, 'log', 'codex-tui.log');
  }

  public computeDiff(): Promise<string> {
    return Promise.resolve(
      [
        `${ANSI_CYAN}--- ${this.getConfigPath()} (passive source)${ANSI_RESET}`,
        `${ANSI_GREEN}+ Enable passive Codex log watching in AISnitch.${ANSI_RESET}`,
        `${ANSI_GREEN}+ No external Codex config changes are required for this adapter.${ANSI_RESET}`,
      ].join('\n'),
    );
  }

  public apply(): Promise<void> {
    return Promise.resolve();
  }

  public revert(): Promise<void> {
    return Promise.resolve();
  }
}

/**
 * Creates one concrete setup implementation for the selected tool.
 */
export async function createToolSetup(
  toolName: SetupToolName,
  options: SetupCliOptions = {},
  dependencies: ToolSetupDependencies = {},
): Promise<ToolSetup> {
  const config = await loadConfig(toConfigPathOptions(options));
  const httpPort = config.httpPort;

  if (toolName === 'claude-code') {
    return new ClaudeCodeSetup(httpPort, dependencies);
  }

  if (toolName === 'gemini-cli') {
    return new GeminiCLISetup(httpPort, dependencies);
  }

  if (toolName === 'codex') {
    return new CodexSetup(dependencies);
  }

  return new OpenCodeSetup(httpPort, dependencies);
}

/**
 * Runs the interactive setup flow, including diff rendering, confirmation,
 * backup creation, and optional revert.
 */
export async function runSetupCommand(
  toolName: SetupToolName,
  options: SetupCliOptions = {},
  dependencies: ToolSetupDependencies = {},
): Promise<void> {
  const output = dependencies.output ?? createProcessSetupOutput();
  const setup = await createToolSetup(toolName, options, dependencies);

  if (!(await setup.detect())) {
    throw new Error(
      `Unable to detect ${toolName}. Make sure the tool is installed or its config directory already exists.`,
    );
  }

  if (options.revert) {
    await setup.revert();
    await setAdapterEnabled(toolName, false, options);
    output.stdout(
      `${toolName} setup reverted at ${setup.getConfigPath()}.\n`,
    );
    return;
  }

  const diff = await setup.computeDiff();

  output.stdout(`${diff}${diff.endsWith('\n') ? '' : '\n'}`);

  if (diff.includes('No changes required')) {
    await setAdapterEnabled(toolName, true, options);
    output.stdout(
      `${toolName} is already configured for AISnitch.\n`,
    );
    return;
  }

  const confirm =
    dependencies.confirm ?? defaultConfirm;
  const approved = await confirm(
    diff,
    `Apply AISnitch setup for ${toolName}? [Y/n] `,
  );

  if (!approved) {
    output.stdout('Setup aborted.\n');
    return;
  }

  await setup.apply();
  await setAdapterEnabled(toolName, true, options);

  output.stdout(
    `Configured ${toolName} for AISnitch at ${setup.getConfigPath()}.\n`,
  );
}

function buildOpenCodePluginSource(hookUrl: string): string {
  return `/**
 * AISnitch OpenCode plugin
 *
 * 📖 This plugin forwards a curated subset of OpenCode runtime events to the
 * local AISnitch HTTP ingress without requiring extra dependencies.
 */

const AISNITCH_ENDPOINT = ${JSON.stringify(hookUrl)};

const EVENT_TYPE_MAP = {
  "message.part.updated": "agent.streaming",
  "message.updated": "agent.streaming",
  "permission.asked": "agent.asking_user",
  "session.compacted": "agent.compact",
  "session.created": "session.start",
  "session.deleted": "session.end",
  "session.error": "agent.error",
  "session.idle": "agent.idle",
  "tool.execute.before": "agent.tool_call"
};

let sequenceNumber = 0;

function getRecord(value) {
  return typeof value === "object" && value !== null ? value : {};
}

function getPathTail(value) {
  if (typeof value !== "string" || value.length === 0) {
    return undefined;
  }

  const parts = value.split(/[\\\\/]+/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : undefined;
}

function sanitizeToken(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return undefined;
  }

  const normalized = value
    .trim()
    .replace(/[\\\\/]+/g, "-")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "");

  return normalized.length > 0 ? normalized : undefined;
}

function getSessionId(event, fallbackDirectory) {
  if (typeof event.sessionID === "string" && event.sessionID.length > 0) {
    return event.sessionID;
  }

  if (typeof event.sessionId === "string" && event.sessionId.length > 0) {
    return event.sessionId;
  }

  const properties = getRecord(event.properties);
  if (typeof properties.sessionID === "string" && properties.sessionID.length > 0) {
    return properties.sessionID;
  }

  const project =
    typeof event.project === "string"
      ? event.project
      : typeof properties.project === "string"
        ? properties.project
        : undefined;
  const cwd =
    typeof event.cwd === "string"
      ? event.cwd
      : typeof properties.cwd === "string"
        ? properties.cwd
        : fallbackDirectory;
  const scope =
    sanitizeToken(project) ??
    sanitizeToken(getPathTail(cwd)) ??
    "workspace";
  const pid =
    typeof process !== "undefined" && typeof process.pid === "number"
      ? "p" + process.pid
      : "session";

  return "opencode:" + scope + ":" + pid;
}

function getEventData(event, fallbackDirectory) {
  const payload = getRecord(event);
  const properties = getRecord(payload.properties);
  const tool = getRecord(payload.tool);
  const error = getRecord(payload.error);

  return {
    activeFile:
      typeof payload.file === "string"
        ? payload.file
        : typeof properties.file === "string"
          ? properties.file
          : undefined,
    cwd:
      typeof payload.cwd === "string"
        ? payload.cwd
        : typeof properties.cwd === "string"
          ? properties.cwd
          : fallbackDirectory,
    errorMessage:
      typeof error.message === "string"
        ? error.message
        : typeof payload.message === "string"
          ? payload.message
          : undefined,
    project:
      typeof payload.project === "string"
        ? payload.project
        : typeof properties.project === "string"
          ? properties.project
          : undefined,
    raw: {
      opencodeEvent: event
    },
    toolName:
      typeof tool.name === "string"
        ? tool.name
        : typeof payload.tool === "string"
          ? payload.tool
          : undefined
  };
}

function buildPayload(event, fallbackDirectory) {
  const mappedType = EVENT_TYPE_MAP[event.type];

  if (!mappedType) {
    return null;
  }

  sequenceNumber += 1;

  return {
    cwd:
      typeof event.cwd === "string" && event.cwd.length > 0
        ? event.cwd
        : fallbackDirectory,
    hookPayload: event,
    pid: typeof process !== "undefined" ? process.pid : undefined,
    seqnum: sequenceNumber,
    sessionId: getSessionId(event, fallbackDirectory),
    source: "aisnitch://plugins/opencode",
    type: mappedType,
    data: getEventData(event, fallbackDirectory)
  };
}

async function postPayload(payload) {
  try {
    await fetch(AISNITCH_ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
  } catch {
    // Ignore transport failures so the plugin never blocks OpenCode itself.
  }
}

export const AISnitchPlugin = async ({ directory }) => {
  return {
    event: async ({ event }) => {
      const payload = buildPayload(event, directory);

      if (!payload) {
        return;
      }

      await postPayload(payload);
    }
  };
};
`;
}

function createProcessSetupOutput(): SetupOutput {
  return {
    stderr: (text) => {
      process.stderr.write(text);
    },
    stdout: (text) => {
      process.stdout.write(text);
    },
  };
}

async function defaultConfirm(_diff: string, prompt: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      'AISnitch setup confirmation requires an interactive terminal.',
    );
  }

  const readlineInterface = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = (await readlineInterface.question(prompt)).trim().toLowerCase();

    return answer === '' || answer === 'y' || answer === 'yes';
  } finally {
    readlineInterface.close();
  }
}

function ensureClaudeAISnitchHook(
  groups: readonly ClaudeHookMatcherGroup[],
  hookEventName: ClaudeHookEventName,
  hookUrl: string,
): ClaudeHookMatcherGroup[] {
  const clonedGroups = groups.map((group) => ({
    ...group,
    hooks: group.hooks.map((handler) => ({ ...handler })),
  }));
  const matcher = hookEventName === 'FileChanged'
    ? CLAUDE_FILE_CHANGED_MATCHER
    : undefined;
  const matchingGroup = clonedGroups.find((group) => group.matcher === matcher);

  if (matchingGroup) {
    const existingHook = matchingGroup.hooks.find((handler) => isClaudeAISnitchHook(handler, hookUrl));

    if (existingHook) {
      if (existingHook.async !== true) {
        existingHook.async = true;
      }

      return clonedGroups;
    }

    matchingGroup.hooks.push(createClaudeAISnitchHook(hookUrl));
    return clonedGroups;
  }

  const nextGroup: ClaudeHookMatcherGroup =
    matcher === undefined
      ? {
          hooks: [createClaudeAISnitchHook(hookUrl)],
        }
      : {
          matcher,
          hooks: [createClaudeAISnitchHook(hookUrl)],
        };

  clonedGroups.push(nextGroup);
  return clonedGroups;
}

function createClaudeAISnitchHook(hookUrl: string): ClaudeHookHandler {
  return {
    async: true,
    type: 'http',
    url: hookUrl,
  };
}

function isClaudeAISnitchHook(
  handler: ClaudeHookHandler,
  hookUrl: string,
): boolean {
  return handler.type === 'http' && handler.url === hookUrl;
}

function ensureGeminiAISnitchHook(
  groups: readonly GeminiHookMatcherGroup[],
  hookUrl: string,
): GeminiHookMatcherGroup[] {
  const clonedGroups = groups.map((group) => ({
    ...group,
    hooks: group.hooks.map((handler) => ({ ...handler })),
  }));
  const matchingGroup = clonedGroups.find((group) => group.matcher === '*');

  if (matchingGroup) {
    const existingHook = matchingGroup.hooks.find((handler) =>
      isGeminiAISnitchHook(handler, hookUrl),
    );

    if (existingHook) {
      return clonedGroups;
    }

    matchingGroup.hooks.push(createGeminiAISnitchHook(hookUrl));
    return clonedGroups;
  }

  clonedGroups.push({
    hooks: [createGeminiAISnitchHook(hookUrl)],
    matcher: '*',
  });

  return clonedGroups;
}

function createGeminiAISnitchHook(hookUrl: string): GeminiHookHandler {
  return {
    command: buildGeminiForwardCommand(hookUrl),
    description: 'Forward Gemini CLI hook payloads to AISnitch.',
    name: 'aisnitch-forward',
    timeout: 5_000,
    type: 'command',
  };
}

function buildGeminiForwardCommand(hookUrl: string): string {
  return `sh -c 'curl -fsS -X POST -H "content-type: application/json" --data-binary @- ${hookUrl} >/dev/null 2>&1 || true'`;
}

function isGeminiAISnitchHook(
  handler: GeminiHookHandler,
  hookUrl: string,
): boolean {
  return (
    handler.type === 'command' &&
    typeof handler.command === 'string' &&
    handler.command.includes(hookUrl)
  );
}

function parseClaudeSettings(currentContent: string | null): ClaudeSettings {
  if (currentContent === null || currentContent.trim().length === 0) {
    return {};
  }

  const parsedJson: unknown = JSON.parse(currentContent);

  if (!isRecord(parsedJson)) {
    throw new Error('Claude Code settings.json must contain a JSON object.');
  }

  if (parsedJson.hooks !== undefined && !isRecord(parsedJson.hooks)) {
    throw new Error('Claude Code hooks configuration must be an object.');
  }

  const parsedHooks =
    parsedJson.hooks === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(parsedJson.hooks).map(([hookEventName, value]) => {
            if (!Array.isArray(value)) {
              throw new Error(
                `Claude Code hook group "${hookEventName}" must be an array.`,
              );
            }

            const groups = value.map((group) => parseClaudeHookMatcherGroup(group, hookEventName));

            return [hookEventName, groups];
          }),
        );

  return {
    ...parsedJson,
    hooks: parsedHooks,
  };
}

function parseGeminiSettings(currentContent: string | null): GeminiSettings {
  if (currentContent === null || currentContent.trim().length === 0) {
    return {};
  }

  const parsedJson: unknown = JSON.parse(currentContent);

  if (!isRecord(parsedJson)) {
    throw new Error('Gemini CLI settings.json must contain a JSON object.');
  }

  if (parsedJson.hooks !== undefined && !isRecord(parsedJson.hooks)) {
    throw new Error('Gemini CLI hooks configuration must be an object.');
  }

  const parsedHooks =
    parsedJson.hooks === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(parsedJson.hooks).map(([hookEventName, value]) => {
            if (!Array.isArray(value)) {
              throw new Error(
                `Gemini hook group "${hookEventName}" must be an array.`,
              );
            }

            const groups = value.map((group) =>
              parseGeminiHookMatcherGroup(group, hookEventName),
            );

            return [hookEventName, groups];
          }),
        );

  return {
    ...parsedJson,
    hooks: parsedHooks,
  };
}

function parseClaudeHookMatcherGroup(
  value: unknown,
  hookEventName: string,
): ClaudeHookMatcherGroup {
  if (!isRecord(value)) {
    throw new Error(
      `Claude Code hook matcher group "${hookEventName}" must be an object.`,
    );
  }

  if (!Array.isArray(value.hooks)) {
    throw new Error(
      `Claude Code matcher group "${hookEventName}" must include a hooks array.`,
    );
  }

  const hooks = value.hooks.map((handler) => parseClaudeHookHandler(handler, hookEventName));
  const matcher =
    value.matcher === undefined
      ? undefined
      : typeof value.matcher === 'string'
        ? value.matcher
        : (() => {
            throw new Error(
              `Claude Code matcher "${hookEventName}" must be a string when present.`,
            );
          })();

  return {
    ...value,
    hooks,
    ...(matcher === undefined ? {} : { matcher }),
  };
}

function parseClaudeHookHandler(
  value: unknown,
  hookEventName: string,
): ClaudeHookHandler {
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new Error(
      `Claude Code hook handler "${hookEventName}" must be an object with a string type.`,
    );
  }

  return {
    ...value,
    type: value.type,
  };
}

function parseGeminiHookMatcherGroup(
  value: unknown,
  hookEventName: string,
): GeminiHookMatcherGroup {
  if (!isRecord(value)) {
    throw new Error(
      `Gemini hook matcher group "${hookEventName}" must be an object.`,
    );
  }

  if (!Array.isArray(value.hooks)) {
    throw new Error(
      `Gemini matcher group "${hookEventName}" must include a hooks array.`,
    );
  }

  const hooks = value.hooks.map((handler) =>
    parseGeminiHookHandler(handler, hookEventName),
  );
  const matcher =
    value.matcher === undefined
      ? undefined
      : typeof value.matcher === 'string'
        ? value.matcher
        : (() => {
            throw new Error(
              `Gemini matcher "${hookEventName}" must be a string when present.`,
            );
          })();

  return {
    ...value,
    hooks,
    ...(matcher === undefined ? {} : { matcher }),
  };
}

function parseGeminiHookHandler(
  value: unknown,
  hookEventName: string,
): GeminiHookHandler {
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new Error(
      `Gemini hook handler "${hookEventName}" must be an object with a string type.`,
    );
  }

  return {
    ...value,
    type: value.type,
  };
}

function renderColoredDiff(
  filePath: string,
  currentContent: string | null,
  nextContent: string,
): string {
  const currentLines =
    currentContent === null ? [] : stripTrailingNewline(currentContent).split('\n');
  const nextLines = stripTrailingNewline(nextContent).split('\n');

  return [
    `${ANSI_CYAN}--- ${filePath} (current)${ANSI_RESET}`,
    `${ANSI_CYAN}+++ ${filePath} (proposed)${ANSI_RESET}`,
    ...(currentLines.length === 0
      ? [`${ANSI_RED}-(file does not exist)${ANSI_RESET}`]
      : currentLines.map((line) => `${ANSI_RED}-${line}${ANSI_RESET}`)),
    ...(nextLines.length === 0
      ? [`${ANSI_GREEN}+(empty file)${ANSI_RESET}`]
      : nextLines.map((line) => `${ANSI_GREEN}+${line}${ANSI_RESET}`)),
  ].join('\n');
}

function stripTrailingNewline(value: string): string {
  return value.endsWith('\n') ? value.slice(0, -1) : value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function isBinaryAvailable(binaryName: string): Promise<boolean> {
  const lookupCommand = process.platform === 'win32' ? 'where' : 'which';

  try {
    await execFile(lookupCommand, [binaryName], {
      encoding: 'utf8',
    });
    return true;
  } catch {
    return false;
  }
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function setAdapterEnabled(
  toolName: SetupToolName,
  enabled: boolean,
  options: SetupCliOptions,
): Promise<void> {
  const configOptions = toConfigPathOptions(options);
  const config = await loadConfig(configOptions);
  const currentAdapters = config.adapters;

  const nextAdapters: AISnitchConfig['adapters'] = {
    ...currentAdapters,
    [toolName]: {
      enabled,
    } satisfies AdapterConfig,
  };

  await saveConfig(
    {
      ...config,
      adapters: nextAdapters,
    },
    configOptions,
  );
}

function toConfigPathOptions(options: SetupCliOptions): ConfigPathOptions {
  return options.config ? { configPath: options.config } : {};
}
