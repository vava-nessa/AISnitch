import { useState, type Dispatch, type SetStateAction } from 'react';
import { useInput } from 'ink';

import {
  AISNITCH_EVENT_TYPES,
  type AISnitchEventType,
  type ToolName,
} from '../../core/index.js';
import {
  DEFAULT_TUI_FILTERS,
  type TuiFilters,
} from '../filters.js';
import type { TuiViewMode } from '../types.js';

/**
 * @file src/tui/hooks/useKeyBinds.ts
 * @description Centralized keyboard controller for the AISnitch TUI, including filters, focus, help, and stream actions.
 * @functions
 *   → useKeyBinds
 * @exports FocusedPanel, SelectorOption, TuiInteractionMode, UseKeyBindsOptions, UseKeyBindsState, useKeyBinds
 * @see ../components/FilterBar.tsx
 * @see ../components/HelpOverlay.tsx
 * @see ../App.tsx
 */

/**
 * Panel focus ids supported by the current TUI.
 */
export type FocusedPanel = 'events' | 'sessions';

/**
 * Generic selector option used by tool/type filter pickers.
 */
export interface SelectorOption<TValue> {
  readonly label: string;
  readonly value: TValue;
}

/**
 * Current interactive mode of the TUI.
 */
export type TuiInteractionMode =
  | {
      readonly kind: 'normal';
    }
  | {
      readonly kind: 'help';
    }
  | {
      readonly kind: 'search';
      readonly draft: string;
    }
  | {
      readonly kind: 'tool-filter';
      readonly options: readonly SelectorOption<ToolName | null>[];
      readonly selectedIndex: number;
    }
  | {
      readonly kind: 'type-filter';
      readonly options: readonly SelectorOption<AISnitchEventType | null>[];
      readonly selectedIndex: number;
    };

/**
 * Inputs needed by the keyboard controller.
 */
export interface UseKeyBindsOptions {
  readonly fullDataModeEnabled?: boolean;
  readonly initialFilters?: Partial<TuiFilters>;
  readonly onClearStream: () => void;
  readonly onInspectorPageScroll?: (delta: number) => void;
  readonly onInspectorScroll?: (delta: number) => void;
  readonly onQuit?: () => void;
  readonly onSelectNextEvent?: () => void;
  readonly onSelectPreviousEvent?: () => void;
  readonly onToggleFreeze: () => void;
  readonly onToggleFullDataMode?: () => void;
  readonly toolOptions: readonly ToolName[];
}

/**
 * State returned by the keyboard controller.
 */
export interface UseKeyBindsState {
  readonly filters: TuiFilters;
  readonly focusPanel: FocusedPanel;
  readonly interaction: TuiInteractionMode;
  readonly viewMode: TuiViewMode;
}

/**
 * 📖 Keeping key handling in one hook prevents `App` from turning into a pile
 * of unrelated `useInput` branches as the TUI grows more interactive.
 */
export function useKeyBinds(
  options: UseKeyBindsOptions,
): UseKeyBindsState {
  const toolOptions = buildToolOptions(options.toolOptions);
  const typeOptions = buildTypeOptions();
  const [filters, setFilters] = useState<TuiFilters>({
    ...DEFAULT_TUI_FILTERS,
    ...options.initialFilters,
    query: options.initialFilters?.query ?? '',
  });
  const [focusPanel, setFocusPanel] = useState<FocusedPanel>('events');
  const [interaction, setInteraction] = useState<TuiInteractionMode>({
    kind: 'normal',
  });
  const [viewMode, setViewMode] = useState<TuiViewMode>(
    options.fullDataModeEnabled === true ? 'full-data' : 'summary',
  );

  useInput((input, key) => {
    if (key.ctrl && input === 'c') {
      options.onQuit?.();
      return;
    }

    if (interaction.kind === 'search') {
      if (key.escape) {
        clearFilters(setFilters, setInteraction);
        return;
      }

      if (key.return) {
        setInteraction({
          kind: 'normal',
        });
        return;
      }

      if (key.backspace || key.delete) {
        const nextDraft = interaction.draft.slice(0, -1);

        setFilters((currentValue) => ({
          ...currentValue,
          query: nextDraft,
        }));
        setInteraction({
          kind: 'search',
          draft: nextDraft,
        });
        return;
      }

      if (!key.ctrl && !key.meta && input.length > 0) {
        const nextDraft = `${interaction.draft}${input}`;

        setFilters((currentValue) => ({
          ...currentValue,
          query: nextDraft,
        }));
        setInteraction({
          kind: 'search',
          draft: nextDraft,
        });
      }

      return;
    }

    if (
      interaction.kind === 'tool-filter' ||
      interaction.kind === 'type-filter'
    ) {
      if (key.escape) {
        clearFilters(setFilters, setInteraction);
        return;
      }

      if (key.upArrow || input === 'k') {
        setInteraction(moveSelector(interaction, -1));
        return;
      }

      if (key.downArrow || input === 'j') {
        setInteraction(moveSelector(interaction, 1));
        return;
      }

      if (key.return) {
        if (interaction.kind === 'tool-filter') {
          setFilters((currentValue) => ({
            ...currentValue,
            tool: interaction.options[interaction.selectedIndex]?.value ?? null,
          }));
        } else {
          setFilters((currentValue) => ({
            ...currentValue,
            eventType:
              interaction.options[interaction.selectedIndex]?.value ?? null,
          }));
        }

        setInteraction({
          kind: 'normal',
        });
      }

      return;
    }

    if (interaction.kind === 'help') {
      if (input === 'q') {
        options.onQuit?.();
        return;
      }

      if (input === '?' || key.escape || key.return) {
        setInteraction({
          kind: 'normal',
        });
      }

      return;
    }

    if (input === 'q') {
      options.onQuit?.();
      return;
    }

    if (input === 'v') {
      const nextViewMode = viewMode === 'summary' ? 'full-data' : 'summary';

      options.onToggleFullDataMode?.();
      setViewMode(nextViewMode);

      if (nextViewMode === 'summary' && focusPanel === 'sessions') {
        setFocusPanel('events');
      }

      return;
    }

    if (input === ' ') {
      options.onToggleFreeze();
      return;
    }

    if (input === 'c') {
      options.onClearStream();
      return;
    }

    if (input === '?') {
      setInteraction({
        kind: 'help',
      });
      return;
    }

    if (input === 'f') {
      setInteraction({
        kind: 'tool-filter',
        options: toolOptions,
        selectedIndex: getSelectedIndex(toolOptions, filters.tool),
      });
      return;
    }

    if (input === 't') {
      setInteraction({
        kind: 'type-filter',
        options: typeOptions,
        selectedIndex: getSelectedIndex(typeOptions, filters.eventType),
      });
      return;
    }

    if (input === '/') {
      setInteraction({
        kind: 'search',
        draft: filters.query,
      });
      return;
    }

    if (key.escape) {
      clearFilters(setFilters, setInteraction);
      return;
    }

    if (
      viewMode === 'full-data' &&
      (key.upArrow || input === 'k')
    ) {
      if (focusPanel === 'events') {
        options.onSelectPreviousEvent?.();
      } else {
        options.onInspectorScroll?.(-1);
      }
      return;
    }

    if (
      viewMode === 'full-data' &&
      (key.downArrow || input === 'j')
    ) {
      if (focusPanel === 'events') {
        options.onSelectNextEvent?.();
      } else {
        options.onInspectorScroll?.(1);
      }
      return;
    }

    if (viewMode === 'full-data' && input === '[') {
      options.onInspectorPageScroll?.(-1);
      return;
    }

    if (viewMode === 'full-data' && input === ']') {
      options.onInspectorPageScroll?.(1);
      return;
    }

    if (key.tab) {
      setFocusPanel((currentValue) =>
        currentValue === 'events' ? 'sessions' : 'events',
      );
    }
  });

  return {
    filters,
    focusPanel,
    interaction,
    viewMode,
  };
}

function buildToolOptions(
  tools: readonly ToolName[],
): readonly SelectorOption<ToolName | null>[] {
  return [
    {
      label: 'All tools',
      value: null,
    },
    ...tools.map((tool) => ({
      label: tool,
      value: tool,
    })),
  ];
}

function buildTypeOptions(): readonly SelectorOption<AISnitchEventType | null>[] {
  return [
    {
      label: 'All event types',
      value: null,
    },
    ...AISNITCH_EVENT_TYPES.map((eventType) => ({
      label: eventType,
      value: eventType,
    })),
  ];
}

function getSelectedIndex<TValue>(
  options: readonly SelectorOption<TValue>[],
  value: TValue,
): number {
  const selectedIndex = options.findIndex((option) => option.value === value);

  return selectedIndex === -1 ? 0 : selectedIndex;
}

function moveSelector(
  interaction:
    | Extract<TuiInteractionMode, { readonly kind: 'tool-filter' }>
    | Extract<TuiInteractionMode, { readonly kind: 'type-filter' }>,
  delta: number,
):
  | Extract<TuiInteractionMode, { readonly kind: 'tool-filter' }>
  | Extract<TuiInteractionMode, { readonly kind: 'type-filter' }> {
  const nextIndex =
    (interaction.selectedIndex + delta + interaction.options.length) %
    interaction.options.length;

  return {
    ...interaction,
    selectedIndex: nextIndex,
  };
}

function clearFilters(
  setFilters: Dispatch<SetStateAction<TuiFilters>>,
  setInteraction: Dispatch<SetStateAction<TuiInteractionMode>>,
): void {
  setFilters(DEFAULT_TUI_FILTERS);
  setInteraction({
    kind: 'normal',
  });
}
