// Procedural sound only: every sound is synthesized with WebAudio, no audio
// files. The engine hums with the throttle, the wind rises with speed, and rings,
// warnings, landings and crashes each have their own short voice. Nothing here
// runs until the player first interacts — browsers require a gesture — and M
// mutes everything.

export function createAudio() {
  let context = null;
  let engineOsc = null;
  let engineOsc2 = null;
  let engineGain = null;
  let engineFilter = null;
  let windSource = null;
  let windGain = null;
  let windFilter = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (started) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      context = new AudioContext();
      started = true;
    } catch {
      return false;
    }
    // Engine: two detuned saws through a low-pass, pitched by the throttle.
    engineOsc = context.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 55;
    engineOsc2 = context.createOscillator();
    engineOsc2.type = 'sawtooth';
    engineOsc2.frequency.value = 55.7;
    engineFilter = context.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineGain = context.createGain();
    engineGain.gain.value = 0;
    engineOsc.connect(engineFilter);
    engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain);
    engineGain.connect(context.destination);
    engineOsc.start();
    engineOsc2.start();
    // Wind: looped noise through a band-pass, louder and higher with speed.
    const length = context.sampleRate;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = Math.random() * 2 - 1;
    windSource = context.createBufferSource();
    windSource.buffer = buffer;
    windSource.loop = true;
    windFilter = context.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 700;
    windFilter.Q.value = 0.6;
    windGain = context.createGain();
    windGain.gain.value = 0;
    windSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(context.destination);
    windSource.start();
    return true;
  }

  function tone(frequency, duration, type, volume, when = 0, slideTo = null) {
    if (!started || muted || !context) return;
    const t0 = context.currentTime + when;
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, t0);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, t0);
    gain.gain.linearRampToValueAtTime(volume, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(gain);
    gain.connect(context.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.05);
  }

  function noiseBurst(duration, volume, filterFrequency) {
    if (!started || muted || !context) return;
    const length = Math.floor(context.sampleRate * duration);
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFrequency;
    const gain = context.createGain();
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);
    source.start();
  }

  return {
    /** Call from the first gesture: builds the graph and resumes the context. */
    unlock() {
      if (ensure() && context && context.state === 'suspended') context.resume();
    },
    /** Continuous engine + wind, called every frame with the plane's state. */
    update(throttle, speed, flying) {
      if (!started || !context) return;
      const t = context.currentTime;
      const target = muted ? 0 : (flying ? 0.05 + throttle * 0.075 : throttle * 0.03);
      engineGain.gain.setTargetAtTime(target, t, 0.1);
      const freq = 48 + throttle * 62 + speed * 0.25;
      engineOsc.frequency.setTargetAtTime(freq, t, 0.08);
      engineOsc2.frequency.setTargetAtTime(freq * 1.012, t, 0.08);
      engineFilter.frequency.setTargetAtTime(320 + throttle * 900, t, 0.1);
      const windTarget = muted ? 0 : flying ? Math.min(0.16, speed * 0.0011) : 0;
      windGain.gain.setTargetAtTime(windTarget, t, 0.15);
      windFilter.frequency.setTargetAtTime(500 + speed * 6, t, 0.15);
    },
    setMuted(value) {
      muted = value;
      if (started && context) {
        const t = context.currentTime;
        if (engineGain) engineGain.gain.setTargetAtTime(muted ? 0 : 0.05, t, 0.05);
        if (windGain) windGain.gain.setTargetAtTime(0, t, 0.05);
      }
    },
    isMuted() { return muted; },
    ring() {
      tone(880, 0.35, 'sine', 0.22);
      tone(1318, 0.45, 'sine', 0.18, 0.07);
    },
    refuel() {
      tone(523, 0.2, 'sine', 0.2);
      tone(659, 0.2, 'sine', 0.2, 0.09);
      tone(784, 0.35, 'sine', 0.2, 0.18);
    },
    mission() {
      tone(523, 0.18, 'triangle', 0.22);
      tone(659, 0.18, 'triangle', 0.22, 0.12);
      tone(784, 0.18, 'triangle', 0.22, 0.24);
      tone(1046, 0.4, 'triangle', 0.24, 0.36);
    },
    hit() {
      noiseBurst(0.25, 0.35, 900);
      tone(140, 0.3, 'square', 0.16, 0, 70);
    },
    crash() {
      noiseBurst(0.9, 0.5, 500);
      tone(90, 0.8, 'sawtooth', 0.25, 0, 35);
    },
    land() {
      noiseBurst(0.18, 0.2, 700);
      tone(180, 0.22, 'sine', 0.18, 0, 90);
    },
    takeoff() {
      tone(330, 0.5, 'sine', 0.12, 0, 660);
    },
    warning() {
      tone(980, 0.12, 'square', 0.1);
      tone(980, 0.12, 'square', 0.1, 0.18);
    },
  };
}
