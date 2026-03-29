let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function playTone(freq: number, duration: number, type: OscillatorType = 'sine', volume = 0.12): void {
  try {
    const ctx = getCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = volume;
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch {
    // 📖 Silently fail — AudioContext may not be available or blocked
  }
}

export function playBoot(): void {
  playTone(520, 0.15, 'sine');
  setTimeout(() => playTone(780, 0.2, 'sine'), 100);
}

export function playStateChange(mood: string): void {
  switch (mood) {
    case 'thinking': playTone(440, 0.1, 'triangle'); break;
    case 'working': playTone(600, 0.08, 'square', 0.06); break;
    case 'celebrating':
      playTone(523, 0.1, 'sine');
      setTimeout(() => playTone(659, 0.1, 'sine'), 80);
      setTimeout(() => playTone(784, 0.15, 'sine'), 160);
      break;
    case 'panicking':
      playTone(200, 0.3, 'sawtooth', 0.08);
      break;
    case 'waiting':
      playTone(880, 0.15, 'sine');
      setTimeout(() => playTone(880, 0.15, 'sine'), 200);
      break;
    default: playTone(350, 0.05, 'sine', 0.05);
  }
}

export function playKill(): void {
  playTone(300, 0.15, 'sawtooth', 0.1);
  setTimeout(() => playTone(200, 0.2, 'sawtooth', 0.08), 100);
  setTimeout(() => playTone(100, 0.4, 'sawtooth', 0.06), 220);
}

export function playSleep(): void {
  playTone(350, 0.3, 'sine', 0.06);
  setTimeout(() => playTone(300, 0.4, 'sine', 0.04), 200);
}
