/**
 * @file src/hooks/useAISnitch.ts
 * @description WebSocket hook for AISnitch with auto-reconnect and event buffering
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { AISnitchEvent, AgentDisplay, ToolName } from '../types';

interface WelcomeMessage {
  version: string;
  activeTools: ToolName[];
  uptime: number;
}

interface UseAISnitchReturn {
  agents: Map<string, AgentDisplay>;
  activeAgent: AgentDisplay | null;
  setActiveAgent: (sessionId: string | null) => void;
  connectionStatus: 'connecting' | 'connected' | 'reconnecting' | 'offline';
  welcome: WelcomeMessage | null;
  recentEvents: AISnitchEvent[];
  allEvents: AISnitchEvent[];
}

const WS_URL = 'ws://127.0.0.1:4820';
const RECONNECT_DELAY_BASE = 1000;
const RECONNECT_DELAY_MAX = 30000;
const MAX_RECENT_EVENTS = 50;
const MAX_AGENT_EVENTS = 20;

export function useAISnitch(): UseAISnitchReturn {
  const [agents, setAgents] = useState<Map<string, AgentDisplay>>(new Map());
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connecting');
  const [welcome, setWelcome] = useState<WelcomeMessage | null>(null);
  const [recentEvents, setRecentEvents] = useState<AISnitchEvent[]>([]);
  const [allEvents, setAllEvents] = useState<AISnitchEvent[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelayRef = useRef(RECONNECT_DELAY_BASE);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isManualDisconnectRef = useRef(false);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    setConnectionStatus('connecting');

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnectionStatus('connected');
        reconnectDelayRef.current = RECONNECT_DELAY_BASE;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);

          // Handle welcome message
          if (data.type === 'welcome') {
            setWelcome(data as WelcomeMessage);
            return;
          }

          // Handle event
          const evt = data as AISnitchEvent;
          handleEvent(evt);
        } catch {
          console.error('Failed to parse message:', event.data);
        }
      };

      ws.onclose = () => {
        if (!isManualDisconnectRef.current) {
          setConnectionStatus('reconnecting');
          scheduleReconnect();
        } else {
          setConnectionStatus('offline');
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch (error) {
      console.error('WebSocket connection error:', error);
      setConnectionStatus('offline');
      scheduleReconnect();
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    reconnectTimeoutRef.current = setTimeout(() => {
      connect();
      // Exponential backoff
      reconnectDelayRef.current = Math.min(
        reconnectDelayRef.current * 2,
        RECONNECT_DELAY_MAX,
      );
    }, reconnectDelayRef.current);
  }, [connect]);

  const handleEvent = useCallback((evt: AISnitchEvent) => {
    const tool = evt['aisnitch.tool'] as ToolName;
    const sessionId = evt['aisnitch.sessionid'];
    const project = evt.data.project ?? evt.data.projectPath?.split('/').pop() ?? 'unknown';

    setAgents((prev) => {
      const next = new Map(prev);
      let agent = next.get(sessionId);

      if (!agent) {
        agent = {
          sessionId,
          tool,
          project,
          model: evt.data.model,
          currentEvent: null,
          lastEvents: [],
          connectedAt: Date.now(),
          totalTokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
        };
        next.set(sessionId, agent);
      }

      // Update agent
      agent.model = evt.data.model ?? agent.model;

      // Accumulate tokens from this event (differentiated)
      const tokensDelta = evt.data.tokensUsed ?? 0;
      const inputDelta = evt.data.inputTokens ?? 0;
      const outputDelta = evt.data.outputTokens ?? 0;
      const cachedDelta = evt.data.cachedTokens ?? 0;

      // Also derive from total if individual fields not provided
      const effectiveInputDelta = inputDelta || (tokensDelta > 0 ? Math.floor(tokensDelta * 0.3) : 0);
      const effectiveOutputDelta = outputDelta || (tokensDelta > 0 ? Math.floor(tokensDelta * 0.7) : 0);

      const previousTokens = agent.totalTokens;
      const previousInput = agent.inputTokens;
      const previousOutput = agent.outputTokens;
      const previousCached = agent.cachedTokens;

      const newTotalTokens = previousTokens + tokensDelta;
      const newInputTokens = previousInput + (inputDelta || effectiveInputDelta);
      const newOutputTokens = previousOutput + effectiveOutputDelta;
      const newCachedTokens = previousCached + cachedDelta;

      // Update last events (keep last 20)
      const newLastEvents = [evt, ...agent.lastEvents].slice(0, MAX_AGENT_EVENTS);

      next.set(sessionId, {
        ...agent,
        currentEvent: evt,
        lastEvents: newLastEvents,
        totalTokens: newTotalTokens,
        inputTokens: newInputTokens,
        outputTokens: newOutputTokens,
        cachedTokens: newCachedTokens,
      });

      // Auto-switch to new active agent if none selected or previous became inactive
      if (!activeAgentId || !next.get(activeAgentId)) {
        setActiveAgentId(sessionId);
      }

      return next;
    });

    // Add to recent events
    setRecentEvents((prev) => [evt, ...prev].slice(0, MAX_RECENT_EVENTS));

    // Add to all events for history
    setAllEvents((prev) => [evt, ...prev].slice(0, 200));
  }, [activeAgentId]);

  const setActiveAgent = useCallback((sessionId: string | null) => {
    setActiveAgentId(sessionId);
  }, []);

  useEffect(() => {
    connect();

    return () => {
      isManualDisconnectRef.current = true;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      wsRef.current?.close();
    };
  }, [connect]);

  const activeAgent = activeAgentId ? agents.get(activeAgentId) ?? null : null;

  return {
    agents,
    activeAgent,
    setActiveAgent,
    connectionStatus,
    welcome,
    recentEvents,
    allEvents,
  };
}

type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline';
