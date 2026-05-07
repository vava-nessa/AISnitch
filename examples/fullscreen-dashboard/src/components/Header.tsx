/**
 * @file src/components/Header.tsx
 * @description Header bar showing agent info
 */

import type { AgentDisplay } from '../types';
import { TOOL_COLORS, TOOL_ICONS } from '../types';

interface HeaderProps {
  agent: AgentDisplay | null;
  connectionStatus: 'connecting' | 'connected' | 'reconnecting' | 'offline';
}

export function Header({ agent, connectionStatus }: HeaderProps) {
  const toolColor = agent ? TOOL_COLORS[agent.tool] : '#6b7280';
  const toolIcon = agent ? TOOL_ICONS[agent.tool] : '❓';

  const statusColors = {
    connecting: '#f59e0b',
    connected: '#22c55e',
    reconnecting: '#eab308',
    offline: '#ef4444',
  };

  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '60px',
        background: `linear-gradient(180deg, ${toolColor}22 0%, ${toolColor}11 100%)`,
        borderBottom: `2px solid ${toolColor}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
        zIndex: 100,
        backdropFilter: 'blur(10px)',
      }}
    >
      {/* Left: Tool + Project */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '28px' }}>{toolIcon}</span>
        <div>
          <div
            style={{
              fontSize: '18px',
              fontWeight: 700,
              color: toolColor,
              textTransform: 'uppercase',
              letterSpacing: '1px',
            }}
          >
            {agent?.tool ?? 'No Agent'}
          </div>
          {agent?.project && (
            <div style={{ fontSize: '12px', color: '#9ca3af', marginTop: '2px' }}>
              {agent.project}
            </div>
          )}
        </div>
      </div>

      {/* Center: Model */}
      <div style={{ textAlign: 'center' }}>
        {agent?.model && (
          <div
            style={{
              fontSize: '16px',
              color: '#e5e7eb',
              fontFamily: 'monospace',
              background: '#1f2937',
              padding: '6px 16px',
              borderRadius: '8px',
              border: `1px solid ${toolColor}44`,
            }}
          >
            {agent.model}
          </div>
        )}
      </div>

      {/* Right: Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            color: statusColors[connectionStatus],
          }}
        >
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: statusColors[connectionStatus],
              animation: connectionStatus === 'connected' ? 'pulse 2s infinite' : 'none',
            }}
          />
          {connectionStatus.toUpperCase()}
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </header>
  );
}