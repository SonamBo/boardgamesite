// Game sound effects, generated in the browser (no audio files), with a mute switch remembered across pages.
// Any element with data-sound-toggle becomes the on/off button.
import { store } from './site.js';

let on = store.get('bgs-sound', true) !== false;
let ctx = null;
let master = null;
let noiseBuf = null;

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
    } catch (e) {
      ctx = null;
      return null;
    }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
// Browsers only allow sound after the visitor interacts, so wake audio on the first tap or key.
const wake = () => { if (on) ensure(); };
document.addEventListener('pointerdown', wake, true);
document.addEventListener('keydown', wake, true);

function env(g, t0, vol, dur) {
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
}

function tone(t0, freq, dur, { type = 'sine', vol = 0.25, to = 0 } = {}) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  env(g, t0, vol, dur);
  o.connect(g);
  g.connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.03);
}

function noise(t0, dur, { vol = 0.2, freq = 1500, q = 1 } = {}) {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.4), ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const s = ctx.createBufferSource();
  const f = ctx.createBiquadFilter();
  const g = ctx.createGain();
  s.buffer = noiseBuf;
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = q;
  env(g, t0, vol, dur);
  s.connect(f);
  f.connect(g);
  g.connect(master);
  s.start(t0);
  s.stop(t0 + dur + 0.03);
}

const SOUNDS = {
  drop: (t) => { tone(t, 230, 0.16, { to: 95, vol: 0.4 }); noise(t, 0.05, { vol: 0.15, freq: 500 }); },
  select: (t) => tone(t, 880, 0.04, { type: 'triangle', vol: 0.1 }),
  move: (t) => { tone(t, 560, 0.06, { type: 'triangle', vol: 0.2 }); noise(t, 0.03, { vol: 0.12, freq: 3000 }); },
  capture: (t) => { tone(t, 440, 0.07, { type: 'triangle', vol: 0.25 }); tone(t + 0.07, 294, 0.1, { type: 'triangle', vol: 0.25 }); },
  king: (t) => [659, 880, 1175].forEach((f, i) => tone(t + i * 0.07, f, 0.13, { type: 'triangle', vol: 0.2 })),
  place: (t) => { tone(t, 340, 0.09, { to: 220, vol: 0.32 }); noise(t, 0.03, { vol: 0.12, freq: 2500 }); },
  flip: (t) => tone(t, 990, 0.035, { type: 'triangle', vol: 0.11 }),
  card: (t) => noise(t, 0.07, { vol: 0.28, freq: 2300, q: 0.8 }),
  shuffle: (t) => { for (let i = 0; i < 5; i++) noise(t + i * 0.03, 0.05, { vol: 0.14, freq: 1800 + i * 200 }); },
  found: (t) => { noise(t, 0.05, { vol: 0.16, freq: 2400 }); tone(t + 0.02, 988, 0.1, { vol: 0.14 }); },
  error: (t) => tone(t, 150, 0.12, { type: 'square', vol: 0.05 }),
  win: (t) => [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.1, f, 0.24, { type: 'triangle', vol: 0.24 })),
  lose: (t) => [392, 330, 262].forEach((f, i) => tone(t + i * 0.15, f, 0.26, { type: 'triangle', vol: 0.2 })),
  draw: (t) => { tone(t, 440, 0.15, { type: 'triangle', vol: 0.2 }); tone(t + 0.17, 440, 0.2, { type: 'triangle', vol: 0.2 }); }
};

// play('drop'), or play('flip', 0.04) to start 40 ms later.
export function play(name, delay = 0) {
  if (!on || !SOUNDS[name]) return;
  const c = ensure();
  if (!c) return;
  try { SOUNDS[name](c.currentTime + 0.01 + delay); } catch (e) { /* audio unavailable */ }
}

// ---- Mute button ----
const ICON_ON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.5a7.8 7.8 0 0 1 0 11"/></svg>';
const ICON_OFF = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>';
function paint(btn) {
  btn.setAttribute('aria-pressed', String(on));
  btn.title = on ? 'Sound on' : 'Sound off';
  btn.innerHTML = on ? ICON_ON : ICON_OFF;
}
const toggles = [...document.querySelectorAll('[data-sound-toggle]')];
toggles.forEach((btn) => {
  btn.setAttribute('aria-label', 'Sound');
  paint(btn);
  btn.addEventListener('click', () => {
    on = !on;
    store.set('bgs-sound', on);
    toggles.forEach(paint);
    if (on) play('select');
  });
});
