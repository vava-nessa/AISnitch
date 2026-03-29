import type { AgentCardState } from '../types';
import { MascotCard } from './MascotCard';
import './Dashboard.css';

interface DashboardProps {
  readonly agents: ReadonlyMap<string, AgentCardState>;
}

export function Dashboard({ agents }: DashboardProps) {
  const sorted = [...agents.values()].sort((a, b) => {
    if (a.isKilled !== b.isKilled) return a.isKilled ? 1 : -1;
    if (a.isSleeping !== b.isSleeping) return a.isSleeping ? 1 : -1;
    return new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime();
  });

  if (sorted.length === 0) {
    return (
      <div className="dashboard">
        <div className="empty-state">
          <span className="empty-emoji">🐸</span>
          <div className="empty-title">No agents yet. Start an AI tool and watch it appear!</div>
          <div className="empty-hint">Make sure <code>aisnitch start</code> is running</div>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <div className="agent-grid">
        {sorted.map((agent) => (
          <MascotCard key={agent.sessionId} agent={agent} />
        ))}
      </div>
    </div>
  );
}
