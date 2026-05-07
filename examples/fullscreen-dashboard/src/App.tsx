/**
 * @file src/App.tsx
 * @description Main app with fullscreen agent activity display
 */

import { useAISnitch } from './hooks/useAISnitch';
import { Header } from './components/Header';
import { EventDisplay } from './components/EventDisplay';
import { AgentSelector } from './components/AgentSelector';
import { EventTicker } from './components/EventTicker';

export default function App() {
  const {
    agents,
    activeAgent,
    setActiveAgent,
    connectionStatus,
    recentEvents,
  } = useAISnitch();

  const hasAgents = agents.size > 0;

  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        background: '#0a0a0f',
        color: '#e5e7eb',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <Header agent={activeAgent} connectionStatus={connectionStatus} />

      {/* Agent Selector Sidebar */}
      {hasAgents && (
        <AgentSelector
          agents={agents}
          activeAgentId={activeAgent?.sessionId ?? null}
          onSelectAgent={setActiveAgent}
        />
      )}

      {/* Main Event Display */}
      <div
        style={{
          position: 'absolute',
          top: '60px',
          left: hasAgents ? '280px' : '0',
          right: '0',
          bottom: recentEvents.length > 0 ? '50px' : '0',
          overflow: 'hidden',
        }}
      >
        <EventDisplay agent={activeAgent} />
      </div>

      {/* Event Ticker */}
      {recentEvents.length > 0 && (
        <EventTicker
          events={recentEvents}
          onAgentSelect={(sessionId) => setActiveAgent(sessionId)}
        />
      )}

      {/* Empty State */}
      {!hasAgents && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            color: '#6b7280',
          }}
        >
          <div style={{ fontSize: '64px', marginBottom: '24px' }}>🔍</div>
          <div style={{ fontSize: '24px', marginBottom: '12px' }}>No Active Agents</div>
          <div style={{ fontSize: '14px' }}>
            Start an AI coding tool to see activity here
          </div>
          <div
            style={{
              marginTop: '24px',
              fontSize: '12px',
              color: '#4b5563',
            }}
          >
            Waiting for events on ws://127.0.0.1:4820
          </div>
        </div>
      )}
    </div>
  );
}