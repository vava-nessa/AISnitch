import type { MascotState } from '@aisnitch/client';

interface MascotEmoji {
  readonly emoji: string;
  readonly label: string;
}

type Mood = MascotState['mood'] | 'sleeping' | 'killed';

const MOOD_EMOJIS: Record<Mood, MascotEmoji> = {
  idle: { emoji: '🧊', label: 'Idle' },
  thinking: { emoji: '🤔', label: 'Thinking...' },
  working: { emoji: '⚡', label: 'Working' },
  waiting: { emoji: '🙋', label: 'Needs you!' },
  celebrating: { emoji: '🎉', label: 'Done!' },
  panicking: { emoji: '💥', label: 'Error!' },
  sleeping: { emoji: '😴', label: 'Zzz...' },
  killed: { emoji: '💀', label: 'Killed' },
};

export function getMascotEmoji(
  mascotState: MascotState,
  isSleeping: boolean,
  isKilled: boolean,
): MascotEmoji {
  if (isKilled) return MOOD_EMOJIS['killed']!;
  if (isSleeping) return MOOD_EMOJIS['sleeping']!;
  return MOOD_EMOJIS[mascotState.mood] ?? MOOD_EMOJIS['idle']!;
}

export { MOOD_EMOJIS };
