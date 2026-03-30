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

// 📖 Deterministic color from project name — uses a simple string hash to pick
// a saturated HSL hue so the same project always gets the same color, even across
// multiple cards / sessions. Saturation & lightness tuned for dark backgrounds.
function projectNameToColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
    hash |= 0; // 📖 force 32-bit int
  }
  const hue = ((hash % 360) + 360) % 360;
  return `hsl(${hue}, 75%, 60%)`;
}

// 📖 Extract just the last folder name from a full path or project name
function lastSegment(path: string): string {
  const segments = path.replace(/\/+$/, '').split('/');
  return segments[segments.length - 1] ?? path;
}

// 📖 Get the fixed project name (from project or projectPath, set at session start)
function extractProjectName(agent: AgentCardState): string | null {
  const raw = agent.project ?? agent.projectPath;
  if (!raw) return null;
  return lastSegment(raw);
}

// 📖 Get current subdirectory relative to project root.
// Tries projectPath first, then falls back to finding the project name segment
// in the cwd and cropping everything before it. Shows "./" when at project root.
function extractCwdLabel(agent: AgentCardState): string | null {
  if (!agent.cwd) return null;
  const cwd = agent.cwd.replace(/\/+$/, '');
  const projectRoot = agent.projectPath?.replace(/\/+$/, '');

  // 📖 Exact match with projectPath → at root
  if (projectRoot && cwd === projectRoot) return './';

  // 📖 cwd is inside projectPath → relative
  if (projectRoot && cwd.startsWith(projectRoot + '/')) {
    return './' + cwd.slice(projectRoot.length + 1);
  }

  // 📖 Fallback: find the project name segment in cwd and crop from there
  const projectName = agent.project ?? (projectRoot ? lastSegment(projectRoot) : null);
  if (projectName) {
    const marker = '/' + projectName + '/';
    const idx = cwd.indexOf(marker);
    if (idx !== -1) {
      const after = cwd.slice(idx + marker.length);
      return after ? './' + after : './';
    }
    // 📖 cwd ends with project name → at root
    if (cwd.endsWith('/' + projectName)) return './';
  }

  return cwd;
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

  const projectName = extractProjectName(agent);
  const projectColor = projectName ? projectNameToColor(projectName) : null;
  const cwdLabel = extractCwdLabel(agent);

  // 📖 Detect "active" states for glow intensity + shimmer trigger
  const isCoding = !agent.isKilled && !agent.isSleeping
    && (agent.lastEventType === 'agent.coding' || agent.lastEventType === 'agent.tool_call');
  const isActive = !agent.isKilled && !agent.isSleeping;

  const cardClass = [
    'mascot-card',
    agent.isKilled ? 'killed' : '',
    agent.isSleeping && !agent.isKilled ? 'sleeping' : '',
    isCoding ? 'coding' : '',
  ].filter(Boolean).join(' ');

  const bodyClass = [
    'mascot-body',
    agent.isSleeping && !agent.isKilled ? 'breathing' : '',
    agent.isKilled ? 'shake' : '',
  ].filter(Boolean).join(' ');

  const particleMood = agent.isKilled ? 'killed' : agent.isSleeping ? 'sleeping' : agent.mascotState.mood;

  // 📖 Card border + glow — uses project color. Glow intensity varies by state:
  //   coding → pulsing glow (via CSS animation), active → soft glow, sleeping/killed → none
  const cardStyle: React.CSSProperties = projectColor
    ? {
        borderColor: projectColor,
        boxShadow: isActive
          ? `0 0 12px ${projectColor}40, 0 0 30px ${projectColor}15`
          : undefined,
      }
    : {};

  return (
    <div className={cardClass} style={cardStyle}>
      <div className="card-header">
        <div className="tool-identity">
          <span className="tool-dot" style={{ background: toolColor, boxShadow: `0 0 6px ${hexToRgba(toolColor, 0.5)}` }} />
          <span className="tool-name">{agent.tool}</span>
        </div>
        {/* 📖 Terminal + model pills — shown in header for quick identification */}
        <div className="header-pills">
          {agent.terminal && (
            <span className="terminal-name" style={projectColor ? { borderColor: `${projectColor}50` } : {}}>
              {agent.terminal}
            </span>
          )}
          {agent.model && (
            <span className="model-name" style={projectColor ? { borderColor: `${projectColor}50` } : {}}>
              {agent.model}
            </span>
          )}
        </div>
      </div>

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

      {/* 📖 Project name badge — deterministic color from name hash for instant visual grouping */}
      {projectName && projectColor && (
        <div className="project-section">
          <div
            className={`project-badge${isCoding ? ' shimmer' : ''}`}
            style={{
              background: projectColor,
              color: '#111',
            }}
            title={agent.projectPath ?? agent.project ?? ''}
          >
            {projectName}
          </div>
          {/* 📖 Live cwd — shows current subdirectory when agent navigates inside the project */}
          {cwdLabel && (
            <div
              className="project-cwd"
              style={{ color: projectColor }}
              title={agent.cwd ?? ''}
            >
              {cwdLabel}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
