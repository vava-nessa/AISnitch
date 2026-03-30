import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createAISnitchClient,
  describeEvent,
  eventToMascotState,
  type AISnitchClient,
  type AISnitchEvent,
  type WelcomeMessage,
} from '@aisnitch/client';
import type { ActivityInfo, AgentCardState, ConnectionStatus, TickerEvent } from '../types';
import { playBoot, playKill, playSleep, playStateChange } from '../lib/soundEngine';

const KILL_DISPLAY_MS = 5000;
const TICKER_MAX = 30;
const SLEEP_AFTER_MS = 90_000;

// 📖 Maps event type → emoji + verb for the activity section
function resolveActivity(event: AISnitchEvent): ActivityInfo {
  const map: Record<string, { emoji: string; verb: string }> = {
    'session.start':     { emoji: '🚀', verb: 'Starting' },
    'session.end':       { emoji: '👋', verb: 'Ending' },
    'task.start':        { emoji: '🎯', verb: 'New task' },
    'task.complete':     { emoji: '✅', verb: 'Completed' },
    'agent.thinking':    { emoji: '💭', verb: 'Thinking' },
    'agent.streaming':   { emoji: '💬', verb: 'Streaming' },
    'agent.coding':      { emoji: '✏️', verb: 'Editing' },
    'agent.tool_call':   { emoji: '🔧', verb: 'Tool call' },
    'agent.asking_user': { emoji: '🙋', verb: 'Needs input' },
    'agent.idle':        { emoji: '⏸️', verb: 'Idle' },
    'agent.error':       { emoji: '❌', verb: 'Error' },
    'agent.compact':     { emoji: '🗜️', verb: 'Compacting' },
  };
  const base = map[event.type] ?? { emoji: '❓', verb: event.type };

  let detail: string | undefined;
  if (event.type === 'agent.tool_call' && event.data.toolName) {
    detail = event.data.toolName;
    if (event.data.toolInput?.filePath) detail += ` → ${event.data.toolInput.filePath}`;
  } else if (event.type === 'agent.coding' && event.data.activeFile) {
    detail = event.data.activeFile;
  } else if (event.type === 'agent.error' && event.data.errorMessage) {
    detail = event.data.errorMessage;
  } else if (event.type === 'agent.streaming' && event.data.activeFile) {
    detail = event.data.activeFile;
  } else if (event.type === 'agent.thinking' && event.data.model) {
    detail = event.data.model;
  }

  return { emoji: base.emoji, verb: base.verb, detail };
}

export interface UseAISnitchReturn {
  readonly agents: ReadonlyMap<string, AgentCardState>;
  readonly connectionStatus: ConnectionStatus;
  readonly welcome: WelcomeMessage | null;
  readonly recentEvents: readonly TickerEvent[];
  readonly totalKills: number;
  readonly soundEnabled: boolean;
  readonly toggleSound: () => void;
}

export function useAISnitch(wsUrl = 'ws://127.0.0.1:4820'): UseAISnitchReturn {
  const clientRef = useRef<AISnitchClient | null>(null);
  const agentsRef = useRef<Map<string, AgentCardState>>(new Map());
  const killTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const sleepTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const killsRef = useRef<Map<string, number>>(new Map());
  const connRef = useRef<ConnectionStatus>('offline');

  const [agents, setAgents] = useState<ReadonlyMap<string, AgentCardState>>(new Map());
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('offline');
  const [welcome, setWelcome] = useState<WelcomeMessage | null>(null);
  const [recentEvents, setRecentEvents] = useState<readonly TickerEvent[]>([]);
  const [totalKills, setTotalKills] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const soundRef = useRef(false);

  const setConn = useCallback((s: ConnectionStatus) => {
    connRef.current = s;
    setConnectionStatus(s);
  }, []);

  const flushAgents = useCallback(() => {
    setAgents(new Map(agentsRef.current));
  }, []);

  const addTickerEvent = useCallback((event: AISnitchEvent) => {
    setRecentEvents((prev) => {
      const next: TickerEvent[] = [
        ...prev,
        { tool: event['aisnitch.tool'], text: describeEvent(event), timestamp: Date.now() },
      ];
      return next.slice(-TICKER_MAX);
    });
  }, []);

  const toggleSound = useCallback(() => {
    soundRef.current = !soundRef.current;
    setSoundEnabled(soundRef.current);
  }, []);

  // 📖 Schedule sleep after inactivity — resets on every new event for this session
  const scheduleSleep = useCallback((sessionId: string) => {
    const existing = sleepTimersRef.current.get(sessionId);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      const agent = agentsRef.current.get(sessionId);
      if (agent && !agent.isKilled) {
        agentsRef.current.set(sessionId, { ...agent, isSleeping: true });
        flushAgents();
        if (soundRef.current) playSleep();
      }
      sleepTimersRef.current.delete(sessionId);
    }, SLEEP_AFTER_MS);

    sleepTimersRef.current.set(sessionId, timer);
  }, [flushAgents]);

  useEffect(() => {
    const client = createAISnitchClient({ url: wsUrl, autoReconnect: true });
    clientRef.current = client;

    client.on('connected', (w: WelcomeMessage) => {
      setConn('connected');
      setWelcome(w);
      if (soundRef.current) playBoot();
    });

    client.on('disconnected', () => {
      // 📖 Only downgrade if we're not already connected (edge case: brief close during reconnect)
      if (connRef.current !== 'connected') {
        setConn('reconnecting');
      }
    });

    client.on('error', () => {
      // 📖 Don't downgrade from connected to reconnecting — onerror fires transiently
      // even when the connection is fine. Let onclose handle real disconnections.
      if (connRef.current === 'offline') {
        setConn('reconnecting');
      }
    });

    client.on('event', (event: AISnitchEvent) => {
      const sessionId = event['aisnitch.sessionid'];
      const existing = agentsRef.current.get(sessionId);

      if (event.type === 'session.end') {
        if (existing) {
          agentsRef.current.set(sessionId, {
            ...existing,
            isKilled: true,
            isSleeping: false,
            killedAt: Date.now(),
            mascotState: eventToMascotState(event),
            lastDescription: describeEvent(event),
            lastEventType: event.type,
            activity: resolveActivity(event),
            eventCount: existing.eventCount + 1,
            lastEventAt: Date.now(),
          });
          flushAgents();

          killsRef.current.set(existing.tool, (killsRef.current.get(existing.tool) ?? 0) + 1);
          const sum = [...killsRef.current.values()].reduce((a, b) => a + b, 0);
          setTotalKills(sum);

          if (soundRef.current) playKill();

          const timer = setTimeout(() => {
            agentsRef.current.delete(sessionId);
            killTimersRef.current.delete(sessionId);
            flushAgents();
          }, KILL_DISPLAY_MS);
          killTimersRef.current.set(sessionId, timer);
        }
        addTickerEvent(event);
        return;
      }

      const mascotState = eventToMascotState(event);
      const activity = resolveActivity(event);
      const now = Date.now();

      if (existing) {
        agentsRef.current.set(sessionId, {
          ...existing,
          mascotState,
          lastDescription: describeEvent(event),
          lastEventType: event.type,
          activity,
          eventCount: existing.eventCount + 1,
          lastEventAt: now,
          isSleeping: false,
          // 📖 project/projectPath are frozen at first value — they identify the root project
          project: existing.project ?? event.data.project,
          projectPath: existing.projectPath ?? event.data.projectPath,
          terminal: event.data.terminal ?? existing.terminal,
          model: event.data.model ?? existing.model,
          cwd: event.data.cwd ?? existing.cwd,
        });

        if (soundRef.current && existing.mascotState.mood !== mascotState.mood) {
          playStateChange(mascotState.mood);
        }
      } else {
        agentsRef.current.set(sessionId, {
          sessionId,
          tool: event['aisnitch.tool'],
          project: event.data.project,
          projectPath: event.data.projectPath,
          terminal: event.data.terminal,
          model: event.data.model,
          cwd: event.data.cwd,
          mascotState,
          lastDescription: describeEvent(event),
          lastEventType: event.type,
          activity,
          eventCount: 1,
          startedAt: event.time,
          lastEventAt: now,
          isSleeping: false,
          isKilled: false,
        });
        if (soundRef.current) playStateChange(mascotState.mood);
      }

      scheduleSleep(sessionId);
      flushAgents();
      addTickerEvent(event);
    });

    setConn('reconnecting');

    return () => {
      for (const timer of killTimersRef.current.values()) clearTimeout(timer);
      for (const timer of sleepTimersRef.current.values()) clearTimeout(timer);
      killTimersRef.current.clear();
      sleepTimersRef.current.clear();
      client.destroy();
      clientRef.current = null;
    };
  }, [wsUrl, setConn, flushAgents, addTickerEvent, scheduleSleep]);

  return { agents, connectionStatus, welcome, recentEvents, totalKills, soundEnabled, toggleSound };
}
