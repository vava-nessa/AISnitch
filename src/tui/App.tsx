import React, { useEffect, useState } from 'react';
import { Box, useApp, useStdout } from 'ink';

import type { ToolName } from '../core/index.js';
import { EventStream } from './components/EventStream.js';
import { FilterBar } from './components/FilterBar.js';
import { Header } from './components/Header.js';
import { HelpOverlay } from './components/HelpOverlay.js';
import { Panel, PanelStack } from './components/Layout.js';
import { SessionPanel } from './components/SessionPanel.js';
import { StatusBar } from './components/StatusBar.js';
import {
  applyEventFilters,
  applySessionFilters,
  countActiveFilters,
} from './filters.js';
import { TUI_THEME } from './theme.js';
import type { TuiInitialFilters, TuiStatusSnapshot } from './types.js';
import {
  getPendingFrozenEventCount,
  getVisibleEventWindow,
  type EventStreamSource,
  useEventStream,
} from './hooks/useEventStream.js';
import { useKeyBinds } from './hooks/useKeyBinds.js';
import {
  deriveGlobalActivityStatus,
  useSessions,
} from './hooks/useSessions.js';

/**
 * @file src/tui/App.tsx
 * @description Root Ink application for the AISnitch terminal UI foundation, including layout chrome and live summary state.
 * @functions
 *   → App
 * @exports App, type AppProps
 * @see ./index.tsx
 * @see ./hooks/useEventStream.ts
 * @see ./components/EventStream.tsx
 * @see ./components/Header.tsx
 * @see ./components/Layout.tsx
 * @see ./components/StatusBar.tsx
 */

/**
 * Props injected by the foreground runtime renderer.
 */
export interface AppProps {
  readonly configuredAdapters: readonly ToolName[];
  readonly initialFilters?: TuiInitialFilters;
  readonly onQuit?: () => void;
  readonly source: EventStreamSource;
  readonly status: TuiStatusSnapshot;
  readonly version: string;
}

/**
 * 📖 This first TUI pass focuses on shape and feel: strong header, framed
 * panels, responsive composition, and just enough live state to prove the
 * foreground runtime is now a real terminal app instead of a raw log stream.
 */
export function App({
  configuredAdapters,
  initialFilters,
  onQuit,
  source,
  status,
  version,
}: AppProps): React.JSX.Element {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [columns, setColumns] = useState(stdout.columns ?? 80);
  const [uptimeMs, setUptimeMs] = useState(status.uptimeMs);
  const initialTuiFilters = {
    eventType: initialFilters?.type ?? null,
    query: initialFilters?.query ?? '',
    tool: initialFilters?.tool ?? null,
  };

  useEffect(() => {
    const handleResize = (): void => {
      setColumns(stdout.columns ?? 80);
    };

    stdout.on('resize', handleResize);

    return () => {
      stdout.off('resize', handleResize);
    };
  }, [stdout]);

  const compactLayout = columns < 112;
  const eventStream = useEventStream(
    source,
    {
      initialTotalEvents: status.eventCount,
      visibleCount: compactLayout ? 4 : 6,
    },
  );
  const sessions = useSessions(eventStream.bufferedEvents);
  const [frozenFilteredEventCount, setFrozenFilteredEventCount] = useState<
    number | null
  >(null);
  const keyBinds = useKeyBinds({
    initialFilters: initialTuiFilters,
    onClearStream: () => {
      eventStream.clearEvents();
      setFrozenFilteredEventCount(null);
    },
    onQuit: () => {
      onQuit?.();
      exit();
    },
    onToggleFreeze: () => {
      const nextFrozen = !eventStream.isFrozen;

      eventStream.toggleFrozen();
      setFrozenFilteredEventCount(nextFrozen ? displayedEvents.length : null);
    },
    toolOptions: configuredAdapters,
  });
  const displayedEvents = applyEventFilters(
    eventStream.bufferedEvents,
    keyBinds.filters,
  );
  const displayedSessions = applySessionFilters(sessions, keyBinds.filters);
  const pendingFilteredEvents = eventStream.isFrozen
    ? getPendingFrozenEventCount(
        displayedEvents.length,
        frozenFilteredEventCount,
      )
    : 0;
  const visibleEvents = getVisibleEventWindow(displayedEvents, {
    frozenAtTotalEvents: eventStream.isFrozen ? frozenFilteredEventCount : null,
    totalEvents: displayedEvents.length,
    visibleCount: compactLayout ? 4 : 6,
  });
  const globalStatus = deriveGlobalActivityStatus(displayedSessions);
  const activeFilterCount = countActiveFilters(keyBinds.filters);

  useEffect(() => {
    const startedAt = Date.now() - status.uptimeMs;
    const uptimeTimer = setInterval(() => {
      setUptimeMs(Date.now() - startedAt);
    }, 1_000);
    uptimeTimer.unref();

    return () => {
      clearInterval(uptimeTimer);
    };
  }, [status.uptimeMs]);

  useEffect(() => {
    if (eventStream.isFrozen) {
      setFrozenFilteredEventCount(displayedEvents.length);
    }
  }, [
    displayedEvents.length,
    eventStream.isFrozen,
    keyBinds.filters.eventType,
    keyBinds.filters.query,
    keyBinds.filters.tool,
  ]);

  return (
    <Box flexDirection="column">
      <Header
        adapterCount={configuredAdapters.length}
        columns={columns}
        connectionLabel={status.connectionLabel}
        connected={status.connected}
        globalStatus={globalStatus}
        version={version}
      />
      <FilterBar
        filters={keyBinds.filters}
        focusPanel={keyBinds.focusPanel}
        interaction={keyBinds.interaction}
      />
      {keyBinds.interaction.kind === 'help' ? <HelpOverlay /> : null}
      <Box marginTop={1}>
        <PanelStack compact={compactLayout}>
          <Panel
            accentColor={TUI_THEME.warning}
            focused={keyBinds.focusPanel === 'events'}
            title="Event Stream"
          >
            <EventStream
              emptyState={
                eventStream.bufferedEvents.length === 0 ? 'no-events' : 'no-match'
              }
              events={visibleEvents}
              frozen={eventStream.isFrozen}
              pendingEventCount={pendingFilteredEvents}
            />
          </Panel>
          <Panel
            accentColor={TUI_THEME.success}
            focused={keyBinds.focusPanel === 'sessions'}
            title="Sessions"
          >
            <SessionPanel sessions={displayedSessions} />
          </Panel>
        </PanelStack>
      </Box>
      <Box marginTop={1}>
        <StatusBar
          activeFilterCount={activeFilterCount}
          adapterCount={configuredAdapters.length}
          columns={columns}
          connected={status.connected}
          consumerCount={status.consumerCount}
          eventCount={eventStream.totalEvents}
          focusPanel={keyBinds.focusPanel}
          latestEvent={displayedEvents.at(-1) ?? eventStream.latestEvent}
          pendingEventCount={pendingFilteredEvents}
          streamFrozen={eventStream.isFrozen}
          uptimeMs={uptimeMs}
        />
      </Box>
    </Box>
  );
}
