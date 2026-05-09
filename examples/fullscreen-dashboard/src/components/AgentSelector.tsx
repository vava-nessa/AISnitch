/**
 * @file src/components/AgentSelector.tsx
 * @description Agent switcher sidebar
 */

import type { AgentDisplay } from '../types';
import { TOOL_COLORS, TOOL_ICONS } from '../types';

interface AgentSelectorProps {
  agents: Map<string, AgentDisplay>;
  activeAgentId: string | null;
  onSelectAgent: (sessionId: string | null) => void;
}

export function AgentSelector({ agents, activeAgentId, onSelectAgent }: AgentSelectorProps) {
  const agentsList = Array.from(agents.values()).sort((a, b) => b.connectedAt - a.connectedAt);

  return (
    <div
      style={{
        position: 'fixed',
        left: 0,
        top: '60px',
        bottom: 0,
        width: '280px',
        background: 'rgba(0,0,0,0.8)',
        backdropFilter: 'blur(10px)',
        borderRight: '1px solid rgba(255,255,255,0.1)',
        overflowY: 'auto',
        zIndex: 50,
      }}
    >
      <div
        style={{
          padding: '16px',
          fontSize: '12px',
          color: '#6b7280',
          textTransform: 'uppercase',
          letterSpacing: '2px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        Active Agents ({agentsList.length})
      </div>

      {agentsList.map((agent) => {
        const isActive = agent.sessionId === activeAgentId;
        const toolColor = TOOL_COLORS[agent.tool];
        const toolIcon = TOOL_ICONS[agent.tool];
        const latestEvent = agent.currentEvent;
        const eventLabel = latestEvent ? getEventLabel(latestEvent.type) : 'idle';

        return (
          <button
            key={agent.sessionId}
            onClick={() => onSelectAgent(isActive ? null : agent.sessionId)}
            style={{
              width: '100%',
              padding: '16px',
              background: isActive ? `${toolColor}22` : 'transparent',
              border: 'none',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              borderLeft: isActive ? `3px solid ${toolColor}` : '3px solid transparent',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.2s ease',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '24px' }}>{toolIcon}</span>
              <div style={{ flex: 1 }}>
                <div
                  style={{
                    fontSize: '14px',
                    fontWeight: 600,
                    color: isActive ? toolColor : '#e5e7eb',
                  }}
                >
                  {agent.tool}
                </div>
                <div
                  style={{
                    fontSize: '11px',
                    color: '#9ca3af',
                    marginTop: '2px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                    maxWidth: '180px',
                  }}
                >
                  {agent.project ?? agent.sessionId}
                </div>
              </div>
              <div
                style={{
                  padding: '4px 8px',
                  background: `${toolColor}33`,
                  borderRadius: '12px',
                  fontSize: '10px',
                  color: toolColor,
                }}
              >
                {eventLabel}
              </div>
            </div>

            {/* Token counter with breakdown */}
            {agent.totalTokens > 0 && (
              <TokenDisplay
                total={agent.totalTokens}
                input={agent.inputTokens}
                output={agent.outputTokens}
                cached={agent.cachedTokens}
              />
            )}

            {/* Latest event preview */}
            {latestEvent && (latestEvent.data.thinkingContent || latestEvent.data.toolCallName || latestEvent.data.messageContent) && (
              <div
                style={{
                  marginTop: '8px',
                  padding: '8px',
                  background: 'rgba(0,0,0,0.3)',
                  borderRadius: '8px',
                  fontSize: '11px',
                  color: '#9ca3af',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {latestEvent.data.toolCallName ? `⚡ ${latestEvent.data.toolCallName}` :
                 latestEvent.data.thinkingContent ? `💭 ${latestEvent.data.thinkingContent.slice(0, 60)}...` :
                 latestEvent.data.messageContent ? `💬 ${latestEvent.data.messageContent.slice(0, 60)}...` : ''}
              </div>
            )}
          </button>
        );
      })}

      {agentsList.length === 0 && (
        <div
          style={{
            padding: '24px',
            textAlign: 'center',
            color: '#6b7280',
            fontSize: '14px',
          }}
        >
          No active agents
        </div>
      )}
    </div>
  );
}

function getEventLabel(type: string): string {
  switch (type) {
    case 'agent.thinking': return 'thinking';
    case 'agent.coding': return 'coding';
    case 'agent.tool_call': return 'tool';
    case 'agent.streaming': return 'output';
    case 'agent.asking_user': return 'input';
    case 'agent.idle': return 'idle';
    case 'agent.error': return 'error';
    case 'session.start': return 'start';
    case 'session.end': return 'end';
    default: return type.split('.')[1] ?? type;
  }
}

/**
 * TokenDisplay shows cumulative token usage with a beautiful breakdown.
 * Format: 🪙 12.4k | 📥 3.7k | 📤 8.7k | 🧊 0
 */
function TokenDisplay({ total, input, output, cached }: {
  total: number;
  input: number;
  output: number;
  cached: number;
}) {
  const format = (n: number) => {
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return n.toString();
  };

  return (
    <div
      style={{
        marginTop: '8px',
        padding: '8px 10px',
        background: 'rgba(16, 185, 129, 0.08)',
        borderRadius: '10px',
        border: '1px solid rgba(16, 185, 129, 0.2)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      {/* Main total line */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <span style={{ fontSize: '12px' }}>🪙</span>
        <span style={{
          fontSize: '12px',
          fontWeight: 600,
          color: '#10b981',
          fontFamily: 'monospace',
        }}>
          {format(total)}
        </span>
        <span style={{ fontSize: '10px', color: '#6b7280' }}>tokens</span>
      </div>

      {/* Breakdown row */}
      <div style={{
        display: 'flex',
        gap: '10px',
        fontSize: '9px',
        fontFamily: 'monospace',
      }}>
        {/* Input tokens */}
        {input > 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
            color: '#60a5fa',
          }}>
            <span>📥</span>
            <span>{format(input)}</span>
          </div>
        )}


        {/* Output tokens */}
        {output > 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
            color: '#f472b6',
          }}>
            <span>📤</span>
            <span>{format(output)}</span>
          </div>
        )}

        {/* Cached tokens */}
        {cached > 0 && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '3px',
            color: '#a78bfa',
          }}>
            <span>🧊</span>
            <span>{format(cached)}</span>
          </div>
        )}
      </div>
    </div>
  );
}