import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createAISnitchClient,
  describeEvent,
  eventToMascotState,
  type AISnitchClient,
  type AISnitchEvent,
  type WelcomeMessage,
} from '@aisnitch/client';
import type { AgentCardState, ConnectionStatus, TickerEvent } from '../types';
import { playBoot, playKill, playSleep, playStateChange } from '../lib/soundEngine';

const KILL_DISPLAY_MS = 5000;
const TICKER_MAX = 30;

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
  const killsRef = useRef<Map<string, number>>(new Map());

  const [agents, setAgents] = useState<ReadonlyMap<string, AgentCardState>>(new Map());
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('offline');
  const [welcome, setWelcome] = useState<WelcomeMessage | null>(null);
  const [recentEvents, setRecentEvents] = useState<readonly TickerEvent[]>([]);
  const [totalKills, setTotalKills] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const soundRef = useRef(false);

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

  useEffect(() => {
    const client = createAISnitchClient({ url: wsUrl, autoReconnect: true });
    clientRef.current = client;

    client.on('connected', (w: WelcomeMessage) => {
      setConnectionStatus('connected');
      setWelcome(w);
      if (soundRef.current) playBoot();
    });

    client.on('disconnected', () => {
      setConnectionStatus(client.connected ? 'connected' : 'reconnecting');
    });

    client.on('error', () => {
      setConnectionStatus('reconnecting');
    });

    client.on('event', (event: AISnitchEvent) => {
      const sessionId = event['aisnitch.sessionid'];
      const existing = agentsRef.current.get(sessionId);

      // 📖 On session.end → trigger kill animation
      if (event.type === 'session.end') {
        if (existing) {
          agentsRef.current.set(sessionId, {
            ...existing,
            isKilled: true,
            isSleeping: false,
            killedAt: Date.now(),
            mascotState: eventToMascotState(event),
            lastDescription: describeEvent(event),
            eventCount: existing.eventCount + 1,
          });
          flushAgents();

          const tool = existing.tool;
          killsRef.current.set(tool, (killsRef.current.get(tool) ?? 0) + 1);
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
      const isIdle = event.type === 'agent.idle';

      if (existing) {
        const wasSleeping = existing.isSleeping;
        agentsRef.current.set(sessionId, {
          ...existing,
          mascotState,
          lastDescription: describeEvent(event),
          eventCount: existing.eventCount + 1,
          isSleeping: isIdle,
          project: event.data.project ?? existing.project,
          projectPath: event.data.projectPath ?? existing.projectPath,
          terminal: event.data.terminal ?? existing.terminal,
          cwd: event.data.cwd ?? existing.cwd,
        });

        if (soundRef.current && !wasSleeping && isIdle) playSleep();
        else if (soundRef.current && existing.mascotState.mood !== mascotState.mood) {
          playStateChange(mascotState.mood);
        }
      } else {
        agentsRef.current.set(sessionId, {
          sessionId,
          tool: event['aisnitch.tool'],
          project: event.data.project,
          projectPath: event.data.projectPath,
          terminal: event.data.terminal,
          cwd: event.data.cwd,
          mascotState,
          lastDescription: describeEvent(event),
          eventCount: 1,
          startedAt: event.time,
          isSleeping: isIdle,
          isKilled: false,
        });
        if (soundRef.current) playStateChange(mascotState.mood);
      }

      flushAgents();
      addTickerEvent(event);
    });

    setConnectionStatus('reconnecting');

    return () => {
      for (const timer of killTimersRef.current.values()) clearTimeout(timer);
      killTimersRef.current.clear();
      client.destroy();
      clientRef.current = null;
    };
  }, [wsUrl, flushAgents, addTickerEvent]);

  return { agents, connectionStatus, welcome, recentEvents, totalKills, soundEnabled, toggleSound };
}
