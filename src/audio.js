// Web Audio で合成する効果音。外部ファイルは使わない。
// AudioContext は最初のユーザージェスチャ（unlock）まで生成しない。
export function createAudio({ muted = true } = {}) {
  let context = null;
  let master = null;
  let noiseBuffer = null;
  let mutedState = Boolean(muted);
  const lastPlayed = Object.create(null);

  function getContextConstructor() {
    return globalThis.AudioContext || globalThis.webkitAudioContext || null;
  }

  function ensureContext() {
    const AudioContextClass = getContextConstructor();
    if (!AudioContextClass) return null;
    if (!context) {
      try {
        context = new AudioContextClass();
        master = context.createGain();
        master.gain.value = mutedState ? 0 : 0.16;
        master.connect(context.destination);
      } catch {
        context = null;
        master = null;
        return null;
      }
    }
    if (context.state === 'suspended') {
      context.resume().catch(() => {});
    }
    return context;
  }

  function unlock() {
    ensureContext();
  }

  function setMuted(value) {
    mutedState = Boolean(value);
    if (master && context) {
      master.gain.setTargetAtTime(mutedState ? 0 : 0.16, context.currentTime, 0.02);
    }
    return mutedState;
  }

  function tone(startFreq, endFreq, duration, type, volume, delay = 0) {
    if (!context || !master) return;
    const t0 = context.currentTime + delay;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, startFreq), t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + duration);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + duration + 0.03);
  }

  function noise(duration, volume, cutoff = 1400, delay = 0) {
    if (!context || !master) return;
    if (!noiseBuffer) {
      const length = Math.floor(context.sampleRate * 0.6);
      noiseBuffer = context.createBuffer(1, length, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) {
        data[i] = Math.random() * 2 - 1;
      }
    }
    const t0 = context.currentTime + delay;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, t0);
    filter.frequency.exponentialRampToValueAtTime(180, t0 + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t0);
    source.stop(t0 + duration + 0.02);
  }

  const throttles = {
    shot: 0.055,
    graze: 0.06,
    clear: 0.12,
    enemyDown: 0.04,
    bossAttack: 0.15,
  };

  function play(name) {
    if (mutedState) return;
    const ctx = ensureContext();
    if (!ctx) return;

    const throttle = throttles[name] || 0;
    const now = ctx.currentTime;
    if (throttle > 0 && lastPlayed[name] !== undefined && now - lastPlayed[name] < throttle) {
      return;
    }
    lastPlayed[name] = now;

    switch (name) {
      case 'start':
        tone(440, 880, 0.22, 'triangle', 0.09);
        tone(660, 1320, 0.22, 'sine', 0.05, 0.08);
        break;
      case 'shot':
        tone(1400, 760, 0.045, 'triangle', 0.026);
        break;
      case 'graze':
        tone(1900, 2400, 0.04, 'sine', 0.018);
        break;
      case 'bomb':
        tone(160, 36, 0.72, 'sawtooth', 0.09);
        noise(0.55, 0.1, 2200);
        break;
      case 'hit':
        tone(240, 55, 0.4, 'sawtooth', 0.12);
        noise(0.35, 0.1, 900);
        break;
      case 'enemyDown':
        tone(300, 90, 0.12, 'square', 0.035);
        noise(0.1, 0.035, 1200);
        break;
      case 'eliteDown':
        tone(180, 45, 0.4, 'sawtooth', 0.09);
        noise(0.35, 0.08, 1600);
        break;
      case 'warning':
        tone(220, 220, 0.18, 'square', 0.05);
        tone(220, 220, 0.18, 'square', 0.05, 0.26);
        break;
      case 'boss':
        tone(110, 440, 0.65, 'sawtooth', 0.07);
        noise(0.5, 0.05, 500);
        break;
      case 'bossAttack':
        tone(720, 520, 0.1, 'square', 0.03);
        break;
      case 'phase':
        tone(300, 900, 0.35, 'triangle', 0.09);
        noise(0.3, 0.05, 2200);
        break;
      case 'bossDown':
        tone(120, 28, 1.2, 'sawtooth', 0.13);
        noise(1.1, 0.12, 2600);
        break;
      case 'power':
        tone(880, 880, 0.08, 'sine', 0.06);
        tone(1320, 1760, 0.12, 'sine', 0.05, 0.06);
        break;
      case 'clear':
        tone(880, 1320, 0.16, 'sine', 0.04);
        break;
      case 'gameover':
        tone(300, 70, 0.9, 'triangle', 0.1);
        break;
      default:
        break;
    }
  }

  return {
    unlock,
    play,
    setMuted,
    isMuted() {
      return mutedState;
    },
  };
}
