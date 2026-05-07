/**
 * @file src/components/EventDisplay.tsx
 * @description Fullscreen event display with live content
 */

import { useEffect, useState, useRef } from 'react';
import type { AISnitchEvent, AgentDisplay } from '../types';
import { EVENT_COLORS, EVENT_LABELS, EVENT_ICONS } from '../types';

interface EventDisplayProps {
  agent: AgentDisplay | null;
}

export function EventDisplay({ agent }: EventDisplayProps) {
  const [displayedEvent, setDisplayedEvent] = useState<AISnitchEvent | null>(null);
  const [animationKey, setAnimationKey] = useState(0);
  const eventQueueRef = useRef<AISnitchEvent[]>([]);
  const displayTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Queue new events and auto-display them
  useEffect(() => {
    if (agent?.currentEvent) {
      // Add to queue
      eventQueueRef.current = [agent.currentEvent, ...eventQueueRef.current].slice(0, 50);

      // Auto-display new events (debounced)
      if (displayTimeoutRef.current) {
        clearTimeout(displayTimeoutRef.current);
      }

      displayTimeoutRef.current = setTimeout(() => {
        // Show the most recent significant event
        const significantEvent = eventQueueRef.current.find(
          (e) =>
            e.data.thinkingContent ||
            e.data.toolCallName ||
            e.data.messageContent ||
            e.data.finalMessage ||
            e.type === 'agent.coding' ||
            e.type === 'agent.thinking'
        ) ?? eventQueueRef.current[0] ?? null;

        if (significantEvent) {
          setDisplayedEvent(significantEvent);
          setAnimationKey((k) => k + 1);
        }
      }, 300);
    }

    return () => {
      if (displayTimeoutRef.current) {
        clearTimeout(displayTimeoutRef.current);
      }
    };
  }, [agent?.currentEvent]);

  if (!displayedEvent) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: '#6b7280',
          fontSize: '24px',
        }}
      >
        Waiting for activity...
      </div>
    );
  }

  const eventType = displayedEvent.type;
  const bgColor = EVENT_COLORS[eventType];
  const label = EVENT_LABELS[eventType];
  const icon = EVENT_ICONS[eventType];
  const { thinkingContent, toolCallName, finalMessage, toolResult, messageContent, activeFile } =
    displayedEvent.data;

  // Determine what content to show
  let mainContent = '';
  let subContent = '';
  let codeContent: string | null = null;

  if (thinkingContent) {
    mainContent = thinkingContent;
    subContent = 'Reasoning chain';
  } else if (toolCallName) {
    mainContent = `Tool: ${toolCallName}`;
    if (toolResult) {
      codeContent = toolResult;
      subContent = 'Result';
    }
    if (displayedEvent.data.toolInput) {
      const { filePath, command } = displayedEvent.data.toolInput;
      if (filePath) {
        subContent = `File: ${filePath}`;
      } else if (command) {
        subContent = `Command: ${command}`;
      }
    }
  } else if (finalMessage) {
    mainContent = finalMessage;
    subContent = 'Session Summary';
  } else if (messageContent) {
    mainContent = messageContent;
    subContent = 'AI Output';
  } else {
    mainContent = label;
    subContent = displayedEvent.data.project ?? '';
  }

  // Truncate main content for display
  const displayContent = mainContent.length > 2000 ? mainContent.slice(0, 2000) + '...' : mainContent;

  return (
    <div
      key={animationKey}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        width: '100%',
        padding: '80px 40px 40px',
        background: `linear-gradient(135deg, ${bgColor}ee 0%, ${bgColor}99 50%, ${bgColor}66 100%)`,
        animation: 'fadeSlideIn 0.5s ease-out',
        overflow: 'auto',
      }}
    >
      {/* Event Type Badge */}
      <div
        style={{
          position: 'absolute',
          top: '80px',
          left: '40px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 16px',
          background: 'rgba(0,0,0,0.5)',
          borderRadius: '20px',
          backdropFilter: 'blur(10px)',
        }}
      >
        <span style={{ fontSize: '20px' }}>{icon}</span>
        <span style={{ fontSize: '14px', color: '#e5e7eb', fontWeight: 600 }}>
          {label}
        </span>
      </div>

      {/* File indicator */}
      {activeFile && (
        <div
          style={{
            position: 'absolute',
            top: '80px',
            right: '40px',
            padding: '6px 12px',
            background: 'rgba(0,0,0,0.5)',
            borderRadius: '12px',
            fontSize: '12px',
            color: '#9ca3af',
            fontFamily: 'monospace',
            backdropFilter: 'blur(10px)',
            maxWidth: '300px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          📄 {activeFile}
        </div>
      )}

      {/* Main Content */}
      <div
        style={{
          maxWidth: '900px',
          width: '100%',
          textAlign: 'center',
        }}
      >
        {/* Tool Call Name */}
        {toolCallName && (
          <div
            style={{
              fontSize: '14px',
              color: '#9ca3af',
              marginBottom: '16px',
              textTransform: 'uppercase',
              letterSpacing: '2px',
            }}
          >
            {toolCallName}
          </div>
        )}

        {/* Thinking Content */}
        {thinkingContent && (
          <div
            style={{
              fontSize: '16px',
              color: '#d1d5db',
              lineHeight: 1.8,
              fontFamily: 'Georgia, serif',
              fontStyle: 'italic',
              whiteSpace: 'pre-wrap',
              textAlign: 'left',
              padding: '24px',
              background: 'rgba(0,0,0,0.3)',
              borderRadius: '16px',
              border: '1px solid rgba(255,255,255,0.1)',
              maxHeight: '60vh',
              overflow: 'auto',
            }}
          >
            {displayContent}
          </div>
        )}

        {/* Message Content */}
        {!thinkingContent && messageContent && (
          <div
            style={{
              fontSize: '18px',
              color: '#e5e7eb',
              lineHeight: 1.8,
              fontFamily: 'system-ui, sans-serif',
              whiteSpace: 'pre-wrap',
              padding: '24px',
              background: 'rgba(0,0,0,0.3)',
              borderRadius: '16px',
              border: '1px solid rgba(255,255,255,0.1)',
              maxHeight: '70vh',
              overflow: 'auto',
            }}
          >
            {displayContent}
          </div>
        )}

        {/* Final Message */}
        {!thinkingContent && !messageContent && mainContent && (
          <div
            style={{
              fontSize: '20px',
              color: '#e5e7eb',
              lineHeight: 1.6,
              padding: '32px',
              background: 'rgba(0,0,0,0.4)',
              borderRadius: '20px',
              border: '2px solid rgba(255,255,255,0.15)',
              fontFamily: 'system-ui, sans-serif',
            }}
          >
            {displayContent}
          </div>
        )}

        {/* Code Result */}
        {codeContent && (
          <div
            style={{
              marginTop: '24px',
              padding: '20px',
              background: '#0d1117',
              borderRadius: '12px',
              border: '1px solid #30363d',
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              fontSize: '14px',
              color: '#c9d1d9',
              textAlign: 'left',
              whiteSpace: 'pre-wrap',
              maxHeight: '200px',
              overflow: 'auto',
            }}
          >
            {codeContent}
          </div>
        )}

        {/* Sub Content Label */}
        {subContent && (
          <div
            style={{
              marginTop: '24px',
              fontSize: '12px',
              color: '#6b7280',
              textTransform: 'uppercase',
              letterSpacing: '2px',
            }}
          >
            {subContent}
          </div>
        )}
      </div>

      {/* Fade In Animation */}
      <style>{`
        @keyframes fadeSlideIn {
          from {
            opacity: 0;
            transform: translateY(20px);
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