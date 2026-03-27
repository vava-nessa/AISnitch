import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  AiderSetup,
  ClaudeCodeSetup,
  CopilotCLISetup,
  CodexSetup,
  GeminiCLISetup,
  GooseSetup,
  OpenCodeSetup,
  parseSetupToolName,
  runSetupCommand,
} from '../commands/setup.js';
import { loadConfig } from '../../core/config/index.js';

/**
 * @file src/cli/__tests__/setup.test.ts
 * @description Unit coverage for the interactive tool setup implementations.
 * @functions
 *   → createTempHome
 * @exports none
 * @see ../commands/setup.ts
 */

async function createTempHome(): Promise<string> {
  return await mkdtemp(join(tmpdir(), 'aisnitch-setup-'));
}

describe('setup command helpers', () => {
  it('parses supported setup tool names', () => {
    expect(parseSetupToolName('claude-code')).toBe('claude-code');
    expect(parseSetupToolName('gemini-cli')).toBe('gemini-cli');
    expect(parseSetupToolName('aider')).toBe('aider');
    expect(parseSetupToolName('codex')).toBe('codex');
    expect(parseSetupToolName('goose')).toBe('goose');
    expect(parseSetupToolName('copilot-cli')).toBe('copilot-cli');
    expect(parseSetupToolName('opencode')).toBe('opencode');
  });

  it('merges AISnitch HTTP hooks into Claude Code settings without dropping existing hooks', async () => {
    const homeDirectory = await createTempHome();
    const settingsPath = join(homeDirectory, '.claude', 'settings.json');
    const originalContent = `${JSON.stringify(
      {
        theme: 'dark',
        hooks: {
          Stop: [
            {
              hooks: [
                {
                  type: 'command',
                  command: 'echo existing',
                },
              ],
            },
          ],
        },
      },
      null,
      2,
    )}\n`;

    try {
      await mkdir(dirname(settingsPath), { recursive: true });
      await writeFile(settingsPath, originalContent, 'utf8');

      const setup = new ClaudeCodeSetup(4821, {
        binaryExists: () => Promise.resolve(true),
        homeDirectory,
      });

      const diff = await setup.computeDiff();

      expect(diff).toContain('http://localhost:4821/hooks/claude-code');

      await setup.apply();

      const updatedSettings = JSON.parse(
        await readFile(settingsPath, 'utf8'),
      ) as {
        hooks: Record<string, Array<{ hooks: Array<Record<string, unknown>> }>>;
      };

      expect(updatedSettings.hooks.SessionStart).toBeDefined();
      expect(updatedSettings.hooks.Stop).toBeDefined();
      expect(updatedSettings.hooks.Stop ?? []).toHaveLength(1);
      expect(updatedSettings.hooks.Stop?.[0]?.hooks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            command: 'echo existing',
            type: 'command',
          }),
          expect.objectContaining({
            async: true,
            type: 'http',
            url: 'http://localhost:4821/hooks/claude-code',
          }),
        ]),
      );
      expect(
        await readFile(`${settingsPath}.bak`, 'utf8'),
      ).toBe(originalContent);

      await setup.revert();

      expect(await readFile(settingsPath, 'utf8')).toBe(originalContent);
    } finally {
      await rm(homeDirectory, { recursive: true, force: true });
    }
  });

  it('creates and reverts the OpenCode plugin file', async () => {
    const homeDirectory = await createTempHome();

    try {
      const setup = new OpenCodeSetup(4821, {
        binaryExists: () => Promise.resolve(true),
        homeDirectory,
      });

      expect(await setup.detect()).toBe(true);

      await setup.apply();

      const pluginSource = await readFile(setup.getConfigPath(), 'utf8');

      expect(pluginSource).toContain('http://localhost:4821/hooks/opencode');
      expect(pluginSource).toContain('"tool.execute.before": "agent.tool_call"');

      await setup.revert();

      await expect(readFile(setup.getConfigPath(), 'utf8')).rejects.toThrow();
    } finally {
      await rm(homeDirectory, { recursive: true, force: true });
    }
  });

  it('merges AISnitch command hooks into Gemini CLI settings', async () => {
    const homeDirectory = await createTempHome();
    const settingsPath = join(homeDirectory, '.gemini', 'settings.json');

    try {
      await mkdir(dirname(settingsPath), { recursive: true });
      await writeFile(
        settingsPath,
        `${JSON.stringify(
          {
            theme: 'Pro',
            hooks: {
              BeforeTool: [
                {
                  hooks: [
                    {
                      command: 'echo existing',
                      type: 'command',
                    },
                  ],
                  matcher: '*',
                },
              ],
            },
          },
          null,
          2,
        )}\n`,
        'utf8',
      );

      const setup = new GeminiCLISetup(4821, {
        binaryExists: () => Promise.resolve(true),
        homeDirectory,
      });

      await setup.apply();

      const updatedSettings = JSON.parse(
        await readFile(settingsPath, 'utf8'),
      ) as {
        hooks: Record<string, Array<{ hooks: Array<Record<string, unknown>> }>>;
      };
      const beforeToolHooks = updatedSettings.hooks.BeforeTool?.[0]?.hooks ?? [];

      expect(updatedSettings.hooks.BeforeAgent).toBeDefined();
      expect(beforeToolHooks).toContainEqual(
        expect.objectContaining({
          command: 'echo existing',
          type: 'command',
        }),
      );
      expect(
        beforeToolHooks.some(
          (hook) =>
            hook.name === 'aisnitch-forward' &&
            hook.type === 'command' &&
            typeof hook.command === 'string' &&
            hook.command.includes('http://localhost:4821/hooks/gemini-cli'),
        ),
      ).toBe(true);
    } finally {
      await rm(homeDirectory, { recursive: true, force: true });
    }
  });

  it('supports passive codex setup without mutating external files', async () => {
    const homeDirectory = await createTempHome();

    try {
      const setup = new CodexSetup({
        binaryExists: () => Promise.resolve(true),
        homeDirectory,
      });

      expect(await setup.detect()).toBe(true);
      expect(await setup.computeDiff()).toContain('passive Codex log watching');

      await expect(setup.apply()).resolves.toBeUndefined();
      await expect(setup.revert()).resolves.toBeUndefined();
    } finally {
      await rm(homeDirectory, { recursive: true, force: true });
    }
  });

  it('supports passive goose setup without mutating external files', async () => {
    const homeDirectory = await createTempHome();
    const gooseHomeDirectory = join(homeDirectory, '.config', 'goose');

    try {
      await mkdir(gooseHomeDirectory, { recursive: true });

      const setup = new GooseSetup({
        binaryExists: () => Promise.resolve(false),
        gooseHomeDirectory,
        homeDirectory,
      });

      expect(await setup.detect()).toBe(true);
      expect(await setup.computeDiff()).toContain('goosed at http://127.0.0.1:8080');

      await expect(setup.apply()).resolves.toBeUndefined();
      await expect(setup.revert()).resolves.toBeUndefined();
    } finally {
      await rm(homeDirectory, { recursive: true, force: true });
    }
  });

  it('writes aider notifications-command config into ~/.aider.conf.yml', async () => {
    const homeDirectory = await createTempHome();
    const configPath = join(homeDirectory, '.aider.conf.yml');

    try {
      const setup = new AiderSetup(
        {
          binaryExists: () => Promise.resolve(true),
          homeDirectory,
        },
        {
          config: '/tmp/aisnitch/config.json',
        },
      );

      await setup.apply();

      const configContents = await readFile(configPath, 'utf8');

      expect(configContents).toContain('notifications: true');
      expect(configContents).toContain('notifications-command:');
      expect(configContents).toContain('aider-notify');
      expect(configContents).toContain('/tmp/aisnitch/config.json');
    } finally {
      await rm(homeDirectory, { recursive: true, force: true });
    }
  });

  it('creates and reverts the Copilot CLI hook config and bridge script', async () => {
    const workspaceDirectory = await mkdtemp(join(tmpdir(), 'aisnitch-copilot-tests'));

    try {
      await mkdir(join(workspaceDirectory, '.git'), { recursive: true });

      const setup = new CopilotCLISetup(4821, {
        binaryExists: () => Promise.resolve(true),
        workspaceDirectory,
      });

      expect(await setup.detect()).toBe(true);

      await setup.apply();

      const configContent = JSON.parse(
        await readFile(setup.getConfigPath(), 'utf8'),
      ) as {
        hooks: Record<string, Array<Record<string, unknown>>>;
      };
      const scriptPath = join(
        workspaceDirectory,
        '.github',
        'hooks',
        'scripts',
        'aisnitch-forward.mjs',
      );
      const scriptContent = await readFile(scriptPath, 'utf8');

      expect(Object.keys(configContent.hooks)).toEqual(
        expect.arrayContaining([
          'errorOccurred',
          'postToolUse',
          'preToolUse',
          'sessionEnd',
          'sessionStart',
          'userPromptSubmitted',
        ]),
      );
      expect(scriptContent).toContain('http://localhost:4821/hooks/copilot-cli');

      await setup.revert();

      await expect(readFile(setup.getConfigPath(), 'utf8')).rejects.toThrow();
      await expect(readFile(scriptPath, 'utf8')).rejects.toThrow();
    } finally {
      await rm(workspaceDirectory, { recursive: true, force: true });
    }
  });

  it('runs the interactive setup flow and enables the configured adapter', async () => {
    const homeDirectory = await createTempHome();
    const configPath = join(homeDirectory, 'aisnitch', 'config.json');
    const claudeSettingsPath = join(homeDirectory, '.claude', 'settings.json');
    const outputs: string[] = [];

    try {
      await runSetupCommand(
        'claude-code',
        { config: configPath },
        {
          binaryExists: () => Promise.resolve(true),
          claudeSettingsPath,
          confirm: () => Promise.resolve(true),
          homeDirectory,
          output: {
            stderr: (text) => outputs.push(text),
            stdout: (text) => outputs.push(text),
          },
        },
      );

      const aisnitchConfig = await loadConfig({ configPath });
      const claudeSettings = await readFile(claudeSettingsPath, 'utf8');

      expect(aisnitchConfig.adapters['claude-code']).toEqual({ enabled: true });
      expect(claudeSettings).toContain('http://localhost:4821/hooks/claude-code');
      expect(outputs.join('')).toContain('Configured claude-code for AISnitch');
    } finally {
      await rm(homeDirectory, { recursive: true, force: true });
    }
  });

  it('enables codex in AISnitch config through passive setup', async () => {
    const homeDirectory = await createTempHome();
    const configPath = join(homeDirectory, 'aisnitch', 'config.json');
    const outputs: string[] = [];

    try {
      await runSetupCommand(
        'codex',
        { config: configPath },
        {
          binaryExists: () => Promise.resolve(true),
          confirm: () => Promise.resolve(true),
          homeDirectory,
          output: {
            stderr: (text) => outputs.push(text),
            stdout: (text) => outputs.push(text),
          },
        },
      );

      const aisnitchConfig = await loadConfig({ configPath });

      expect(aisnitchConfig.adapters.codex).toEqual({ enabled: true });
      expect(outputs.join('')).toContain('Configured codex for AISnitch');
    } finally {
      await rm(homeDirectory, { recursive: true, force: true });
    }
  });
});
