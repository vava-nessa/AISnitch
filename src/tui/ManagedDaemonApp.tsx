import React, { useEffect, useMemo, useRef, useState } from 'react';
import WebSocket, { type RawData } from 'ws';

import { EventBus, AISnitchEventSchema } from '../core/index.js';
import { App } from './App.js';
import type {
  ManagedTuiSnapshot,
  TuiInitialFilters,
  TuiStatusSnapshot,
} from './types.js';

/**
 * @file src/tui/ManagedDaemonApp.tsx
 * @description PM2-style dashboard wrapper that keeps the TUI open even when the AISnitch daemon is offline.
 * @functions
 *   → ManagedDaemonApp
 *   → parseSocketPayload
 * @exports ManagedDaemonApp, type ManagedDaemonAppProps
 * @see ./App.tsx
 * @see ../cli/runtime.ts
 */

const DASHBOARD_REFRESH_INTERVAL_MS = 1_500;

/**
 * Props required by the managed dashboard wrapper.
 */
export interface ManagedDaemonAppProps {
  readonly initialFilters?: TuiInitialFilters;
  readonly initialSnapshot: ManagedTuiSnapshot;
  readonly onQuit?: () => void;
  readonly refreshSnapshot: () => Promise<ManagedTuiSnapshot>;
  readonly toggleDaemon: () => Promise<ManagedTuiSnapshot>;
  readonly version: string;
}

/**
 * 📖 The managed dashboard keeps a local EventBus mirror so the UI can stay
 * mounted while daemon connectivity comes and goes underneath it.
 */
export function ManagedDaemonApp({
  initialFilters,
  initialSnapshot,
  onQuit,
  refreshSnapshot,
  toggleDaemon,
  version,
}: ManagedDaemonAppProps): React.JSX.Element {
  const eventBus = useMemo(() => new EventBus(), []);
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [busyAction, setBusyAction] = useState<'starting' | 'stopping' | null>(
    null,
  );
  const socketRef = useRef<WebSocket | null>(null);
  const refreshInFlightRef = useRef(false);

  useEffect(() => {
    let disposed = false;

    const refresh = async (): Promise<void> => {
      if (disposed || refreshInFlightRef.current || busyAction !== null) {
        return;
      }

      refreshInFlightRef.current = true;

      try {
        const nextSnapshot = await refreshSnapshot();

        if (!disposed) {
          setSnapshot(nextSnapshot);
        }
      } finally {
        refreshInFlightRef.current = false;
      }
    };

    const timer = setInterval(() => {
      void refresh();
    }, DASHBOARD_REFRESH_INTERVAL_MS);

    timer.unref();

    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, [busyAction, refreshSnapshot]);

  useEffect(() => {
    const daemon = snapshot.status.daemon;
    const currentSocket = socketRef.current;

    if (!daemon?.active) {
      if (currentSocket !== null) {
        socketRef.current = null;
        currentSocket.removeAllListeners();
        currentSocket.close();
      }

      return;
    }

    if (
      currentSocket !== null &&
      currentSocket.url === daemon.wsUrl &&
      (currentSocket.readyState === WebSocket.OPEN ||
        currentSocket.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    if (currentSocket !== null) {
      socketRef.current = null;
      currentSocket.removeAllListeners();
      currentSocket.close();
    }

    const nextSocket = new WebSocket(daemon.wsUrl);
    socketRef.current = nextSocket;

    nextSocket.on('message', (payload: RawData) => {
      const parsedEvent = parseSocketPayload(payload);

      if (parsedEvent !== null) {
        eventBus.publish(parsedEvent);
      }
    });

    nextSocket.on('close', () => {
      if (socketRef.current === nextSocket) {
        socketRef.current = null;
      }
    });

    nextSocket.on('error', () => {
      if (socketRef.current === nextSocket) {
        socketRef.current = null;
      }
    });

    return () => {
      if (socketRef.current === nextSocket) {
        socketRef.current = null;
      }

      nextSocket.removeAllListeners();
      nextSocket.close();
    };
  }, [eventBus, snapshot.status.daemon]);

  useEffect(() => {
    return () => {
      const currentSocket = socketRef.current;

      if (currentSocket !== null) {
        currentSocket.removeAllListeners();
        currentSocket.close();
      }
    };
  }, []);

  async function handleRefresh(): Promise<void> {
    const nextSnapshot = await refreshSnapshot();
    setSnapshot(nextSnapshot);
  }

  async function handleToggleDaemon(): Promise<void> {
    const currentDaemon = snapshot.status.daemon;

    setBusyAction(currentDaemon?.active ? 'stopping' : 'starting');

    try {
      const nextSnapshot = await toggleDaemon();
      setSnapshot(nextSnapshot);
    } finally {
      setBusyAction(null);
    }
  }

  const effectiveStatus: TuiStatusSnapshot = {
    ...snapshot.status,
    daemon:
      snapshot.status.daemon === undefined
        ? undefined
        : {
            ...snapshot.status.daemon,
            busyAction,
          },
  };

  return (
    <App
      configuredAdapters={snapshot.configuredAdapters}
      initialFilters={initialFilters}
      managerControls={{
        onRefreshStatus: handleRefresh,
        onToggleDaemon: handleToggleDaemon,
      }}
      onQuit={onQuit}
      source={{
        kind: 'event-bus',
        eventBus,
      }}
      status={effectiveStatus}
      version={version}
    />
  );
}

function parseSocketPayload(data: RawData) {
  let parsedPayload: unknown;

  if (typeof data === 'string') {
    parsedPayload = JSON.parse(data) as unknown;
  } else if (Array.isArray(data)) {
    parsedPayload = JSON.parse(Buffer.concat(data).toString('utf8')) as unknown;
  } else if (data instanceof ArrayBuffer) {
    parsedPayload = JSON.parse(
      Buffer.from(new Uint8Array(data)).toString('utf8'),
    ) as unknown;
  } else {
    parsedPayload = JSON.parse(Buffer.from(data).toString('utf8')) as unknown;
  }

  if (
    typeof parsedPayload === 'object' &&
    parsedPayload !== null &&
    'type' in parsedPayload &&
    parsedPayload.type === 'welcome'
  ) {
    return null;
  }

  const parsedEvent = AISnitchEventSchema.safeParse(parsedPayload);

  return parsedEvent.success ? parsedEvent.data : null;
}
