import React from 'react';
import { render } from 'ink';

import { AISNITCH_VERSION } from '../package-info.js';
import type { EventBus, PipelineStatus, ToolName } from '../core/index.js';
import { App } from './App.js';

/**
 * @file src/tui/index.tsx
 * @description Foreground Ink renderer entrypoint plus barrel exports for TUI modules.
 * @functions
 *   → renderForegroundTui
 * @exports renderForegroundTui and all TUI modules
 * @see ./App.tsx
 * @see ./live-monitor.ts
 * @see ../../tasks/05-tui/01_tui_foundation-layout.md
 */

/**
 * Props required to render the foreground TUI.
 */
export interface ForegroundTuiOptions {
  readonly configuredAdapters: readonly ToolName[];
  readonly eventBus: EventBus;
  readonly onQuit?: () => void;
  readonly status: PipelineStatus;
}

/**
 * Renders the foreground Ink TUI and resolves once the app exits.
 */
export async function renderForegroundTui(
  options: ForegroundTuiOptions,
): Promise<void> {
  const app = render(
    <App
      configuredAdapters={options.configuredAdapters}
      eventBus={options.eventBus}
      onQuit={options.onQuit}
      status={options.status}
      version={AISNITCH_VERSION}
    />,
  );

  await app.waitUntilExit();
}

export * from './App.js';
export * from './theme.js';
export * from './live-monitor.js';
export * from './components/Header.js';
export * from './components/Layout.js';
export * from './components/StatusBar.js';
