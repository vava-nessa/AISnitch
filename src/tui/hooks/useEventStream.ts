import { useEffect, useState } from 'react';
import type { RawData, WebSocket } from 'ws';

import {
  AISnitchEventSchema,
  type AISnitchEvent,
  type EventBus,
} from '../../core/index.js';

/**
 * @file src/tui/hooks/useEventStream.ts
 * @description React hook and pure helpers for collecting, bounding, and freezing the live AISnitch event stream.
 * @functions
 *   → useEventStream
 *   → appendEventToStream
 *   → getVisibleEventWindow
 *   → getPendingFrozenEventCount
 * @exports EVENT_STREAM_LIMIT, EventStreamSource, UseEventStreamOptions, UseEventStreamState, useEventStream, appendEventToStream, getVisibleEventWindow, getPendingFrozenEventCount
 * @see ../components/EventStream.tsx
 * @see ../../core/engine/event-bus.ts
 * @see ../../core/engine/ws-server.ts
 */

/**
 * Maximum number of live events kept in memory for the TUI stream.
 */
export const EVENT_STREAM_LIMIT = 500;

/**
 * Default number of rendered events kept in the visible terminal window.
 */
export const DEFAULT_VISIBLE_EVENT_COUNT = 8;

/**
 * Supported live sources for the event stream hook.
 */
export type EventStreamSource =
  | {
      readonly kind: 'event-bus';
      readonly eventBus: EventBus;
    }
  | {
      readonly kind: 'websocket';
      readonly socket: Pick<WebSocket, 'on' | 'off'>;
    };

/**
 * Configuration accepted by the event stream hook.
 */
export interface UseEventStreamOptions {
  readonly initialTotalEvents?: number;
  readonly limit?: number;
  readonly visibleCount?: number;
}

/**
 * State returned by the live event stream hook.
 */
export interface UseEventStreamState {
  readonly bufferedEvents: readonly AISnitchEvent[];
  readonly clearEvents: () => void;
  readonly isFrozen: boolean;
  readonly latestEvent: AISnitchEvent | null;
  readonly pendingEventCount: number;
  readonly toggleFrozen: () => void;
  readonly totalEvents: number;
  readonly visibleEvents: readonly AISnitchEvent[];
}

/**
 * 📖 The hook owns stream mechanics so `App` can stay focused on layout and
 * panel composition instead of juggling buffer trimming, freeze anchors, and
 * source-specific subscription code.
 */
export function useEventStream(
  source: EventStreamSource,
  options: UseEventStreamOptions = {},
): UseEventStreamState {
  const limit = options.limit ?? EVENT_STREAM_LIMIT;
  const visibleCount = options.visibleCount ?? DEFAULT_VISIBLE_EVENT_COUNT;
  const [bufferedEvents, setBufferedEvents] = useState<readonly AISnitchEvent[]>(
    [],
  );
  const [totalEvents, setTotalEvents] = useState(options.initialTotalEvents ?? 0);
  const [latestEvent, setLatestEvent] = useState<AISnitchEvent | null>(null);
  const [frozenAtTotalEvents, setFrozenAtTotalEvents] = useState<number | null>(
    null,
  );

  useEffect(() => {
    const unsubscribe = subscribeToEventStream(source, (event) => {
      setLatestEvent(event);
      setTotalEvents((currentValue) => currentValue + 1);
      setBufferedEvents((currentValue) =>
        appendEventToStream(currentValue, event, limit),
      );
    });

    return () => {
      unsubscribe();
    };
  }, [limit, source]);

  const pendingEventCount = getPendingFrozenEventCount(
    totalEvents,
    frozenAtTotalEvents,
  );
  const visibleEvents = getVisibleEventWindow(bufferedEvents, {
    totalEvents,
    frozenAtTotalEvents,
    visibleCount,
  });

  return {
    bufferedEvents,
    clearEvents: () => {
      setBufferedEvents([]);
      setFrozenAtTotalEvents(null);
      setLatestEvent(null);
    },
    isFrozen: frozenAtTotalEvents !== null,
    latestEvent,
    pendingEventCount,
    toggleFrozen: () => {
      setFrozenAtTotalEvents((currentValue) =>
        currentValue === null ? totalEvents : null,
      );
    },
    totalEvents,
    visibleEvents,
  };
}

/**
 * Appends a new event while keeping the TUI stream buffer size bounded.
 */
export function appendEventToStream(
  currentEvents: readonly AISnitchEvent[],
  event: AISnitchEvent,
  limit = EVENT_STREAM_LIMIT,
): readonly AISnitchEvent[] {
  const nextEvents = [...currentEvents, event];

  if (nextEvents.length <= limit) {
    return nextEvents;
  }

  return nextEvents.slice(-limit);
}

/**
 * Calculates the currently visible event window, respecting frozen tail mode.
 */
export function getVisibleEventWindow(
  bufferedEvents: readonly AISnitchEvent[],
  options: {
    readonly frozenAtTotalEvents?: number | null;
    readonly totalEvents: number;
    readonly visibleCount: number;
  },
): readonly AISnitchEvent[] {
  const pendingEventCount = getPendingFrozenEventCount(
    options.totalEvents,
    options.frozenAtTotalEvents ?? null,
  );
  const visibleEndIndex =
    pendingEventCount === 0
      ? bufferedEvents.length
      : Math.max(0, bufferedEvents.length - pendingEventCount);
  const visibleStartIndex = Math.max(0, visibleEndIndex - options.visibleCount);

  return bufferedEvents.slice(visibleStartIndex, visibleEndIndex);
}

/**
 * Returns how many newer events are hidden while the stream is frozen.
 */
export function getPendingFrozenEventCount(
  totalEvents: number,
  frozenAtTotalEvents: number | null,
): number {
  if (frozenAtTotalEvents === null) {
    return 0;
  }

  return Math.max(0, totalEvents - frozenAtTotalEvents);
}

function subscribeToEventStream(
  source: EventStreamSource,
  onEvent: (event: AISnitchEvent) => void,
): () => void {
  if (source.kind === 'event-bus') {
    return source.eventBus.subscribe(onEvent);
  }

  const handleMessage = (data: RawData): void => {
    const parsedPayload = parseSocketPayload(data);

    if (parsedPayload !== null) {
      onEvent(parsedPayload);
    }
  };

  source.socket.on('message', handleMessage);

  return () => {
    source.socket.off('message', handleMessage);
  };
}

function parseSocketPayload(data: RawData): AISnitchEvent | null {
  const parsedPayload = parseUnknownPayload(data);

  if (
    typeof parsedPayload === 'object' &&
    parsedPayload !== null
  ) {
    const messageCandidate = parsedPayload as Record<string, unknown>;

    if (messageCandidate.type === 'welcome') {
      return null;
    }
  }

  const parsedEvent = AISnitchEventSchema.safeParse(parsedPayload);

  return parsedEvent.success ? parsedEvent.data : null;
}

function parseUnknownPayload(data: RawData): unknown {
  if (typeof data === 'string') {
    return JSON.parse(data) as unknown;
  }

  if (Array.isArray(data)) {
    return JSON.parse(Buffer.concat(data).toString('utf8')) as unknown;
  }

  if (data instanceof ArrayBuffer) {
    return JSON.parse(
      Buffer.from(new Uint8Array(data)).toString('utf8'),
    ) as unknown;
  }

  return JSON.parse(Buffer.from(data).toString('utf8')) as unknown;
}
