import type { MascotState } from '@aisnitch/client';
import './Particles.css';

type ParticleMood = MascotState['mood'] | 'sleeping' | 'killed';

interface ParticlesProps {
  readonly mood: ParticleMood;
  readonly color: string;
}

const MOOD_PARTICLES: Record<ParticleMood, string[]> = {
  thinking: ['✨', '✨', '✨', '💫', '✨'],
  working: ['⚡', '⚡', '⚡', '✦', '⚡'],
  celebrating: ['🎉', '🎊', '✨', '🎉', '🎊'],
  waiting: ['❗', '❗', '❗', '❓', '❗'],
  panicking: ['💥', '⚡', '🔴', '💥', '⚡'],
  idle: ['·', '·', '·', '·', '·'],
  sleeping: ['💤', '💤', '💤', '💤', '💤'],
  killed: ['💀', '💥', '🔥', '💀', '⚡'],
};

function getParticleClass(mood: ParticleMood): string {
  switch (mood) {
    case 'sleeping': return 'particle particle-zzz';
    case 'celebrating': return 'particle particle-confetti';
    case 'working': return 'particle particle-spark';
    case 'panicking': return 'particle particle-spark';
    case 'killed': return 'particle particle-spark';
    default: return 'particle';
  }
}

export function Particles({ mood, color }: ParticlesProps) {
  const chars = MOOD_PARTICLES[mood] ?? MOOD_PARTICLES['idle']!;
  const cls = getParticleClass(mood);

  return (
    <div className="particles">
      {chars.map((char, i) => (
        <span key={i} className={cls} style={{ color: i % 2 === 0 ? color : undefined }}>
          {char}
        </span>
      ))}
    </div>
  );
}
