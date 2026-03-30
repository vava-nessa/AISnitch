import { useEffect, useState } from 'react';
import type { AgentCardState } from '../types';
import { getToolColor } from '../lib/toolColors';
import { getMascotEmoji } from '../lib/mascotEmojis';
import { Particles } from './Particles';
import './MascotCard.css';

function formatDuration(isoStart: string): string {
  const diff = Date.now() - new Date(isoStart).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remSec}s`;
  const hours = Math.floor(minutes / 60);
  const remMin = minutes % 60;
  if (hours < 24) return `${hours}h ${remMin}m`;
  const days = Math.floor(hours / 24);
  const remH = hours % 24;
  return `${days}d ${remH}h`;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

interface MascotCardProps {
  readonly agent: AgentCardState;
}

export function MascotCard({ agent }: MascotCardProps) {
  const toolColor = getToolColor(agent.tool);
  const { emoji, label } = getMascotEmoji(agent.mascotState, agent.isSleeping, agent.isKilled);
  const stateColor = agent.isKilled
    ? '#ef4444'
    : agent.isSleeping
      ? '#6b7280'
      : agent.mascotState.color;

  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const circleBg = `radial-gradient(circle at 40% 35%, ${hexToRgba(stateColor, 0.25)}, ${hexToRgba(stateColor, 0.08)})`;
  const circleShadow = `0 0 20px ${hexToRgba(stateColor, 0.3)}, 0 0 60px ${hexToRgba(stateColor, 0.1)}`;

  const displayPath = agent.projectPath ?? agent.cwd ?? agent.project ?? '';

  const cardClass = [
    'mascot-card',
    agent.isKilled ? 'killed' : '',
    agent.isSleeping && !agent.isKilled ? 'sleeping' : '',
  ].filter(Boolean).join(' ');

  const bodyClass = [
    'mascot-body',
    agent.isSleeping && !agent.isKilled ? 'breathing' : '',
    agent.isKilled ? 'shake' : '',
  ].filter(Boolean).join(' ');

  const particleMood = agent.isKilled ? 'killed' : agent.isSleeping ? 'sleeping' : agent.mascotState.mood;

  return (
    <div className={cardClass}>
      <div className="card-header">
        <div className="tool-identity">
          <span className="tool-dot" style={{ background: toolColor, boxShadow: `0 0 6px ${hexToRgba(toolColor, 0.5)}` }} />
          <span className="tool-name">{agent.tool}</span>
        </div>
        {agent.terminal && <span className="terminal-name">{agent.terminal}</span>}
      </div>

      {displayPath && (
        <div className="card-path" title={displayPath}>{displayPath}</div>
      )}

      <div className={bodyClass}>
        <Particles mood={particleMood} color={stateColor} />
        <div
          className="mascot-circle"
          style={{ background: circleBg, boxShadow: circleShadow }}
        >
          <span className="mascot-emoji">{emoji}</span>
          <span className="mascot-label" style={{ color: stateColor }}>{label}</span>
        </div>
      </div>

      <div className="activity-box">
        <div className="activity-header">
          <span className="activity-emoji">{agent.activity.emoji}</span>
          <span className="activity-verb" style={{ color: stateColor }}>{agent.activity.verb}</span>
        </div>
        {agent.activity.detail && (
          <div className="activity-detail" title={agent.activity.detail}>
            {agent.activity.detail}
          </div>
        )}
      </div>

      <div className="card-footer">
        <div className="card-meta">
          <span>{agent.eventCount} events</span>
          <span className="meta-separator">·</span>
          <span>{formatDuration(agent.startedAt)}</span>
        </div>
      </div>
    </div>
  );
}
