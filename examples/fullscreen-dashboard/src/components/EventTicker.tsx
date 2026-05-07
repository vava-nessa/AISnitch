/**
 * @file src/components/EventTicker.tsx
 * @description Bottom ticker showing recent events
 */

import type { AISnitchEvent } from '../types';
import { TOOL_COLORS, TOOL_ICONS, EVENT_COLORS } from '../types';

interface EventTickerProps {
  events: AISnitchEvent[];
  onAgentSelect: (sessionId: string) => void;
}

export function EventTicker({ events, onAgentSelect }: EventTickerProps) {
  if (events.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: '280px',
        right: 0,
        height: '50px',
        background: 'rgba(0,0,0,0.9)',
        backdropFilter: 'blur(10px)',
        borderTop: '1px solid rgba(255,255,255,0.1)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: '8px',
        overflowX: 'auto',
        zIndex: 50,
      }}
    >
      {events.slice(0, 30).map((event, index) => {
        const tool = event['aisnitch.tool'];
        const toolColor = TOOL_COLORS[tool];
        const toolIcon = TOOL_ICONS[tool];
        const bgColor = EVENT_COLORS[event.type];
        const label = getShortLabel(event);

        return (
          <button
            key={`${event.id}-${index}`}
            onClick={() => onAgentSelect(event['aisnitch.sessionid'])}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 12px',
              background: `${bgColor}44`,
              border: `1px solid ${toolColor}44`,
              borderRadius: '16px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontSize: '12px',
              transition: 'all 0.2s ease',
            }}
            title={`${tool}: ${event.type}\n${getFullLabel(event)}`}
          >
            <span style={{ fontSize: '14px' }}>{toolIcon}</span>
            <span style={{ color: toolColor, fontWeight: 600 }}>{getToolShortName(tool)}</span>
            <span style={{ color: '#9ca3af' }}>{label}</span>
          </button>
        );
      })}

      <style>{`
        button:hover {
          transform: scale(1.05);
          border-color: rgba(255,255,255,0.3);
        }
      `}</style>
    </div>
  );
}

function getShortLabel(event: AISnitchEvent): string {
  const { thinkingContent, toolCallName, messageContent, finalMessage } = event.data;

  if (toolCallName) return toolCallName;
  if (thinkingContent) return truncate(thinkingContent, 30);
  if (messageContent) return truncate(messageContent, 30);
  if (finalMessage) return truncate(finalMessage, 30);

  return event.type.split('.')[1];
}

function getFullLabel(event: AISnitchEvent): string {
  const { thinkingContent, toolCallName, messageContent, finalMessage } = event.data;

  if (toolCallName) return `Tool: ${toolCallName}`;
  if (thinkingContent) return `Thinking: ${truncate(thinkingContent, 100)}`;
  if (messageContent) return `Message: ${truncate(messageContent, 100)}`;
  if (finalMessage) return `Summary: ${truncate(finalMessage, 100)}`;

  return event.type;
}

function getToolShortName(tool: string): string {
  switch (tool) {
    case 'claude-code': return 'cc';
    case 'opencode': return 'oc';
    case 'gemini-cli': return 'gem';
    case 'codex': return 'cx';
    case 'goose': return 'go';
    case 'copilot-cli': return 'cp';
    default: return tool.slice(0, 4);
  }
}

function truncate(text: string, maxLength: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > maxLength ? clean.slice(0, maxLength) + '...' : clean;
}