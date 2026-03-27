import React, { useEffect, useState } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';

import type {
  AISnitchEvent,
  PipelineStatus,
  ToolName,
} from '../core/index.js';
import type { EventBus } from '../core/index.js';
import { EventStream } from './components/EventStream.js';
import { Header } from './components/Header.js';
import { Panel, PanelStack } from './components/Layout.js';
import { StatusBar } from './components/StatusBar.js';
import { EVENT_COLORS, TOOL_COLORS, TUI_THEME } from './theme.js';
import { useEventStream } from './hooks/useEventStream.js';

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

interface RecentSessionSummary {
  readonly eventCount: number;
  readonly lastState: AISnitchEvent['type'];
  readonly sessionId: string;
  readonly tool: ToolName;
}

/**
 * Props injected by the foreground runtime renderer.
 */
export interface AppProps {
  readonly configuredAdapters: readonly ToolName[];
  readonly eventBus: EventBus;
  readonly onQuit?: () => void;
  readonly status: PipelineStatus;
  readonly version: string;
}

/**
 * 📖 This first TUI pass focuses on shape and feel: strong header, framed
 * panels, responsive composition, and just enough live state to prove the
 * foreground runtime is now a real terminal app instead of a raw log stream.
 */
export function App({
  configuredAdapters,
  eventBus,
  onQuit,
  status,
  version,
}: AppProps): React.JSX.Element {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const [columns, setColumns] = useState(stdout.columns ?? 80);
  const [uptimeMs, setUptimeMs] = useState(status.uptimeMs);

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
    {
      kind: 'event-bus',
      eventBus,
    },
    {
      initialTotalEvents: status.eventBus.publishedEvents,
      visibleCount: compactLayout ? 4 : 6,
    },
  );

  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) {
      onQuit?.();
      exit();
      return;
    }

    if (input === ' ') {
      eventStream.toggleFrozen();
    }
  });

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
  const recentSessions = buildRecentSessions(eventStream.bufferedEvents);
  const latestEvent = eventStream.latestEvent;

  return (
    <Box flexDirection="column">
      <Header
        adapterCount={configuredAdapters.length}
        columns={columns}
        connected
        version={version}
      />
      <Box marginTop={1}>
        <PanelStack compact={compactLayout}>
          <Panel accentColor={TUI_THEME.warning} title="Event Stream">
            <EventStream
              events={eventStream.visibleEvents}
              frozen={eventStream.isFrozen}
              pendingEventCount={eventStream.pendingEventCount}
            />
          </Panel>
          <Panel accentColor={TUI_THEME.success} title="Sessions">
            {recentSessions.length === 0 ? (
              <Text color={TUI_THEME.muted}>
                Waiting for a live session. Grouped session state lands fully in 05/03.
              </Text>
            ) : (
              recentSessions.map((session) => (
                <Box key={session.sessionId} flexDirection="column" marginBottom={1}>
                  <Text color={TOOL_COLORS[session.tool]}>
                    {`${session.tool} · ${truncateSessionId(session.sessionId)}`}
                  </Text>
                  <Text color={EVENT_COLORS[session.lastState]}>
                    {`${session.lastState} · ${session.eventCount} events`}
                  </Text>
                </Box>
              ))
            )}
          </Panel>
        </PanelStack>
      </Box>
      <Box marginTop={1}>
        <StatusBar
          adapterCount={configuredAdapters.length}
          columns={columns}
          connected
          consumerCount={status.websocket.consumerCount}
          eventCount={eventStream.totalEvents}
          latestEvent={latestEvent}
          pendingEventCount={eventStream.pendingEventCount}
          streamFrozen={eventStream.isFrozen}
          uptimeMs={uptimeMs}
        />
      </Box>
    </Box>
  );
}

function truncateSessionId(sessionId: string): string {
  return sessionId.length <= 18
    ? sessionId
    : `${sessionId.slice(0, 8)}…${sessionId.slice(-6)}`;
}

function buildRecentSessions(
  events: readonly AISnitchEvent[],
): readonly RecentSessionSummary[] {
  const sessionMap = new Map<string, RecentSessionSummary>();

  for (const event of events) {
    const existingSummary = sessionMap.get(event['aisnitch.sessionid']);

    sessionMap.set(event['aisnitch.sessionid'], {
      eventCount: (existingSummary?.eventCount ?? 0) + 1,
      lastState: event.type,
      sessionId: event['aisnitch.sessionid'],
      tool: event['aisnitch.tool'],
    });
  }

  return [...sessionMap.values()].slice(-4).reverse();
}
