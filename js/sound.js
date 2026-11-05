// Generated music, nothing to download: a plucked oud over a drone, in real maqam tuning.
// Quarter tones are the point. Rast's third and seventh sit between a piano's keys.
const MAQAM = {
  rast: [0, 2, 3.5, 5, 7, 9, 10.5, 12],
  hijaz: [0, 1, 4, 5, 7, 8, 10, 12],
  nahawand: [0, 2, 3, 5, 7, 8, 11, 12],
  bayati: [0, 1.5, 3, 5, 7, 8, 10, 12],
  saba: [0, 1.5, 3, 4, 7, 8, 10, 12],
};
const BASE = 146.83; // D3

export function createSound(onPluck) {
  let ctx = null, master = null, timer = 0, maqam = 'rast', degree = 0, nextAt = 0, drone = [], beat = 0, on = false;
  let pluckBuf = null;

  function karplus(freq, seconds) {
    const sr = ctx.sampleRate;
    const n = Math.floor(sr * seconds);
    const buf = ctx.createBuffer(1, n, sr);
    const data = buf.getChannelData(0);
    const period = Math.round(sr / freq);
    const line = new Float32Array(period);
    for (let i = 0; i < period; i++) line[i] = Math.random() * 2 - 1;
    let idx = 0, last = 0;
    for (let i = 0; i < n; i++) {
      const cur = line[idx];
      const next = 0.5 * (cur + last) * 0.9965;
      last = cur;
      line[idx] = next;
      data[i] = cur * (1 - i / n);
      idx = (idx + 1) % period;
    }
    return buf;
  }

  function setup() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    // A short feedback delay stands in for a room.
    const delay = ctx.createDelay(1.2);
    delay.delayTime.value = 0.46;
    const fb = ctx.createGain();
    fb.gain.value = 0.5;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 1500;
    master.connect(comp).connect(ctx.destination);
    master.connect(delay);
    delay.connect(damp).connect(fb).connect(delay);
    fb.connect(comp);
    pluckBuf = karplus(BASE * 2, 2.6);
    // Low drone, then a high airy pad that swells very slowly.
    for (const [ratio, gain] of [[0.5, 0.05], [0.75, 0.024], [1, 0.016], [2, 0.012], [3.004, 0.007], [4.5, 0.004]]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = BASE * ratio;
      const g = ctx.createGain();
      g.gain.value = gain;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.05 + ratio * 0.04;
      const lg = ctx.createGain();
      lg.gain.value = gain * 0.4;
      lfo.connect(lg).connect(g.gain);
      o.connect(g).connect(master);
      o.start();
      lfo.start();
      drone.push(o, lfo);
    }
  }

  function pluck(when, semis, vel) {
    const src = ctx.createBufferSource();
    src.buffer = pluckBuf;
    src.playbackRate.value = (BASE * Math.pow(2, semis / 12)) / (BASE * 2) * 2;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900 + Math.random() * 400;
    f.Q.value = 0.5;
    const g = ctx.createGain();
    g.gain.value = 0.34 * vel;
    src.connect(f).connect(g).connect(master);
    src.start(when);
    const delayMs = Math.max(0, (when - ctx.currentTime) * 1000);
    setTimeout(() => on && onPluck?.(vel), delayMs);
  }

  function drum(when, low) {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(low ? 96 : 210, when);
    o.frequency.exponentialRampToValueAtTime(low ? 54 : 140, when + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(low ? 0.2 : 0.07, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + (low ? 0.32 : 0.14));
    o.connect(g).connect(master);
    o.start(when);
    o.stop(when + 0.4);
  }

  // Melody walks the scale by small steps and rests often, which is what keeps it from sounding like a toy.
  function schedule() {
    const scale = MAQAM[maqam];
    while (nextAt < ctx.currentTime + 0.4) {
      const r = Math.random();
      if (r > 0.2) {
        degree = Math.max(0, Math.min(scale.length * 2 - 2, degree + [-2, -1, -1, 1, 1, 2][Math.floor(Math.random() * 6)]));
        const oct = Math.floor(degree / (scale.length - 1));
        const semis = scale[degree % (scale.length - 1)] + oct * 12;
        pluck(nextAt, semis, 0.55 + Math.random() * 0.45);
        if (Math.random() < 0.18) pluck(nextAt + 0.09, semis, 0.32);
      }
      if (beat % 8 === 0) drum(nextAt, true);
      if (beat % 8 === 3 || beat % 8 === 6) drum(nextAt, false);
      beat++;
      nextAt += [0.36, 0.36, 0.72, 0.18][Math.floor(Math.random() * 4)];
    }
  }

  return {
    toggle() {
      on = !on;
      if (on) {
        if (!ctx) setup();
        ctx.resume();
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 1.4);
        nextAt = ctx.currentTime + 0.1;
        timer = setInterval(schedule, 120);
      } else if (ctx) {
        clearInterval(timer);
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
      }
      return on;
    },
    setMaqam(name) { if (MAQAM[name]) maqam = name; },
    // Little hits for the games, when the music is on.
    tick(semis = 12, vel = 0.6) { if (on && ctx) pluck(ctx.currentTime + 0.001, semis, vel); },
    get on() { return on; },
  };
}
