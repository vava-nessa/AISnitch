import type { ConnectionStatus } from '../types';
import type { WelcomeMessage } from '@aisnitch/client';
import './StatusBar.css';

interface StatusBarProps {
  readonly connectionStatus: ConnectionStatus;
  readonly welcome: WelcomeMessage | null;
  readonly agentCount: number;
  readonly totalKills: number;
  readonly soundEnabled: boolean;
  readonly onToggleSound: () => void;
}

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  connected: 'Connected',
  reconnecting: 'Reconnecting...',
  offline: 'Offline',
};

export function StatusBar({
  connectionStatus,
  welcome,
  agentCount,
  totalKills,
  soundEnabled,
  onToggleSound,
}: StatusBarProps) {
  return (
    <div className="status-bar">
      <div className="status-left">
        <span className="status-logo">🐸</span>
        <span className="status-title">
          AISnitch <span>Mascot Dashboard</span>
        </span>
      </div>

      <div className="status-center">
        {agentCount > 0 ? (
          <>
            {agentCount} agent{agentCount > 1 ? 's' : ''} active
            {totalKills > 0 && (
              <> · 💀 {totalKills} fallen</>
            )}
          </>
        ) : (
          'No agents — waiting for connections'
        )}
      </div>

      <div className="status-right">
        {welcome && (
          <span className="daemon-version">v{welcome.version}</span>
        )}
        <button
          className={`sound-toggle${soundEnabled ? ' active' : ''}`}
          onClick={onToggleSound}
          title={soundEnabled ? 'Mute sounds' : 'Enable sounds'}
        >
          {soundEnabled ? '🔊' : '🔇'}
        </button>
        <div className="connection-badge">
          <span className={`connection-dot ${connectionStatus}`} />
          <span>{STATUS_LABELS[connectionStatus]}</span>
        </div>
      </div>
    </div>
  );
}
