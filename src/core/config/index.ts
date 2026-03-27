/**
 * @file src/core/config/index.ts
 * @description Placeholder for the future persistent user config loader.
 * @functions
 *   → none
 * @exports CONFIG_MODULE_PLACEHOLDER, ConfigModulePlaceholder
 * @see ../../tasks/01-project-setup/03_project-setup_config-system.md
 */

/**
 * Describes the current state of the config module before file-backed config exists.
 */
export interface ConfigModulePlaceholder {
  readonly area: 'config';
  readonly status: 'pending';
  readonly nextTask: 'project-setup-config-system';
  readonly configPath: '~/.aisnitch/config.json';
}

/**
 * 📖 The config path is already captured here so later modules can converge on
 * one contract instead of inventing slightly different home-directory rules.
 */
export const CONFIG_MODULE_PLACEHOLDER: ConfigModulePlaceholder = {
  area: 'config',
  status: 'pending',
  nextTask: 'project-setup-config-system',
  configPath: '~/.aisnitch/config.json',
};
