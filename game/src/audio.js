// Synthesised sound for Solmar Bay: no audio files, everything is an oscillator or
// filtered noise made by the Web Audio API. The context is created on the first user
// gesture, so a page that never gets a click stays silent instead of throwing.
export function createAudio() {
  let context = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenOn = false;

  function ensure() {
    if (context) return context;
    try {
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
    } catch {
      context = null;
    }
    return context;
  }

  function blip(freq, seconds, type, volume) {
    const ctx = ensure();
    if (!ctx) return;
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume || 0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + seconds);
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  function noise(seconds, volume, filterFreq) {
    const ctx = ensure();
    if (!ctx) return;
    try {
      const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = filterFreq || 1200;
      const gain = ctx.createGain();
      gain.gain.value = volume || 0.2;
      source.connect(filter).connect(gain).connect(ctx.destination);
      source.start();
    } catch {
      // Sound is garnish: never let it break the game.
    }
  }

  return {
    unlock() {
      const ctx = ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    engine(on, speedRatio) {
      const ctx = ensure();
      if (!ctx) return;
      try {
        if (on && !engineOsc) {
          engineOsc = ctx.createOscillator();
          engineGain = ctx.createGain();
          engineOsc.type = 'sawtooth';
          engineOsc.frequency.value = 60;
          engineGain.gain.value = 0.03;
          engineOsc.connect(engineGain).connect(ctx.destination);
          engineOsc.start();
        }
        if (!on && engineOsc) {
          engineOsc.stop();
          engineOsc = null;
          engineGain = null;
        }
        if (engineOsc) {
          engineOsc.frequency.value = 55 + (speedRatio || 0) * 140;
          engineGain.gain.value = 0.025 + (speedRatio || 0) * 0.03;
        }
      } catch {
        // Sound is garnish.
      }
    },
    siren(on) {
      if (on === sirenOn) return;
      sirenOn = on;
      const ctx = ensure();
      if (!ctx) return;
      try {
        if (on && !sirenOsc) {
          sirenOsc = ctx.createOscillator();
          sirenGain = ctx.createGain();
          sirenOsc.type = 'sine';
          sirenOsc.frequency.value = 700;
          sirenGain.gain.value = 0.035;
          const lfo = ctx.createOscillator();
          const lfoGain = ctx.createGain();
          lfo.frequency.value = 0.9;
          lfoGain.gain.value = 320;
          lfo.connect(lfoGain).connect(sirenOsc.frequency);
          sirenOsc.connect(sirenGain).connect(ctx.destination);
          sirenOsc.start();
          lfo.start();
          sirenOsc._lfo = lfo;
        } else if (!on && sirenOsc) {
          sirenOsc._lfo.stop();
          sirenOsc.stop();
          sirenOsc = null;
          sirenGain = null;
        }
      } catch {
        // Sound is garnish.
      }
    },
    shot() { noise(0.12, 0.25, 2500); },
    crash() { noise(0.25, 0.3, 500); },
    pickup() { blip(880, 0.18, 'sine', 0.14); setTimeout(() => blip(1320, 0.22, 'sine', 0.12), 90); },
    missionDone() { blip(523, 0.15, 'triangle', 0.14); setTimeout(() => blip(659, 0.15, 'triangle', 0.14), 120); setTimeout(() => blip(784, 0.3, 'triangle', 0.14), 240); },
    busted() { blip(220, 0.4, 'sawtooth', 0.1); },
  };
}
