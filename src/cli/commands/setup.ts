import { execFile as execFileCallback } from 'node:child_process';
import { access, copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { promisify } from 'node:util';

import JSON5 from 'json5';

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
 * @exports SetupToolName, SetupCliOptions, SetupOutput, ToolSetup, ClaudeCodeSetup, GeminiCLISetup, AiderSetup, GooseSetup, CodexSetup, CopilotCLISetup, OpenClawSetup, OpenCodeSetup, parseSetupToolName, createToolSetup, runSetupCommand
 * @see ../program.ts
 * @see ../runtime.ts
*/

const execFile = promisify(execFileCallback);

const SETUP_TOOL_NAMES = [
  'claude-code',
  'opencode',
  'gemini-cli',
  'aider',
  'codex',
  'goose',
  'copilot-cli',
  'openclaw',
] as const;
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

const COPILOT_HOOK_EVENTS = [
  'sessionStart',
  'sessionEnd',
  'userPromptSubmitted',
  'preToolUse',
  'postToolUse',
  'errorOccurred',
] as const;

type ClaudeHookEventName = (typeof CLAUDE_CODE_HOOK_EVENTS)[number];

interface ClaudeHookHandler extends Record<string, unknown> {
  readonly async?: boolean;
  command?: string;
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

interface CopilotHookHandler extends Record<string, unknown> {
  readonly bash?: string;
  readonly cwd?: string;
  readonly powershell?: string;
  readonly timeoutSec?: number;
  readonly type: string;
}

interface CopilotHooksFile extends Record<string, unknown> {
  readonly hooks?: Record<string, CopilotHookHandler[]>;
  readonly version: number;
}

interface OpenClawHookEntryConfig extends Record<string, unknown> {
  readonly enabled?: boolean;
}

interface OpenClawInternalHooksConfig extends Record<string, unknown> {
  readonly enabled?: boolean;
  readonly entries?: Record<string, OpenClawHookEntryConfig>;
}

interface OpenClawHooksConfig extends Record<string, unknown> {
  readonly internal?: OpenClawInternalHooksConfig;
}

interface OpenClawSettings extends Record<string, unknown> {
  readonly hooks?: OpenClawHooksConfig;
}

interface ToolSetupDependencies {
  readonly aiderConfigPath?: string;
  readonly binaryExists?: (binaryName: string) => Promise<boolean>;
  readonly confirm?: (diff: string, prompt: string) => Promise<boolean>;
  readonly homeDirectory?: string;
  readonly claudeSettingsPath?: string;
  readonly geminiSettingsPath?: string;
  readonly opencodeConfigDirectory?: string;
  readonly codexHomeDirectory?: string;
  readonly gooseHomeDirectory?: string;
  readonly openclawHomeDirectory?: string;
  readonly workspaceDirectory?: string;
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
 * Claude Code setup mutates `~/.claude/settings.json`, installs one tiny local
 * bridge script, and merges one AISnitch command hook per event without
 * overwriting unrelated user hooks.
 */
export class ClaudeCodeSetup extends FileToolSetupBase {
  private readonly settingsPath: string;

  private readonly hookUrl: string;

  private readonly scriptPath: string;

  public constructor(
    httpPort: number,
    dependencies: ToolSetupDependencies = {},
  ) {
    super('claude-code', dependencies.binaryExists);
    this.settingsPath =
      dependencies.claudeSettingsPath ??
      join(dependencies.homeDirectory ?? homedir(), '.claude', 'settings.json');
    this.scriptPath = join(
      dependencies.homeDirectory ?? homedir(),
      '.claude',
      'aisnitch-forward.mjs',
    );
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

  public async computeDiff(): Promise<string> {
    const currentSettingsContent = await readOptionalFile(this.settingsPath);
    const currentScriptContent = await readOptionalFile(this.scriptPath);
    const nextSettingsContent = this.buildNextSettingsContent(currentSettingsContent);
    const nextScriptContent = buildClaudeForwardScriptSource();

    return [
      renderColoredDiff(
        this.settingsPath,
        currentSettingsContent,
        nextSettingsContent,
      ),
      '',
      renderColoredDiff(
        this.scriptPath,
        currentScriptContent,
        nextScriptContent,
      ),
    ].join('\n');
  }

  public async apply(): Promise<void> {
    const currentSettingsContent = await readOptionalFile(this.settingsPath);
    const currentScriptContent = await readOptionalFile(this.scriptPath);
    const nextSettingsContent = this.buildNextSettingsContent(currentSettingsContent);
    const nextScriptContent = buildClaudeForwardScriptSource();

    await mkdir(dirname(this.settingsPath), { recursive: true });
    await mkdir(dirname(this.scriptPath), { recursive: true });

    if (currentSettingsContent !== null) {
      await copyFile(this.settingsPath, this.getBackupPath(this.settingsPath));
    }

    if (currentScriptContent !== null) {
      await copyFile(this.scriptPath, this.getBackupPath(this.scriptPath));
    }

    await writeFile(this.settingsPath, nextSettingsContent, 'utf8');
    await writeFile(this.scriptPath, nextScriptContent, 'utf8');
  }

  public async revert(): Promise<void> {
    await restoreBackupOrRemove(this.settingsPath);
    await restoreBackupOrRemove(this.scriptPath);
  }

  protected buildNextContent(
    currentContent: string | null,
  ): Promise<string> {
    return Promise.resolve(this.buildNextSettingsContent(currentContent));
  }

  private buildNextSettingsContent(currentContent: string | null): string {
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
        this.scriptPath,
      );
    }

    const nextSettings: ClaudeSettings = {
      ...parsedSettings,
      hooks: nextHooks,
    };

    return `${JSON.stringify(nextSettings, null, 2)}\n`;
  }

  private getBackupPath(path: string): string {
    return `${path}.bak`;
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
 * Aider setup is intentionally conservative: AISnitch only toggles top-level
 * notification keys inside the user config and leaves the rest of the YAML alone.
 */
export class AiderSetup extends FileToolSetupBase {
  private readonly configPath: string;

  private readonly notificationCommand: string;

  public constructor(
    dependencies: ToolSetupDependencies = {},
    options: SetupCliOptions = {},
  ) {
    super('aider', dependencies.binaryExists);
    this.configPath =
      dependencies.aiderConfigPath ??
      join(dependencies.homeDirectory ?? homedir(), '.aider.conf.yml');
    this.notificationCommand = buildAiderNotificationCommand(options);
  }

  public async detect(): Promise<boolean> {
    return (
      (await this.binaryExists('aider')) ||
      (await fileExists(this.configPath))
    );
  }

  public getConfigPath(): string {
    return this.configPath;
  }

  protected buildNextContent(
    currentContent: string | null,
  ): Promise<string> {
    let nextContent =
      currentContent ??
      '# AISnitch helper settings for aider notifications.\n';

    nextContent = upsertYamlScalar(nextContent, ['notifications'], {
      key: 'notifications',
      value: 'true',
    });
    nextContent = upsertYamlScalar(
      nextContent,
      ['notifications-command', 'notifications_command'],
      {
        key: 'notifications-command',
        value: JSON.stringify(this.notificationCommand),
      },
    );

    return Promise.resolve(`${nextContent.trimEnd()}\n`);
  }
}

/**
 * Goose is passive for the MVP: AISnitch watches goosed + SQLite sources and
 * this setup flow simply arms the adapter in config with clear operator hints.
 */
export class GooseSetup implements ToolSetup {
  private readonly gooseHomeDirectory: string;

  public readonly toolName = 'goose' as const;

  private readonly binaryExists: (binaryName: string) => Promise<boolean>;

  public constructor(dependencies: ToolSetupDependencies = {}) {
    this.binaryExists = dependencies.binaryExists ?? isBinaryAvailable;
    this.gooseHomeDirectory =
      dependencies.gooseHomeDirectory ??
      join(dependencies.homeDirectory ?? homedir(), '.config', 'goose');
  }

  public async detect(): Promise<boolean> {
    return (
      (await this.binaryExists('goose')) ||
      (await fileExists(this.gooseHomeDirectory))
    );
  }

  public getConfigPath(): string {
    return join(this.gooseHomeDirectory, 'sessions.db');
  }

  public computeDiff(): Promise<string> {
    return Promise.resolve(
      [
        `${ANSI_CYAN}--- ${this.getConfigPath()} (passive source)${ANSI_RESET}`,
        `${ANSI_GREEN}+ Enable passive Goose discovery in AISnitch.${ANSI_RESET}`,
        `${ANSI_GREEN}+ AISnitch will try goosed at http://127.0.0.1:8080 and fall back to SQLite session watching.${ANSI_RESET}`,
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
 * Copilot CLI uses repository-scoped hook configs. AISnitch installs one hook
 * file plus a tiny Node bridge script so Bash and PowerShell can share logic.
 */
export class CopilotCLISetup implements ToolSetup {
  private readonly binaryExists: (binaryName: string) => Promise<boolean>;

  private readonly configPath: string;

  private readonly hookUrl: string;

  private readonly scriptPath: string;

  public readonly toolName = 'copilot-cli' as const;

  private readonly workspaceDirectory: string;

  public constructor(
    httpPort: number,
    dependencies: ToolSetupDependencies = {},
  ) {
    this.binaryExists = dependencies.binaryExists ?? isBinaryAvailable;
    this.workspaceDirectory = dependencies.workspaceDirectory ?? process.cwd();
    this.configPath = join(
      this.workspaceDirectory,
      '.github',
      'hooks',
      'aisnitch.json',
    );
    this.scriptPath = join(
      this.workspaceDirectory,
      '.github',
      'hooks',
      'scripts',
      'aisnitch-forward.mjs',
    );
    this.hookUrl = `http://localhost:${httpPort}/hooks/copilot-cli`;
  }

  public async detect(): Promise<boolean> {
    return (
      (await this.binaryExists('copilot')) ||
      (await fileExists(join(this.workspaceDirectory, '.git'))) ||
      (await fileExists(this.workspaceDirectory))
    );
  }

  public getConfigPath(): string {
    return this.configPath;
  }

  public async computeDiff(): Promise<string> {
    const currentConfigContent = await readOptionalFile(this.configPath);
    const currentScriptContent = await readOptionalFile(this.scriptPath);
    const nextConfigContent = this.buildNextConfigContent(currentConfigContent);
    const nextScriptContent = buildCopilotForwardScriptSource();

    return [
      renderColoredDiff(
        this.configPath,
        currentConfigContent,
        nextConfigContent,
      ),
      '',
      renderColoredDiff(
        this.scriptPath,
        currentScriptContent,
        nextScriptContent,
      ),
    ].join('\n');
  }

  public async apply(): Promise<void> {
    const currentConfigContent = await readOptionalFile(this.configPath);
    const currentScriptContent = await readOptionalFile(this.scriptPath);
    const nextConfigContent = this.buildNextConfigContent(currentConfigContent);
    const nextScriptContent = buildCopilotForwardScriptSource();

    await mkdir(dirname(this.configPath), { recursive: true });
    await mkdir(dirname(this.scriptPath), { recursive: true });

    if (currentConfigContent !== null) {
      await copyFile(this.configPath, this.getBackupPath(this.configPath));
    }

    if (currentScriptContent !== null) {
      await copyFile(this.scriptPath, this.getBackupPath(this.scriptPath));
    }

    await writeFile(this.configPath, nextConfigContent, 'utf8');
    await writeFile(this.scriptPath, nextScriptContent, 'utf8');
  }

  public async revert(): Promise<void> {
    await restoreBackupOrRemove(this.configPath);
    await restoreBackupOrRemove(this.scriptPath);
  }

  private buildNextConfigContent(currentContent: string | null): string {
    const parsedConfig = parseCopilotHooksFile(currentContent);
    const currentHooks = parsedConfig.hooks ?? {};
    const nextHooks: Record<string, CopilotHookHandler[]> = {
      ...currentHooks,
    };

    for (const hookEventName of COPILOT_HOOK_EVENTS) {
      nextHooks[hookEventName] = ensureCopilotAISnitchHook(
        currentHooks[hookEventName] ?? [],
        hookEventName,
        this.hookUrl,
      );
    }

    const nextConfig: CopilotHooksFile = {
      ...parsedConfig,
      hooks: nextHooks,
      version: 1,
    };

    return `${JSON.stringify(nextConfig, null, 2)}\n`;
  }

  private getBackupPath(path: string): string {
    return `${path}.bak`;
  }
}

/**
 * OpenClaw currently documents managed hooks plus bundled hook toggles, not a
 * native outbound AISnitch webhook block. AISnitch therefore installs one
 * managed hook directory and enables the relevant internal hooks in JSON5 config.
 */
export class OpenClawSetup implements ToolSetup {
  private readonly binaryExists: (binaryName: string) => Promise<boolean>;

  private readonly configPath: string;

  private readonly hookDirectory: string;

  private readonly hookDocumentPath: string;

  private readonly hookHandlerPath: string;

  private readonly hookUrl: string;

  private readonly openclawHomeDirectory: string;

  public readonly toolName = 'openclaw' as const;

  public constructor(
    httpPort: number,
    dependencies: ToolSetupDependencies = {},
  ) {
    this.binaryExists = dependencies.binaryExists ?? isBinaryAvailable;
    this.openclawHomeDirectory =
      dependencies.openclawHomeDirectory ??
      join(dependencies.homeDirectory ?? homedir(), '.openclaw');
    this.configPath = join(this.openclawHomeDirectory, 'openclaw.json');
    this.hookDirectory = join(
      this.openclawHomeDirectory,
      'hooks',
      'aisnitch-forward',
    );
    this.hookDocumentPath = join(this.hookDirectory, 'HOOK.md');
    this.hookHandlerPath = join(this.hookDirectory, 'handler.ts');
    this.hookUrl = `http://localhost:${httpPort}/hooks/openclaw`;
  }

  public async detect(): Promise<boolean> {
    return (
      (await this.binaryExists('openclaw')) ||
      (await fileExists(this.openclawHomeDirectory)) ||
      (await fileExists('/Applications/OpenClaw.app'))
    );
  }

  public getConfigPath(): string {
    return this.configPath;
  }

  public async computeDiff(): Promise<string> {
    const currentConfigContent = await readOptionalFile(this.configPath);
    const currentHookDocument = await readOptionalFile(this.hookDocumentPath);
    const currentHookHandler = await readOptionalFile(this.hookHandlerPath);
    const nextConfigContent = this.buildNextConfigContent(currentConfigContent);
    const nextHookDocument = buildOpenClawHookDocumentSource();
    const nextHookHandler = buildOpenClawHookHandlerSource(this.hookUrl);

    return [
      renderColoredDiff(
        this.configPath,
        currentConfigContent,
        nextConfigContent,
      ),
      '',
      renderColoredDiff(
        this.hookDocumentPath,
        currentHookDocument,
        nextHookDocument,
      ),
      '',
      renderColoredDiff(
        this.hookHandlerPath,
        currentHookHandler,
        nextHookHandler,
      ),
    ].join('\n');
  }

  public async apply(): Promise<void> {
    const currentConfigContent = await readOptionalFile(this.configPath);
    const currentHookDocument = await readOptionalFile(this.hookDocumentPath);
    const currentHookHandler = await readOptionalFile(this.hookHandlerPath);
    const nextConfigContent = this.buildNextConfigContent(currentConfigContent);
    const nextHookDocument = buildOpenClawHookDocumentSource();
    const nextHookHandler = buildOpenClawHookHandlerSource(this.hookUrl);

    await mkdir(dirname(this.configPath), { recursive: true });
    await mkdir(this.hookDirectory, { recursive: true });

    if (currentConfigContent !== null) {
      await copyFile(this.configPath, this.getBackupPath(this.configPath));
    }

    if (currentHookDocument !== null) {
      await copyFile(
        this.hookDocumentPath,
        this.getBackupPath(this.hookDocumentPath),
      );
    }

    if (currentHookHandler !== null) {
      await copyFile(
        this.hookHandlerPath,
        this.getBackupPath(this.hookHandlerPath),
      );
    }

    await writeFile(this.configPath, nextConfigContent, 'utf8');
    await writeFile(this.hookDocumentPath, nextHookDocument, 'utf8');
    await writeFile(this.hookHandlerPath, nextHookHandler, 'utf8');
  }

  public async revert(): Promise<void> {
    await restoreBackupOrRemove(this.configPath);
    await restoreBackupOrRemove(this.hookDocumentPath);
    await restoreBackupOrRemove(this.hookHandlerPath);
  }

  private buildNextConfigContent(currentContent: string | null): string {
    const parsedConfig = parseOpenClawSettings(currentContent);
    const currentHooks = parsedConfig.hooks ?? {};
    const currentInternalHooks = currentHooks.internal ?? {};
    const currentEntries = currentInternalHooks.entries ?? {};
    const nextEntries: Record<string, OpenClawHookEntryConfig> = {
      ...currentEntries,
      'aisnitch-forward': {
        ...(currentEntries['aisnitch-forward'] ?? {}),
        enabled: true,
      },
      'command-logger': {
        ...(currentEntries['command-logger'] ?? {}),
        enabled: true,
      },
      'session-memory': {
        ...(currentEntries['session-memory'] ?? {}),
        enabled: true,
      },
    };
    const nextConfig: OpenClawSettings = {
      ...parsedConfig,
      hooks: {
        ...currentHooks,
        internal: {
          ...currentInternalHooks,
          enabled: true,
          entries: nextEntries,
        },
      },
    };

    return `${JSON.stringify(nextConfig, null, 2)}\n`;
  }

  private getBackupPath(path: string): string {
    return `${path}.bak`;
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

  if (toolName === 'aider') {
    return new AiderSetup(dependencies, options);
  }

  if (toolName === 'goose') {
    return new GooseSetup(dependencies);
  }

  if (toolName === 'codex') {
    return new CodexSetup(dependencies);
  }

  if (toolName === 'copilot-cli') {
    return new CopilotCLISetup(httpPort, dependencies);
  }

  if (toolName === 'openclaw') {
    return new OpenClawSetup(httpPort, dependencies);
  }

  if (toolName === 'opencode') {
    return new OpenCodeSetup(httpPort, dependencies);
  }

  return new ClaudeCodeSetup(httpPort, dependencies);
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
  "permission.asked": "agent.asking_user",
  "session.compacted": "agent.compact",
  "session.created": "session.start",
  "session.deleted": "session.end",
  "session.error": "agent.error",
  "session.idle": "agent.idle",
  "tool.execute.before": "agent.tool_call"
};

let sequenceNumber = 0;
const OBSERVED_SESSION_IDS = new Set();
const MESSAGE_ROLE_BY_ID = new Map();
const STARTED_MESSAGE_IDS = new Set();

function getRecord(value) {
  return typeof value === "object" && value !== null ? value : {};
}

function getString(value) {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
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

function getMessageId(event) {
  const properties = getRecord(event.properties);
  const info = getRecord(properties.info);
  const part = getRecord(properties.part);

  return (
    getString(info.id) ??
    getString(part.messageID) ??
    getString(part.messageId)
  );
}

function getMessageRole(event) {
  const properties = getRecord(event.properties);
  const info = getRecord(properties.info);

  return getString(info.role);
}

function getMessageText(event) {
  const properties = getRecord(event.properties);
  const part = getRecord(properties.part);

  return (
    getString(part.text) ??
    getString(event.text) ??
    getString(getRecord(properties.message).text)
  );
}

function getToolInput(event) {
  const payload = getRecord(event);
  const properties = getRecord(payload.properties);
  const output = getRecord(payload.output);
  const args = getRecord(payload.args);
  const outputArgs = getRecord(output.args);
  const propertyArgs = getRecord(properties.args);
  const sourceArgs = Object.keys(args).length > 0
    ? args
    : Object.keys(outputArgs).length > 0
      ? outputArgs
      : propertyArgs;
  const command = getString(sourceArgs.command) ?? getString(sourceArgs.cmd);
  const filePath =
    getString(sourceArgs.filePath) ??
    getString(sourceArgs.file_path) ??
    getString(sourceArgs.path);

  if (!command && !filePath) {
    return undefined;
  }

  return {
    command,
    filePath
  };
}

function getEventData(event, fallbackDirectory, overrides = {}) {
  const payload = getRecord(event);
  const properties = getRecord(payload.properties);
  const info = getRecord(properties.info);
  const infoPath = getRecord(info.path);
  const infoTokens = getRecord(info.tokens);
  const tool = getRecord(payload.tool);
  const error = getRecord(payload.error);
  const toolInput = getToolInput(event);
  const inputTokens = typeof infoTokens.input === "number" ? infoTokens.input : 0;
  const outputTokens = typeof infoTokens.output === "number" ? infoTokens.output : 0;
  const reasoningTokens = typeof infoTokens.reasoning === "number" ? infoTokens.reasoning : 0;
  const tokensUsed = inputTokens + outputTokens + reasoningTokens;
  const rawOverrides = getRecord(overrides.raw);

  return {
    activeFile:
      typeof payload.file === "string"
        ? payload.file
        : typeof properties.file === "string"
          ? properties.file
          : toolInput?.filePath,
    cwd:
      typeof payload.cwd === "string"
        ? payload.cwd
        : typeof properties.cwd === "string"
          ? properties.cwd
          : getString(infoPath.cwd) ??
            getString(infoPath.root) ??
            fallbackDirectory,
    errorMessage:
      typeof error.message === "string"
        ? error.message
        : typeof payload.message === "string"
          ? payload.message
          : undefined,
    model:
      getString(info.modelID)
        ? ((getString(info.providerID) ?? "unknown") + "/" + getString(info.modelID))
        : undefined,
    project:
      typeof payload.project === "string"
        ? payload.project
        : getString(properties.project)
          ? properties.project
          : typeof infoPath.root === "string"
            ? getPathTail(infoPath.root)
            : undefined,
    tokensUsed: tokensUsed > 0 ? tokensUsed : undefined,
    toolInput,
    toolName:
      typeof tool.name === "string"
        ? tool.name
        : typeof payload.tool === "string"
          ? payload.tool
          : undefined,
    raw: {
      opencodeEvent: event,
      ...rawOverrides
    }
  };
}

function createPayload(type, event, fallbackDirectory, overrides) {
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
    type,
    data: getEventData(event, fallbackDirectory, overrides)
  };
}

function buildPayloads(event, fallbackDirectory) {
  const eventType = getString(event.type);

  if (!eventType) {
    return [];
  }

  const payloads = [];
  const sessionId = getSessionId(event, fallbackDirectory);

  if (eventType === "session.updated" && !OBSERVED_SESSION_IDS.has(sessionId)) {
    OBSERVED_SESSION_IDS.add(sessionId);
    payloads.push(createPayload("session.start", event, fallbackDirectory));
    return payloads;
  }

  if (eventType === "message.updated") {
    const messageId = getMessageId(event);
    const role = getMessageRole(event);

    if (messageId && role) {
      MESSAGE_ROLE_BY_ID.set(messageId, role);
    }

    if (role === "assistant") {
      payloads.push(createPayload("agent.streaming", event, fallbackDirectory));
    }

    return payloads;
  }

  if (eventType === "message.part.updated") {
    const messageId = getMessageId(event);
    const role = messageId ? MESSAGE_ROLE_BY_ID.get(messageId) : undefined;
    const text = getMessageText(event);

    if (role === "user") {
      if (messageId && !STARTED_MESSAGE_IDS.has(messageId)) {
        STARTED_MESSAGE_IDS.add(messageId);
        payloads.push(
          createPayload("task.start", event, fallbackDirectory, {
            raw: {
              prompt: text
            }
          })
        );
      }

      return payloads;
    }

    payloads.push(
      createPayload("agent.streaming", event, fallbackDirectory, {
        raw: {
          streamingText: text
        }
      })
    );

    return payloads;
  }

  const mappedType = EVENT_TYPE_MAP[eventType];

  if (!mappedType) {
    return payloads;
  }

  if (mappedType === "session.start") {
    OBSERVED_SESSION_IDS.add(sessionId);
  }

  payloads.push(createPayload(mappedType, event, fallbackDirectory));
  return payloads;
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
      for (const payload of buildPayloads(event, directory)) {
        await postPayload(payload);
      }
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
  scriptPath: string,
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
    matchingGroup.hooks = matchingGroup.hooks.filter(
      (handler) => !isLegacyClaudeAISnitchHttpHook(handler, hookUrl),
    );
    const existingHook = matchingGroup.hooks.find((handler) =>
      isClaudeAISnitchHook(handler, hookEventName, hookUrl, scriptPath),
    );

    if (existingHook) {
      if (existingHook.async !== true) {
        existingHook.async = true;
      }

      return clonedGroups;
    }

    matchingGroup.hooks.push(
      createClaudeAISnitchHook(hookEventName, hookUrl, scriptPath),
    );
    return clonedGroups;
  }

  const nextGroup: ClaudeHookMatcherGroup =
    matcher === undefined
      ? {
          hooks: [createClaudeAISnitchHook(hookEventName, hookUrl, scriptPath)],
        }
      : {
          matcher,
          hooks: [createClaudeAISnitchHook(hookEventName, hookUrl, scriptPath)],
        };

  clonedGroups.push(nextGroup);
  return clonedGroups;
}

function createClaudeAISnitchHook(
  hookEventName: ClaudeHookEventName,
  hookUrl: string,
  scriptPath: string,
): ClaudeHookHandler {
  return {
    async: true,
    command: buildClaudeForwardCommand(hookEventName, hookUrl, scriptPath),
    type: 'command',
  };
}

function isClaudeAISnitchHook(
  handler: ClaudeHookHandler,
  hookEventName: ClaudeHookEventName,
  hookUrl: string,
  scriptPath: string,
): boolean {
  return (
    handler.type === 'command' &&
    typeof handler.command === 'string' &&
    handler.command ===
      buildClaudeForwardCommand(hookEventName, hookUrl, scriptPath)
  );
}

function isLegacyClaudeAISnitchHttpHook(
  handler: ClaudeHookHandler,
  hookUrl: string,
): boolean {
  return handler.type === 'http' && handler.url === hookUrl;
}

function buildClaudeForwardCommand(
  hookEventName: ClaudeHookEventName,
  hookUrl: string,
  scriptPath: string,
): string {
  return `node ${shellEscapeSingle(scriptPath)} ${hookEventName} ${shellEscapeSingle(hookUrl)}`;
}

function buildClaudeForwardScriptSource(): string {
  return `#!/usr/bin/env node
/**
 * AISnitch Claude Code hook bridge
 *
 * 📖 Claude Code currently exposes command hooks fed through stdin JSON.
 * This bridge keeps the Claude config valid while still forwarding every
 * selected hook event into the local AISnitch HTTP receiver.
 */

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readInput() {
  const chunks = [];

  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
  }

  return chunks.join("");
}

async function main() {
  const hookEventName = process.argv[2] ?? "unknown";
  const endpoint = process.argv[3] ?? "http://localhost:4821/hooks/claude-code";
  const rawInput = await readInput();
  let payload = {};

  if (rawInput.trim().length > 0) {
    try {
      const parsedPayload = JSON.parse(rawInput);

      if (isRecord(parsedPayload)) {
        payload = parsedPayload;
      }
    } catch {
      payload = {
        raw: rawInput
      };
    }
  }

  try {
    await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        ...payload,
        hook_event_name: hookEventName
      })
    });
  } catch {
    // Claude hooks must stay fire-and-forget for observability only.
  }
}

void main().catch(() => {
  // Never bubble hook bridge failures back into Claude Code itself.
});
`;
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

function ensureCopilotAISnitchHook(
  handlers: readonly CopilotHookHandler[],
  hookEventName: (typeof COPILOT_HOOK_EVENTS)[number],
  hookUrl: string,
): CopilotHookHandler[] {
  const clonedHandlers = handlers.map((handler) => ({ ...handler }));
  const existingHook = clonedHandlers.find((handler) =>
    isCopilotAISnitchHook(handler, hookEventName, hookUrl),
  );

  if (existingHook) {
    return clonedHandlers;
  }

  clonedHandlers.push(createCopilotAISnitchHook(hookEventName, hookUrl));
  return clonedHandlers;
}

function createCopilotAISnitchHook(
  hookEventName: (typeof COPILOT_HOOK_EVENTS)[number],
  hookUrl: string,
): CopilotHookHandler {
  const command = buildCopilotForwardCommand(hookEventName, hookUrl);

  return {
    bash: command,
    cwd: '.github/hooks',
    powershell: command,
    timeoutSec: 10,
    type: 'command',
  };
}

function buildCopilotForwardCommand(
  hookEventName: (typeof COPILOT_HOOK_EVENTS)[number],
  hookUrl: string,
): string {
  return `node ./scripts/aisnitch-forward.mjs ${hookEventName} ${hookUrl}`;
}

function isCopilotAISnitchHook(
  handler: CopilotHookHandler,
  hookEventName: (typeof COPILOT_HOOK_EVENTS)[number],
  hookUrl: string,
): boolean {
  return (
    handler.type === 'command' &&
    typeof handler.bash === 'string' &&
    handler.bash.includes(`aisnitch-forward.mjs ${hookEventName}`) &&
    handler.bash.includes(hookUrl)
  );
}

function buildCopilotForwardScriptSource(): string {
  return `#!/usr/bin/env node
/**
 * AISnitch Copilot CLI hook bridge
 *
 * 📖 Copilot hooks are repository-scoped and synchronous. This script keeps
 * the hook config tiny by tagging the incoming stdin payload with the hook
 * name, then forwarding it to the local AISnitch HTTP receiver.
 */

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readInput() {
  const chunks = [];

  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
  }

  return chunks.join("");
}

async function main() {
  const hookEventName = process.argv[2] ?? "unknown";
  const endpoint = process.argv[3] ?? "http://localhost:4821/hooks/copilot-cli";
  const rawInput = await readInput();
  let payload = {};

  if (rawInput.trim().length > 0) {
    try {
      const parsedPayload = JSON.parse(rawInput);

      if (isRecord(parsedPayload)) {
        payload = parsedPayload;
      }
    } catch {
      payload = {
        raw: rawInput
      };
    }
  }

  try {
    await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        ...payload,
        hook_event_name: hookEventName
      })
    });
  } catch {
    // Ignore transport failures so Copilot itself never gets blocked by AISnitch.
  }
}

void main();
`;
}

function buildOpenClawHookDocumentSource(): string {
  return `---
name: aisnitch-forward
description: "Forward key OpenClaw lifecycle events to AISnitch"
metadata:
  {
    "openclaw": {
      "emoji": "🛰️",
      "events": [
        "gateway:startup",
        "agent:bootstrap",
        "command:new",
        "command:reset",
        "command:stop",
        "session:compact:before"
      ]
    }
  }
---

# AISnitch Forwarder

📖 This managed hook forwards high-signal OpenClaw lifecycle events into the
local AISnitch HTTP receiver. Tool-result details are complemented by AISnitch's
transcript watcher, while this hook covers startup, command, reset, stop, and
pre-compaction lifecycle changes with near-zero latency.
`;
}

function buildOpenClawHookHandlerSource(hookUrl: string): string {
  return `/**
 * AISnitch OpenClaw managed hook
 *
 * 📖 OpenClaw's current public docs describe managed hooks plus bundled
 * command/session hooks. This handler forwards those lifecycle events to the
 * local AISnitch HTTP ingress and stays fire-and-forget so OpenClaw never
 * blocks on observability.
 */

const AISNITCH_ENDPOINT = ${JSON.stringify(hookUrl)};
const ENABLED_EVENTS = new Set([
  "gateway:startup",
  "agent:bootstrap",
  "command:new",
  "command:reset",
  "command:stop",
  "session:compact:before"
]);

function getRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value
    : {};
}

function getEventName(event) {
  if (typeof event.event === "string" && event.event.length > 0) {
    return event.event;
  }

  if (typeof event.type !== "string" || event.type.length === 0) {
    return undefined;
  }

  if (typeof event.action !== "string" || event.action.length === 0) {
    return event.type;
  }

  if (event.type === "command" && !event.action.startsWith("/") && !event.action.includes(":")) {
    return "command:" + event.action;
  }

  return event.type + ":" + event.action;
}

function getPrimaryMessage(event) {
  const context = getRecord(event.context);

  if (typeof event.message === "string" && event.message.length > 0) {
    return event.message;
  }

  if (typeof context.content === "string" && context.content.length > 0) {
    return context.content;
  }

  if (typeof context.bodyForAgent === "string" && context.bodyForAgent.length > 0) {
    return context.bodyForAgent;
  }

  if (typeof context.body === "string" && context.body.length > 0) {
    return context.body;
  }

  if (Array.isArray(event.messages) && typeof event.messages[0] === "string") {
    return event.messages[0];
  }

  return undefined;
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
    // Ignore local transport failures so OpenClaw keeps running.
  }
}

export default async function aisnitchForward(event) {
  const eventName = getEventName(getRecord(event));

  if (!eventName || !ENABLED_EVENTS.has(eventName)) {
    return;
  }

  const context = getRecord(event.context);

  await postPayload({
    action: typeof event.action === "string" ? event.action : undefined,
    context,
    cwd:
      typeof context.workspaceDir === "string"
        ? context.workspaceDir
        : typeof context.cwd === "string"
          ? context.cwd
          : undefined,
    event: eventName,
    message: getPrimaryMessage(getRecord(event)),
    messages: Array.isArray(event.messages) ? event.messages : undefined,
    pid: typeof process !== "undefined" ? process.pid : undefined,
    raw: event,
    sessionKey:
      typeof event.sessionKey === "string" && event.sessionKey.length > 0
        ? event.sessionKey
        : typeof context.sessionKey === "string" && context.sessionKey.length > 0
          ? context.sessionKey
          : undefined,
    timestamp:
      event.timestamp instanceof Date
        ? event.timestamp.toISOString()
        : typeof event.timestamp === "string"
          ? event.timestamp
          : undefined,
    type: typeof event.type === "string" ? event.type : undefined
  });
}
`;
}

function parseOpenClawSettings(currentContent: string | null): OpenClawSettings {
  if (currentContent === null || currentContent.trim().length === 0) {
    return {};
  }

  const parsedConfig: unknown = JSON5.parse(currentContent);

  if (!isRecord(parsedConfig)) {
    throw new Error('OpenClaw openclaw.json must contain an object.');
  }

  if (parsedConfig.hooks !== undefined && !isRecord(parsedConfig.hooks)) {
    throw new Error('OpenClaw hooks config must be an object when present.');
  }

  if (
    isRecord(parsedConfig.hooks) &&
    parsedConfig.hooks.internal !== undefined &&
    !isRecord(parsedConfig.hooks.internal)
  ) {
    throw new Error('OpenClaw hooks.internal config must be an object when present.');
  }

  return parsedConfig;
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

function parseCopilotHooksFile(currentContent: string | null): CopilotHooksFile {
  if (currentContent === null || currentContent.trim().length === 0) {
    return {
      version: 1,
    };
  }

  const parsedJson: unknown = JSON.parse(currentContent);

  if (!isRecord(parsedJson)) {
    throw new Error('Copilot hooks config must contain a JSON object.');
  }

  if (parsedJson.version !== undefined && typeof parsedJson.version !== 'number') {
    throw new Error('Copilot hooks config version must be a number.');
  }

  if (parsedJson.hooks !== undefined && !isRecord(parsedJson.hooks)) {
    throw new Error('Copilot hooks configuration must be an object.');
  }

  const parsedHooks =
    parsedJson.hooks === undefined
      ? undefined
      : Object.fromEntries(
          Object.entries(parsedJson.hooks).map(([hookEventName, value]) => {
            if (!Array.isArray(value)) {
              throw new Error(
                `Copilot hook group "${hookEventName}" must be an array.`,
              );
            }

            const handlers = value.map((handler) =>
              parseCopilotHookHandler(handler, hookEventName),
            );

            return [hookEventName, handlers];
          }),
        );

  return {
    ...parsedJson,
    hooks: parsedHooks,
    version: parsedJson.version === undefined ? 1 : parsedJson.version,
  } satisfies CopilotHooksFile;
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

function parseCopilotHookHandler(
  value: unknown,
  hookEventName: string,
): CopilotHookHandler {
  if (!isRecord(value) || typeof value.type !== 'string') {
    throw new Error(
      `Copilot hook handler "${hookEventName}" must be an object with a string type.`,
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

async function readOptionalFile(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
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

function shellEscapeSingle(value: string): string {
  // 📖 Claude stores hook commands as one shell string, so paths and URLs
  // must be quoted defensively to survive spaces and apostrophes.
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

async function restoreBackupOrRemove(path: string): Promise<void> {
  const backupPath = `${path}.bak`;

  if (await fileExists(backupPath)) {
    await copyFile(backupPath, path);
    await rm(backupPath, { force: true });
    return;
  }

  await rm(path, { force: true });
}

function buildAiderNotificationCommand(options: SetupCliOptions): string {
  const cliArgs = [process.execPath, resolveCurrentCliEntryPath(), 'aider-notify'];

  if (options.config) {
    cliArgs.push('--config', options.config);
  }

  return cliArgs.map((argument) => JSON.stringify(argument)).join(' ');
}

function resolveCurrentCliEntryPath(): string {
  const cliEntryPath = process.argv[1];

  if (!cliEntryPath || cliEntryPath.trim().length === 0) {
    throw new Error('Unable to resolve the current AISnitch CLI entry path.');
  }

  return cliEntryPath;
}

function upsertYamlScalar(
  content: string,
  aliases: readonly string[],
  nextEntry: {
    readonly key: string;
    readonly value: string;
  },
): string {
  const lines = content.replace(/\r\n/gu, '\n').split('\n');
  const matcher = new RegExp(
    `^\\s*#?\\s*(?:${aliases.map(escapeForRegExp).join('|')})\\s*:`,
    'u',
  );
  const nextLines: string[] = [];
  let replaced = false;

  for (const line of lines) {
    if (matcher.test(line)) {
      if (!replaced) {
        nextLines.push(`${nextEntry.key}: ${nextEntry.value}`);
        replaced = true;
      }

      continue;
    }

    nextLines.push(line);
  }

  if (!replaced) {
    if (nextLines.length > 0 && nextLines.at(-1)?.trim().length !== 0) {
      nextLines.push('');
    }

    nextLines.push(`${nextEntry.key}: ${nextEntry.value}`);
  }

  return nextLines.join('\n');
}

function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
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
