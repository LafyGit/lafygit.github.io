// Generated music, nothing to download: a plucked oud over a drone, in real maqam tuning, with the sea around it.
// Quarter tones are the point. Rast's third and seventh sit between a piano's keys.
// Going under the surface closes a lowpass over everything, the way your ears close in water.
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
  let pluckBuf = null, noiseBuf = null, ears = null, surf = null, rumble = null, verb = null, under = 0;

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

  // A filtered noise loop that breathes. Slow enough to read as swell, not as a hiss.
  function sea(type, freq, q, lfoHz, depth) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const swell = ctx.createGain();
    swell.gain.value = 1 - depth;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = lfoHz;
    const lg = ctx.createGain();
    lg.gain.value = depth;
    lfo.connect(lg).connect(swell.gain);
    const out = ctx.createGain();
    out.gain.value = 0;
    src.connect(f).connect(swell).connect(out);
    src.start();
    lfo.start();
    return out;
  }

  function setup() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    // Everything passes through the ears. Open on the surface, nearly shut in the deep.
    ears = ctx.createBiquadFilter();
    ears.type = 'lowpass';
    ears.frequency.value = 18000;
    ears.Q.value = 0.4;
    // A short feedback delay stands in for a room, and later for a very large room.
    verb = ctx.createDelay(1.2);
    verb.delayTime.value = 0.46;
    const fb = ctx.createGain();
    fb.gain.value = 0.5;
    const damp = ctx.createBiquadFilter();
    damp.type = 'lowpass';
    damp.frequency.value = 1500;
    master.connect(ears).connect(comp).connect(ctx.destination);
    ears.connect(verb);
    verb.connect(damp).connect(fb).connect(verb);
    fb.connect(comp);
    pluckBuf = karplus(BASE * 2, 2.6);
    const sr = ctx.sampleRate;
    noiseBuf = ctx.createBuffer(1, sr * 4, sr);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    surf = sea('bandpass', 620, 0.45, 0.11, 0.42);
    rumble = sea('lowpass', 150, 0.7, 0.06, 0.3);
    surf.connect(comp);
    rumble.connect(comp);
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
    applyDive(0.01);
  }

  function applyDive(ramp) {
    const now = ctx.currentTime;
    ears.frequency.setTargetAtTime(18000 * Math.pow(620 / 18000, under), now, ramp);
    surf.gain.setTargetAtTime((1 - under) * 0.085, now, ramp);
    rumble.gain.setTargetAtTime(under * 0.17, now, ramp);
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
        applyDive(0.6);
      } else if (ctx) {
        clearInterval(timer);
        master.gain.cancelScheduledValues(ctx.currentTime);
        master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.4);
        surf.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
        rumble.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
      }
      return on;
    },
    setMaqam(name) { if (MAQAM[name]) maqam = name; },
    // 0 on the surface, 1 fully under. Cheap to call every frame: it only acts on a real change.
    setDive(amount) {
      if (Math.abs(amount - under) < 0.01) return;
      under = amount;
      if (on && ctx) applyDive(0.25);
    },
    // A burst of noise that falls from a slap to a thud: going through the surface.
    splash() {
      if (!on || !ctx) return;
      const now = ctx.currentTime;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 0.6;
      f.frequency.setValueAtTime(2600, now);
      f.frequency.exponentialRampToValueAtTime(240, now + 0.9);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.5, now + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 1.3);
      src.connect(f).connect(g).connect(ctx.destination);
      src.start(now, Math.random() * 2);
      src.stop(now + 1.4);
    },
    // Sonar: one clean note on the current scale, left ringing in the big room.
    ping() {
      if (!on || !ctx) return;
      const now = ctx.currentTime;
      const scale = MAQAM[maqam];
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = BASE * 4 * Math.pow(2, scale[Math.floor(Math.random() * scale.length)] / 12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(0.22, now + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 1.5);
      o.connect(g);
      g.connect(verb);
      g.connect(ctx.destination);
      o.start(now);
      o.stop(now + 1.6);
    },
    // Whale song: two slow glides with a little wobble, an interval apart, sent into the delay.
    whale() {
      if (!on || !ctx) return;
      const now = ctx.currentTime;
      const shape = [[170, 0], [118, 1.1], [205, 2.5], [92, 4.4]];
      [1, 1.5].forEach((ratio, i) => {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        shape.forEach(([hz, at], k) => (k ? o.frequency.exponentialRampToValueAtTime(hz * ratio, now + at) : o.frequency.setValueAtTime(hz * ratio, now)));
        const wob = ctx.createOscillator();
        wob.frequency.value = 5.2 + i;
        const wg = ctx.createGain();
        wg.gain.value = 3.2;
        wob.connect(wg).connect(o.frequency);
        const f = ctx.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 520;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, now);
        g.gain.exponentialRampToValueAtTime(i ? 0.035 : 0.075, now + 0.9);
        g.gain.setValueAtTime(i ? 0.035 : 0.075, now + 3.4);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 5);
        o.connect(f).connect(g);
        g.connect(verb);
        g.connect(ears);
        o.start(now);
        wob.start(now);
        o.stop(now + 5.1);
        wob.stop(now + 5.1);
      });
    },
    // Little hits for the games, when the music is on.
    tick(semis = 12, vel = 0.6) { if (on && ctx) pluck(ctx.currentTime + 0.001, semis, vel); },
    get on() { return on; },
  };
}
