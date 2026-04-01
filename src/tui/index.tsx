import React from 'react';
import { render } from 'ink';
import { withFullScreen } from 'fullscreen-ink';
import WebSocket from 'ws';

import { AISNITCH_VERSION } from '../package-info.js';
import type { EventBus, PipelineStatus, ToolName } from '../core/index.js';
import { App } from './App.js';
import { ManagedDaemonApp } from './ManagedDaemonApp.js';
import type { ManagedTuiSnapshot, TuiInitialFilters } from './types.js';

/**
 * @file src/tui/index.tsx
 * @description Foreground Ink renderer entrypoint plus barrel exports for TUI modules.
 * @functions
 *   → renderForegroundTui
 * @exports renderForegroundTui and all TUI modules
 * @see ./App.tsx
 * @see ./live-monitor.ts
 * @see ../../tasks/05-tui/01_tui_foundation-layout_DONE.md
 */

/**
 * Props required to render the foreground TUI.
 */
export interface ForegroundTuiOptions {
  readonly configuredAdapters: readonly ToolName[];
  readonly eventBus: EventBus;
  readonly initialFilters?: TuiInitialFilters;
  readonly onQuit?: () => void;
  readonly status: PipelineStatus;
}

/**
 * Props required to render the attached WebSocket TUI.
 */
export interface AttachedTuiOptions {
  readonly configuredAdapters: readonly ToolName[];
  readonly initialFilters?: TuiInitialFilters;
  readonly onQuit?: () => void;
  readonly status: {
    readonly consumerCount: number;
    readonly eventCount: number;
    readonly uptimeMs: number;
  };
  readonly wsUrl: string;
}

/**
 * Props required by the managed daemon dashboard renderer.
 */
export interface ManagedTuiOptions {
  readonly initialFilters?: TuiInitialFilters;
  readonly initialSnapshot: ManagedTuiSnapshot;
  readonly onQuit?: () => void;
  readonly refreshSnapshot: () => Promise<ManagedTuiSnapshot>;
  readonly toggleDaemon: () => Promise<ManagedTuiSnapshot>;
}

/**
 * Renders the foreground Ink TUI and resolves once the app exits.
 */
export async function renderForegroundTui(
  options: ForegroundTuiOptions,
): Promise<void> {
  const ink = withFullScreen(
    <App
      configuredAdapters={options.configuredAdapters}
      initialFilters={options.initialFilters}
      onQuit={options.onQuit}
      source={{
        kind: 'event-bus',
        eventBus: options.eventBus,
      }}
      status={{
        connected: true,
        connectionLabel: 'Foreground Bus',
        consumerCount: options.status.websocket.consumerCount,
        eventCount: options.status.eventBus.publishedEvents,
        uptimeMs: options.status.uptimeMs,
      }}
      version={AISNITCH_VERSION}
    />,
  );

  await ink.start();
  await ink.waitUntilExit;
}

/**
 * Renders the TUI against a remote AISnitch daemon over WebSocket.
 */
export async function renderAttachedTui(
  options: AttachedTuiOptions,
): Promise<void> {
  const socket = new WebSocket(options.wsUrl);
  const app = render(
    <App
      configuredAdapters={options.configuredAdapters}
      initialFilters={options.initialFilters}
      onQuit={options.onQuit}
      source={{
        kind: 'websocket',
        socket,
      }}
      status={{
        connected: true,
        connectionLabel: 'Attached Stream',
        consumerCount: options.status.consumerCount,
        eventCount: options.status.eventCount,
        uptimeMs: options.status.uptimeMs,
      }}
      version={AISNITCH_VERSION}
    />,
  );

  try {
    await app.waitUntilExit();
  } finally {
    if (
      socket.readyState === WebSocket.OPEN ||
      socket.readyState === WebSocket.CONNECTING
    ) {
      socket.close();
    }
  }
}

/**
 * Renders the PM2-style dashboard that can start/stop and attach to the daemon.
 */
export async function renderManagedTui(
  options: ManagedTuiOptions,
): Promise<void> {
  const app = render(
    <ManagedDaemonApp
      initialFilters={options.initialFilters}
      initialSnapshot={options.initialSnapshot}
      onQuit={options.onQuit}
      refreshSnapshot={options.refreshSnapshot}
      toggleDaemon={options.toggleDaemon}
      version={AISNITCH_VERSION}
    />,
  );

  await app.waitUntilExit();
}

export * from './App.js';
export * from './ManagedDaemonApp.js';
export * from './types.js';
export * from './filters.js';
export * from './theme.js';
export * from './live-monitor.js';
export * from './hooks/useEventStream.js';
export * from './hooks/useKeyBinds.js';
export * from './hooks/useSessions.js';
export * from './components/EventLine.js';
export * from './components/EventStream.js';
export * from './components/FilterBar.js';
export * from './components/GlobalBadge.js';
export * from './components/Header.js';
export * from './components/HelpOverlay.js';
export * from './components/Layout.js';
export * from './components/SessionPanel.js';
export * from './components/StatusBar.js';
