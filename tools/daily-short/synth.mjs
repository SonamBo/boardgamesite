// The Shorts' sound: the BoardGameSite signature, game sounds and a calm chord bed with a soft echo.
// synth({ dur, sounds: [{ t, name }] }) returns a 44.1 kHz stereo WAV as a Buffer.
const SR = 44100;
export function synth(script) {
  const n = Math.ceil(script.dur * SR);
  const out = new Float32Array(n);
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 * 2 - 1; };
  const env = (k, dur) => Math.min(k / (0.006 * SR), 1) * Math.exp(Math.log(1e-4) * Math.min(k / (dur * SR), 1));
  const wave = (type, ph) => type === 'triangle' ? (2 / Math.PI) * Math.asin(Math.sin(ph)) : type === 'square' ? Math.sign(Math.sin(ph)) : Math.sin(ph);
  function tone(t0, f, dur, { type = 'sine', vol = 0.25, to = 0 } = {}) {
    const i0 = Math.floor(t0 * SR), len = Math.floor((dur + 0.03) * SR);
    let ph = 0;
    for (let k = 0; k < len && i0 + k < n; k++) {
      const fr = to ? f * Math.pow(to / f, Math.min(k / (dur * SR), 1)) : f;
      ph += 2 * Math.PI * fr / SR;
      if (i0 + k >= 0) out[i0 + k] += wave(type, ph) * env(k, dur) * vol;
    }
  }
  function noise(t0, dur, { vol = 0.2, freq = 1500 } = {}) {
    // a simple resonant band-pass on white noise
    const i0 = Math.floor(t0 * SR), len = Math.floor((dur + 0.03) * SR);
    const w = 2 * Math.PI * freq / SR, q = 1.2, alpha = Math.sin(w) / (2 * q);
    const b0 = alpha, a0 = 1 + alpha, a1 = -2 * Math.cos(w), a2 = 1 - alpha;
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (let k = 0; k < len && i0 + k < n; k++) {
      const x = rand();
      const y = (b0 * x - b0 * x2 - a1 * y1 - a2 * y2) / a0;
      x2 = x1; x1 = x; y2 = y1; y1 = y;
      if (i0 + k >= 0) out[i0 + k] += y * 3 * env(k, dur) * vol;
    }
  }
  // Musical parts (the signature, mallet notes and the bed) also go to a soft echo; game clicks stay dry.
  const wet = new Float32Array(n);
  const mallet = (t0, f, dur, vol, dest = [out, wet]) => {
    // a warm marimba-like note: a few partials, the high ones dying away first
    const i0 = Math.floor(t0 * SR), len = Math.floor((dur + 0.05) * SR);
    const parts = [[1, 1, 1], [2, 0.28, 1.8], [3.9, 0.07, 3.2]];
    for (let k = 0; k < len && i0 + k < n; k++) {
      if (i0 + k < 0) continue;
      const t = k / SR, a = Math.min(t / 0.006, 1);
      let v = 0;
      for (const [m, amp, fast] of parts) v += Math.sin(2 * Math.PI * f * m * t) * amp * Math.exp(-t * fast * 4 / dur);
      v *= a * vol;
      for (const d of dest) d[i0 + k] += v;
    }
  };
  const NOTE = { C4: 261.63, E4: 329.63, G4: 392.0, A4: 440.0, C5: 523.25, D5: 587.33, E5: 659.25, G5: 783.99, A5: 880.0, C6: 1046.5 };
  // The BoardGameSite signature: the same four notes at the start of every Short (and, softly, on the end card).
  const signature = (t, vol = 1) => {
    [['C5', 0], ['G5', 0.16], ['E5', 0.32], ['C6', 0.56]].forEach(([nm, dt], i) => mallet(t + dt, NOTE[nm], i === 3 ? 1.6 : 0.7, (i === 3 ? 0.22 : 0.18) * vol));
    mallet(t + 0.56, NOTE.C4, 1.6, 0.08 * vol);
    mallet(t + 0.56, NOTE.G4, 1.6, 0.05 * vol);
  };
  const M = 0.42;
  const SOUNDS = {
    drop: (t) => { tone(t, 200, 0.14, { to: 90, vol: 0.32 * M }); noise(t, 0.04, { vol: 0.08 * M, freq: 500 }); },
    select: (t) => mallet(t, NOTE.G5, 0.25, 0.06),
    tick: (t) => mallet(t, NOTE.E5, 0.18, 0.045, [out]),
    move: (t) => { tone(t, 420, 0.06, { vol: 0.16 * M }); noise(t, 0.02, { vol: 0.06 * M, freq: 2400 }); },
    capture: (t) => { mallet(t, NOTE.A4, 0.3, 0.1); mallet(t + 0.08, NOTE.E4, 0.35, 0.09); },
    king: (t) => signature(t, 0.55),
    place: (t) => { tone(t, 300, 0.08, { to: 220, vol: 0.22 * M }); noise(t, 0.02, { vol: 0.06 * M, freq: 2200 }); },
    flip: (t) => mallet(t, NOTE.C6, 0.12, 0.035, [out]),
    found: (t) => mallet(t, NOTE.A5, 0.4, 0.09),
    win: (t) => [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C6].forEach((f, i) => mallet(t + i * 0.09, f, i === 3 ? 1.2 : 0.5, 0.13)),
    lose: (t) => [NOTE.E5, NOTE.D5, NOTE.A4].forEach((f, i) => mallet(t + i * 0.14, f, 0.5, 0.08)),
  };
  signature(0.05);
  for (const s of script.sounds) if (SOUNDS[s.name]) SOUNDS[s.name](s.t);

  // A calm bed: soft major-seventh chords, four seconds each, fading in under the signature.
  const D = script.dur;
  const CHORDS = [[130.81, 164.81, 196.0, 246.94], [110.0, 130.81, 164.81, 196.0], [87.31, 110.0, 130.81, 164.81], [98.0, 123.47, 146.83, 220.0]];
  const LEN = 4, FADE = 1.2;
  const lvl = (t) => Math.min(1, Math.max(0, (t - 1.2) / 1.5)) * Math.min(1, Math.max(0, (D - t) / 1.5));
  for (let k = 0; k < n; k++) {
    const t = k / SR;
    const idx = Math.floor(t / LEN), local = t - idx * LEN;
    let v = 0;
    for (const [ci, w] of [[idx, Math.min(1, local / FADE)], [idx - 1, Math.max(0, 1 - local / FADE)]]) {
      if (ci < 0 || w <= 0) continue;
      for (const f of CHORDS[ci % 4]) v += (Math.sin(2 * Math.PI * f * t) + 0.12 * Math.sin(4 * Math.PI * f * t)) * w;
    }
    const b = v / 4 * 0.05 * lvl(t) * (0.85 + 0.15 * Math.sin(2 * Math.PI * 0.2 * t));
    out[k] += b; wet[k] += b * 0.6;
  }
  // a soft note at each chord change, so the bed moves without getting busy
  for (let c = 1; c * LEN < D - 1.5; c++) mallet(c * LEN, CHORDS[c % 4][2] * 2, 1.4, 0.035);

  // stereo echo: different delays left and right, gently fed back
  const L = Float32Array.from(out), R = Float32Array.from(out);
  for (const [buf, delay, fb, mix] of [[L, 0.211, 0.32, 0.22], [R, 0.287, 0.32, 0.22]]) {
    const dn = Math.floor(delay * SR), echo = new Float32Array(n);
    for (let k = dn; k < n; k++) echo[k] = wet[k - dn] + echo[k - dn] * fb;
    for (let k = 0; k < n; k++) buf[k] += echo[k] * mix;
  }
  let peak = 0;
  for (let k = 0; k < n; k++) peak = Math.max(peak, Math.abs(L[k]), Math.abs(R[k]));
  const g = peak ? 0.79 / peak : 1;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let k = 0; k < n; k++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[k] * g)) * 32767), 44 + k * 4);
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[k] * g)) * 32767), 46 + k * 4);
  }
  return buf;
}
