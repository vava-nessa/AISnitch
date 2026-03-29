import { useEffect, useRef } from 'react';
import type { TickerEvent } from '../types';
import { getToolColor } from '../lib/toolColors';
import './EventTicker.css';

interface EventTickerProps {
  readonly events: readonly TickerEvent[];
}

export function EventTicker({ events }: EventTickerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [events.length]);

  if (events.length === 0) return null;

  return (
    <div className="event-ticker">
      <span className="ticker-label">▸</span>
      <div className="ticker-events" ref={scrollRef}>
        {events.map((ev, i) => (
          <span key={`${ev.timestamp}-${i}`} className="ticker-pill">
            <span className="ticker-tool" style={{ color: getToolColor(ev.tool) }}>
              {ev.tool}
            </span>
            <span>{ev.text}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
