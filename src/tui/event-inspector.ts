import { formatSessionLabelFromEvent, type AISnitchEvent } from '../core/index.js';
import { formatEventDetail } from './event-details.js';
import { EVENT_COLORS, TOOL_COLORS, TUI_THEME, type TuiThemeColor } from './theme.js';

/**
 * @file src/tui/event-inspector.ts
 * @description Visual full-data formatter for the TUI event inspector, including colorful metadata rows and syntax-highlighted JSON blocks.
 * @functions
 *   → buildEventInspectorLines
 *   → getVisibleInspectorWindow
 * @exports InspectorSegment, InspectorLine, buildEventInspectorLines, getVisibleInspectorWindow
 * @see ./components/EventInspector.tsx
 * @see ./App.tsx
 */

const JSON_TOKEN_PATTERN =
  /("(?:\\.|[^"])*"(?=\s*:))|("(?:\\.|[^"])*")|\b(true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|[[\]{}:,]/gu;

/**
 * Small token model rendered by the Ink inspector component.
 */
export interface InspectorSegment {
  readonly bold?: boolean;
  readonly color?: TuiThemeColor;
  readonly text: string;
}

/**
 * One rendered line inside the full-data inspector.
 */
export type InspectorLine = readonly InspectorSegment[];

/**
 * 📖 The inspector deliberately mixes curated metadata with raw pretty JSON.
 * Operators get a friendly summary first, then the complete payload without
 * needing to mentally decode one enormous unstyled blob.
 */
export function buildEventInspectorLines(
  event: AISnitchEvent,
): readonly InspectorLine[] {
  const eventColor = EVENT_COLORS[event.type];
  const toolColor = TOOL_COLORS[event['aisnitch.tool']];
  const sessionLabel = formatSessionLabelFromEvent(event);
  const detailSummary = formatEventDetail(event);
  const normalizedData = removeRawPayload(event.data);
  const rawPayload = event.data.raw ?? {
    note: 'No adapter raw payload was attached to this event.',
  };

  return [
    [
      { color: eventColor, text: '◉ ' },
      {
        bold: true,
        color: eventColor,
        text: event.type,
      },
      { color: TUI_THEME.muted, text: '  ' },
      { bold: true, color: toolColor, text: `[${event['aisnitch.tool']}]` },
    ],
    [
      { color: TUI_THEME.muted, text: 'session ' },
      { color: TUI_THEME.panelBody, text: sessionLabel },
      { color: TUI_THEME.muted, text: '  •  ' },
      { color: TUI_THEME.panelBody, text: formatEventTimestamp(event.time) },
      { color: TUI_THEME.muted, text: '  •  seq ' },
      { color: TUI_THEME.panelBody, text: `#${event['aisnitch.seqnum']}` },
    ],
    [
      { color: TUI_THEME.warning, text: '━━ Spotlight ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' },
    ],
    ...buildOptionalKeyValueLines([
      ['summary', detailSummary],
      ['project', event.data.projectPath ?? event.data.project],
      ['cwd', event.data.cwd],
      ['active_file', event.data.activeFile],
      ['command', event.data.toolInput?.command],
      ['model', event.data.model],
      [
        'tokens',
        event.data.tokensUsed !== undefined
          ? `${event.data.tokensUsed.toLocaleString('en-US')} tok`
          : undefined,
      ],
      ['terminal', event.data.terminal],
      ['pid', event.data.pid],
      [
        'instance',
        event.data.instanceIndex !== undefined &&
        event.data.instanceTotal !== undefined
          ? `${event.data.instanceIndex}/${event.data.instanceTotal}`
          : event.data.instanceId,
      ],
    ]),
    [{ text: '' }],
    [
      { color: TUI_THEME.warning, text: '━━ Envelope ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' },
    ],
    ...buildKeyValueLines([
      ['id', event.id],
      ['source', event.source],
      ['specversion', event.specversion],
      ['seq', String(event['aisnitch.seqnum'])],
      ['session_id', event['aisnitch.sessionid']],
      ['tool', event['aisnitch.tool']],
      ['time', event.time],
      ['type', event.type],
    ]),
    [{ text: '' }],
    [
      { color: TUI_THEME.success, text: '━━ Normalized Data ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' },
    ],
    ...buildJsonLines(normalizedData),
    [{ text: '' }],
    [
      { color: TUI_THEME.warning, text: '━━ Raw Source Payload ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━' },
    ],
    ...buildJsonLines(rawPayload),
  ];
}

/**
 * Returns the visible scroll window for inspector lines.
 */
export function getVisibleInspectorWindow(
  lines: readonly InspectorLine[],
  options: {
    readonly lineOffset: number;
    readonly visibleLineCount: number;
  },
): readonly InspectorLine[] {
  const safeLineOffset = Math.max(0, options.lineOffset);
  const safeVisibleLineCount = Math.max(1, options.visibleLineCount);

  return lines.slice(safeLineOffset, safeLineOffset + safeVisibleLineCount);
}

function buildKeyValueLines(
  entries: readonly (readonly [string, unknown])[],
): readonly InspectorLine[] {
  return entries.map(([key, value]) => [
    { color: TUI_THEME.muted, text: '  ' },
    { color: '#7dd3fc', text: `${key}: ` },
    { color: TUI_THEME.panelBody, text: formatKeyValue(value) },
  ]);
}

function buildOptionalKeyValueLines(
  entries: readonly (readonly [string, unknown])[],
): readonly InspectorLine[] {
  return buildKeyValueLines(
    entries.filter((entry): entry is readonly [string, unknown] => {
      const [, value] = entry;

      return hasDisplayValue(value);
    }),
  );
}

function buildJsonLines(value: unknown): readonly InspectorLine[] {
  const prettyJson = JSON.stringify(value, null, 2);

  if (!prettyJson) {
    return [[{ color: TUI_THEME.muted, text: '  (empty)' }]];
  }

  return prettyJson.split('\n').map((line) => highlightJsonLine(line));
}

function highlightJsonLine(line: string): InspectorLine {
  if (line.length === 0) {
    return [{ text: '' }];
  }

  const segments: InspectorSegment[] = [];
  let lastIndex = 0;

  for (const match of line.matchAll(JSON_TOKEN_PATTERN)) {
    const matchedValue = match[0];
    const matchIndex = match.index ?? 0;

    if (matchIndex > lastIndex) {
      segments.push({
        color: TUI_THEME.panelBody,
        text: line.slice(lastIndex, matchIndex),
      });
    }

    segments.push({
      color: resolveJsonTokenColor(matchedValue, match),
      text: matchedValue,
    });
    lastIndex = matchIndex + matchedValue.length;
  }

  if (lastIndex < line.length) {
    segments.push({
      color: TUI_THEME.panelBody,
      text: line.slice(lastIndex),
    });
  }

  return segments.length > 0
    ? segments
    : [{ color: TUI_THEME.panelBody, text: line }];
}

function resolveJsonTokenColor(
  token: string,
  match: RegExpMatchArray,
): TuiThemeColor {
  if (match[1]) {
    return '#7dd3fc';
  }

  if (match[2]) {
    return '#86efac';
  }

  if (token === 'true' || token === 'false') {
    return '#c084fc';
  }

  if (token === 'null') {
    return TUI_THEME.muted;
  }

  if (/^-?\d/u.test(token)) {
    return '#fb923c';
  }

  return TUI_THEME.muted;
}

function removeRawPayload(
  data: AISnitchEvent['data'],
): Record<string, unknown> {
  const { raw: _raw, ...normalizedData } = data;

  return normalizedData;
}

function formatKeyValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  if (value === null || value === undefined) {
    return 'n/a';
  }

  return JSON.stringify(value);
}

function hasDisplayValue(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === 'string') {
    return value.length > 0;
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return true;
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  return Object.keys(value).length > 0;
}

function formatEventTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
  }).format(new Date(timestamp));
}
