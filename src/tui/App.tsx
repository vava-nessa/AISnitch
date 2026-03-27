import React, { useEffect, useState } from 'react';
import { Box, Newline, Text, useApp, useInput, useStdout } from 'ink';

import type {
  AISnitchEvent,
  EventBus,
  PipelineStatus,
  ToolName,
} from '../core/index.js';
import { Header } from './components/Header.js';
import { Panel, PanelStack } from './components/Layout.js';
import { StatusBar } from './components/StatusBar.js';
import { EVENT_COLORS, TOOL_COLORS, TUI_THEME } from './theme.js';

/**
 * @file src/tui/App.tsx
 * @description Root Ink application for the AISnitch terminal UI foundation, including layout chrome and live summary state.
 * @functions
 *   → App
 * @exports App, type AppProps
 * @see ./index.tsx
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
  const [eventCount, setEventCount] = useState(status.eventBus.publishedEvents);
  const [latestEvent, setLatestEvent] = useState<AISnitchEvent | null>(null);
  const [recentSessions, setRecentSessions] = useState<
    readonly RecentSessionSummary[]
  >([]);
  const [uptimeMs, setUptimeMs] = useState(status.uptimeMs);

  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) {
      onQuit?.();
      exit();
    }
  });

  useEffect(() => {
    const handleResize = (): void => {
      setColumns(stdout.columns ?? 80);
    };

    stdout.on('resize', handleResize);

    return () => {
      stdout.off('resize', handleResize);
    };
  }, [stdout]);

  useEffect(() => {
    const startedAt = Date.now() - status.uptimeMs;
    const uptimeTimer = setInterval(() => {
      setUptimeMs(Date.now() - startedAt);
    }, 1_000);
    uptimeTimer.unref();

    const unsubscribe = eventBus.subscribe((event) => {
      setLatestEvent(event);
      setEventCount((currentValue) => currentValue + 1);
      setRecentSessions((currentValue) => {
        const sessionMap = new Map(
          currentValue.map((summary) => [summary.sessionId, summary]),
        );
        const existingSummary = sessionMap.get(event['aisnitch.sessionid']);
        const nextSummary: RecentSessionSummary = {
          eventCount: (existingSummary?.eventCount ?? 0) + 1,
          lastState: event.type,
          sessionId: event['aisnitch.sessionid'],
          tool: event['aisnitch.tool'],
        };

        sessionMap.set(event['aisnitch.sessionid'], nextSummary);

        return [...sessionMap.values()].slice(-4).reverse();
      });
    });

    return () => {
      clearInterval(uptimeTimer);
      unsubscribe();
    };
  }, [eventBus, status.uptimeMs]);

  const compactLayout = columns < 112;
  const latestEventDetails =
    latestEvent === null
      ? [
          'No events yet. Start with Claude Code or OpenCode and the foreground bus will light up here.',
          'Detailed live stream controls land in 05/02.',
        ]
      : [formatEventHeadline(latestEvent), formatEventDetail(latestEvent)];

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
            {latestEventDetails.map((line, index) => (
              <Text key={`${line}-${index}`} color={index === 0 ? TUI_THEME.panelTitle : TUI_THEME.muted}>
                {line}
              </Text>
            ))}
            <Newline />
            <Text color={TUI_THEME.muted}>
              Foundation mode: framed layout, live counters, and session preview are active.
            </Text>
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
          eventCount={eventCount}
          uptimeMs={uptimeMs}
        />
      </Box>
    </Box>
  );
}

function formatEventHeadline(event: AISnitchEvent): string {
  return `${event['aisnitch.tool']} · ${event.type}`;
}

function formatEventDetail(event: AISnitchEvent): string {
  if (event.data.toolName) {
    return `${event.data.toolName} · ${
      event.data.toolInput?.filePath ??
      event.data.toolInput?.command ??
      'no input detail yet'
    }`;
  }

  if (event.data.errorMessage) {
    return event.data.errorMessage;
  }

  if (event.data.activeFile) {
    return event.data.activeFile;
  }

  return event.data.cwd ?? 'Live detail formatting expands in 05/02.';
}

function truncateSessionId(sessionId: string): string {
  return sessionId.length <= 18
    ? sessionId
    : `${sessionId.slice(0, 8)}…${sessionId.slice(-6)}`;
}
