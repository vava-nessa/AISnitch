/**
 * @file src/components/EventDisplay.tsx
 * @description Fullscreen event display with live content, inspired by AI observability
 * platforms like LangSmith, Helicone, and Langfuse. Shows thinking, tool calls,
 * messages, and results in a visually appealing format.
 *
 * Design patterns borrowed from:
 * - LangSmith: trace display with spans
 * - Helicone: session-based tool tracking
 * - Langfuse: generation and tool call display
 */

import { useEffect, useState, useRef, useMemo } from 'react';
import type { AISnitchEvent, AgentDisplay } from '../types';
import { EVENT_COLORS, EVENT_LABELS, EVENT_ICONS } from '../types';

/**
 * ContentPriority determines what content to show when multiple fields are available.
 * Priority order: thinking > tool_call > message > final_message > metadata
 */
type ContentPriority = 'thinking' | 'tool' | 'message' | 'final' | 'metadata';

/**
 * ContentBlock represents a displayable piece of content with metadata.
 */
interface ContentBlock {
  type: ContentPriority;
  label: string;
  content: string;
  icon: string;
  style: 'prose' | 'code' | 'summary' | 'minimal';
}

interface EventDisplayProps {
  agent: AgentDisplay | null;
}

/**
 * Determines which content to prioritize and formats it for display.
 */
function extractContentBlocks(event: AISnitchEvent): ContentBlock[] {
  const blocks: ContentBlock[] = [];
  const { data, type } = event;
  const label = EVENT_LABELS[type] ?? type;

  // Priority 1: Thinking/Reasoning content (most valuable for AI observability)
  if (data.thinkingContent) {
    blocks.push({
      type: 'thinking',
      label: '🧠 Reasoning Chain',
      content: data.thinkingContent,
      icon: '💭',
      style: 'prose',
    });
  }

  // Priority 2: Tool calls with results (core of agent activity)
  if (data.toolCallName) {
    const toolLabel = `🔧 ${data.toolCallName}`;
    blocks.push({
      type: 'tool',
      label: toolLabel,
      content: data.toolCallName,
      icon: '⚡',
      style: 'minimal',
    });

    // Show tool input if available
    if (data.toolInput) {
      const { filePath, command } = data.toolInput;
      const inputText = filePath
        ? `File: ${filePath}`
        : command
          ? `Command: ${command}`
          : JSON.stringify(data.toolInput);
      blocks.push({
        type: 'tool',
        label: '📥 Input',
        content: inputText,
        icon: '📥',
        style: 'code',
      });
    }

    // Show tool result if available
    if (data.toolResult) {
      blocks.push({
        type: 'tool',
        label: '📤 Output',
        content: data.toolResult,
        icon: '📤',
        style: 'code',
      });
    }
  }

  // Priority 3: Message content (streaming output)
  if (data.messageContent) {
    blocks.push({
      type: 'message',
      label: '💬 AI Response',
      content: data.messageContent,
      icon: '💬',
      style: 'prose',
    });
  }

  // Priority 4: Final session summary
  if (data.finalMessage) {
    blocks.push({
      type: 'final',
      label: '✨ Session Summary',
      content: data.finalMessage,
      icon: '✨',
      style: 'summary',
    });
  }

  // Priority 5: Metadata fallback when no content available
  if (blocks.length === 0) {
    // Show whatever metadata we have
    const metadataParts: string[] = [];

    if (data.project) metadataParts.push(`Project: ${data.project}`);
    if (data.activeFile) metadataParts.push(`File: ${data.activeFile}`);
    if (data.model) metadataParts.push(`Model: ${data.model}`);
    if (data.cwd) metadataParts.push(`CWD: ${data.cwd}`);
    if (data.errorMessage) metadataParts.push(`Error: ${data.errorMessage}`);

    // Show event type specific info
    const eventSpecific = getEventSpecificInfo(event);
    if (eventSpecific) metadataParts.push(...eventSpecific);

    if (metadataParts.length > 0) {
      blocks.push({
        type: 'metadata',
        label: `📊 ${label}`,
        content: metadataParts.join('\n'),
        icon: EVENT_ICONS[type] ?? '📌',
        style: 'code',
      });
    } else {
      blocks.push({
        type: 'metadata',
        label: label,
        content: 'No additional content available for this event.',
        icon: EVENT_ICONS[type] ?? '📌',
        style: 'minimal',
      });
    }
  }

  return blocks;
}

/**
 * Extracts event-type specific information for display.
 */
function getEventSpecificInfo(event: AISnitchEvent): string[] {
  const info: string[] = [];
  const { type, data } = event;

  switch (type) {
    case 'session.start':
      if (data.project) info.push(`Starting session for: ${data.project}`);
      if (data.cwd) info.push(`Working directory: ${data.cwd}`);
      break;
    case 'session.end':
      info.push('Session ended');
      if (data.duration) {
        const seconds = Math.round(data.duration / 1000);
        info.push(`Duration: ${seconds}s`);
      }
      break;
    case 'agent.thinking':
      info.push('Processing reasoning...');
      break;
    case 'agent.streaming':
      info.push('Streaming response...');
      break;
    case 'agent.tool_call':
    case 'agent.coding':
      info.push('Executing tool...');
      if (data.toolName) info.push(`Tool: ${data.toolName}`);
      break;
    case 'agent.compact':
      info.push('Context compaction in progress...');
      break;
    case 'agent.error':
      info.push('An error occurred');
      if (data.errorMessage) info.push(`Message: ${data.errorMessage}`);
      if (data.errorType) info.push(`Type: ${data.errorType}`);
      break;
    case 'task.start':
      info.push('New task started');
      break;
    default:
      if (data.raw) {
        // Try to extract useful info from raw data
        const raw = data.raw as Record<string, unknown>;
        if (raw.opencodeEvent) {
          const oe = raw.opencodeEvent as Record<string, unknown>;
          if (oe.type) info.push(`Event type: ${oe.type}`);
          if (oe.properties) {
            const props = oe.properties as Record<string, unknown>;
            if (props.project) info.push(`Project: ${String(props.project)}`);
            if (props.cwd) info.push(`CWD: ${String(props.cwd)}`);
          }
        }
      }
  }

  return info;
}

/**
 * Truncates content for display with proper handling of code vs prose.
 */
function truncateContent(content: string, maxLength: number = 3000, style: ContentBlock['style'] = 'prose'): string {
  if (content.length <= maxLength) return content;

  // For code content, be more aggressive with truncation
  const limit = style === 'code' ? maxLength * 0.7 : maxLength * 0.9;
  const truncated = content.slice(0, Math.floor(limit));

  return truncated + '\n\n... [truncated for display]';
}

/**
 * Main EventDisplay component.
 * Displays live activity from the AISnitch agent with content prioritization.
 */
export function EventDisplay({ agent }: EventDisplayProps) {
  const [displayedEvent, setDisplayedEvent] = useState<AISnitchEvent | null>(null);
  const [contentBlocks, setContentBlocks] = useState<ContentBlock[]>([]);
  const [animationKey, setAnimationKey] = useState(0);
  const eventQueueRef = useRef<AISnitchEvent[]>([]);
  const displayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Queue new events and auto-display them with debouncing
  useEffect(() => {
    if (agent?.currentEvent) {
      // Add to queue, keep last 50 events
      eventQueueRef.current = [agent.currentEvent, ...eventQueueRef.current].slice(0, 50);

      // Debounce display updates
      if (displayTimeoutRef.current) {
        clearTimeout(displayTimeoutRef.current);
      }

      displayTimeoutRef.current = setTimeout(() => {
        // Find the most significant event (has content fields)
        const significantEvent =
          eventQueueRef.current.find((e) => {
            const d = e.data;
            return (
              d.thinkingContent ||
              d.toolCallName ||
              d.messageContent ||
              d.finalMessage ||
              d.toolResult
            );
          }) ?? eventQueueRef.current[0] ?? null;

        if (significantEvent) {
          setDisplayedEvent(significantEvent);
          setContentBlocks(extractContentBlocks(significantEvent));
          setAnimationKey((k) => k + 1);
        }
      }, 200);
    }

    return () => {
      if (displayTimeoutRef.current) {
        clearTimeout(displayTimeoutRef.current);
      }
    };
  }, [agent?.currentEvent]);

  // Show waiting state
  if (!displayedEvent || contentBlocks.length === 0) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          gap: '16px',
          color: '#9ca3af',
          fontSize: '20px',
          background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        }}
      >
        <div style={{ fontSize: '48px', opacity: 0.5 }}>👁️</div>
        <div>Waiting for activity...</div>
        <div style={{ fontSize: '14px', color: '#6b7280' }}>
          Activity will appear here as events are captured
        </div>
      </div>
    );
  }

  const eventType = displayedEvent.type as keyof typeof EVENT_COLORS;
  const baseColor = EVENT_COLORS[eventType] ?? '#4a5568';
  const label = EVENT_LABELS[eventType] ?? eventType;
  const icon = EVENT_ICONS[eventType] ?? '📌';
  const { activeFile, project, model, duration, errorMessage } = displayedEvent.data;

  // Format duration for display
  const durationDisplay = duration ? formatDuration(duration) : null;

  return (
    <div
      key={animationKey}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        width: '100%',
        background: 'linear-gradient(135deg, #0d1117 0%, #161b22 100%)',
        animation: 'fadeSlideIn 0.4s ease-out',
        overflow: 'hidden',
      }}
    >
      {/* Fixed Header with event type */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px 32px',
          background: 'rgba(0,0,0,0.4)',
          borderBottom: `1px solid ${baseColor}40`,
          backdropFilter: 'blur(10px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '24px' }}>{icon}</span>
          <span
            style={{
              fontSize: '14px',
              color: '#e5e7eb',
              fontWeight: 600,
              textTransform: 'uppercase',
              letterSpacing: '1px',
            }}
          >
            {label}
          </span>
        </div>

        {/* Metadata badges */}
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          {project && (
            <MetadataBadge icon="📁" label={project} />
          )}
          {activeFile && (
            <MetadataBadge icon="📄" label={activeFile.split('/').pop() ?? activeFile} />
          )}
          {model && (
            <MetadataBadge icon="🤖" label={model} />
          )}
          {durationDisplay && (
            <MetadataBadge icon="⏱️" label={durationDisplay} />
          )}
          {errorMessage && (
            <MetadataBadge icon="⚠️" label="Error" color="#ef4444" />
          )}
        </div>
      </div>

      {/* Scrollable content area */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          padding: '32px',
          display: 'flex',
          flexDirection: 'column',
          gap: '24px',
        }}
      >
        {/* Content blocks */}
        {contentBlocks.map((block, index) => (
          <ContentBlockDisplay
            key={`${block.type}-${index}`}
            block={block}
            index={index}
            baseColor={baseColor}
          />
        ))}

        {/* Raw data section (collapsed by default) */}
        {displayedEvent.data.raw && (
          <RawDataSection raw={displayedEvent.data.raw} />
        )}
      </div>

      {/* Fade In Animation */}
      <style>{`
        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

/**
 * Displays a single content block with appropriate styling.
 */
interface ContentBlockDisplayProps {
  block: ContentBlock;
  index: number;
  baseColor: string;
}

function ContentBlockDisplay({ block, index, baseColor }: ContentBlockDisplayProps) {
  const truncated = truncateContent(block.content);

  switch (block.style) {
    case 'prose':
      return (
        <div
          style={{
            animation: `fadeSlideIn 0.3s ease-out ${index * 0.05}s both`,
          }}
        >
          <div
            style={{
              fontSize: '12px',
              color: '#9ca3af',
              marginBottom: '8px',
              textTransform: 'uppercase',
              letterSpacing: '2px',
              fontWeight: 600,
            }}
          >
            {block.label}
          </div>
          <div
            style={{
              fontSize: '15px',
              color: '#d1d5db',
              lineHeight: 1.9,
              fontFamily: '"IBM Plex Sans", Georgia, serif',
              whiteSpace: 'pre-wrap',
              padding: '24px',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: '16px',
              border: '1px solid rgba(255,255,255,0.08)',
              borderLeft: `3px solid ${baseColor}`,
            }}
          >
            {truncated}
          </div>
        </div>
      );

    case 'code':
      return (
        <div
          style={{
            animation: `fadeSlideIn 0.3s ease-out ${index * 0.05}s both`,
          }}
        >
          <div
            style={{
              fontSize: '12px',
              color: '#9ca3af',
              marginBottom: '8px',
              textTransform: 'uppercase',
              letterSpacing: '2px',
              fontWeight: 600,
            }}
          >
            {block.label}
          </div>
          <div
            style={{
              fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
              fontSize: '13px',
              color: '#c9d1d9',
              background: '#0d1117',
              padding: '20px',
              borderRadius: '12px',
              border: '1px solid #30363d',
              whiteSpace: 'pre-wrap',
              overflowX: 'auto',
              lineHeight: 1.6,
            }}
          >
            {truncated}
          </div>
        </div>
      );

    case 'summary':
      return (
        <div
          style={{
            animation: `fadeSlideIn 0.3s ease-out ${index * 0.05}s both`,
            background: 'rgba(255,255,255,0.05)',
            padding: '32px',
            borderRadius: '20px',
            border: '2px solid rgba(255,255,255,0.1)',
          }}
        >
          <div
            style={{
              fontSize: '12px',
              color: '#9ca3af',
              marginBottom: '16px',
              textTransform: 'uppercase',
              letterSpacing: '2px',
              fontWeight: 600,
            }}
          >
            {block.label}
          </div>
          <div
            style={{
              fontSize: '18px',
              color: '#e5e7eb',
              lineHeight: 1.7,
              whiteSpace: 'pre-wrap',
            }}
          >
            {truncated}
          </div>
        </div>
      );

    case 'minimal':
    default:
      return (
        <div
          style={{
            animation: `fadeSlideIn 0.3s ease-out ${index * 0.05}s both`,
          }}
        >
          <div
            style={{
              fontSize: '18px',
              color: '#9ca3af',
              fontWeight: 600,
            }}
          >
            {block.label}
          </div>
        </div>
      );
  }
}

/**
 * Displays raw data in an expandable section.
 */
function RawDataSection({ raw }: { raw: unknown }) {
  const [expanded, setExpanded] = useState(false);

  // Try to extract useful fields from raw data
  const usefulFields = useMemo(() => {
    if (!raw || typeof raw !== 'object') return null;

    const rawRecord = raw as Record<string, unknown>;
    const entries = Object.entries(rawRecord).filter(([key, val]) => {
      // Filter out large binary fields
      if (key === 'opencodeEvent') return false;
      if (typeof val === 'string' && val.length > 1000) return false;
      return true;
    });

    return entries.length > 0 ? Object.fromEntries(entries) : null;
  }, [raw]);

  if (!usefulFields) return null;

  return (
    <div style={{ marginTop: '24px' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          background: 'transparent',
          border: '1px solid #30363d',
          borderRadius: '8px',
          padding: '8px 16px',
          color: '#6b7280',
          fontSize: '12px',
          cursor: 'pointer',
          transition: 'all 0.2s',
        }}
      >
        <span>{expanded ? '▼' : '▶'}</span>
        <span>Raw Data</span>
      </button>

      {expanded && (
        <pre
          style={{
            marginTop: '12px',
            padding: '16px',
            background: '#0d1117',
            borderRadius: '8px',
            border: '1px solid #30363d',
            fontSize: '11px',
            color: '#8b949e',
            overflow: 'auto',
            maxHeight: '300px',
          }}
        >
          {JSON.stringify(usefulFields, null, 2)}
        </pre>
      )}
    </div>
  );
}

/**
 * Displays a small metadata badge.
 */
function MetadataBadge({
  icon,
  label,
  color,
}: {
  icon: string;
  label: string;
  color?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        background: 'rgba(255,255,255,0.05)',
        borderRadius: '16px',
        fontSize: '12px',
        color: color ?? '#9ca3af',
        border: `1px solid ${color ? `${color}40` : 'rgba(255,255,255,0.1)'}`,
      }}
    >
      <span>{icon}</span>
      <span style={{ maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
    </div>
  );
}

/**
 * Formats duration in milliseconds to human-readable string.
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
}
