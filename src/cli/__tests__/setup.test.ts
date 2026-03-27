import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  ClaudeCodeSetup,
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
    expect(parseSetupToolName('opencode')).toBe('opencode');
    expect(() => parseSetupToolName('codex')).toThrow(/Unsupported setup tool/);
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
});
