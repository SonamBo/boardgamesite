// Tile Match (Mahjong solitaire): clear the stack by matching pairs of free tiles.
// A tile is free when nothing is on top of it and its left or right side is open.
// Deals are built backwards from an empty table, so every deal can be cleared.
import { store } from './site.js';
import { setStatus, MASCOT } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { clock, fmt, soloRecord, shake } from './solo.js';

const $ = (id) => document.getElementById(id);
const SAVE = 'bgs-tiles-game';
const boardEl = $('tm-board');
const timer = clock($('time'));
const rec = soloRecord('bgs-tiles-stats', { onPaint: paintRecord });

// ---------- The layout: three layers, 72 tiles ----------
const SLOTS = [];
for (let y = 0; y < 5; y++) for (let x = 0; x < 8; x++) SLOTS.push({ x, y, z: 0 });
for (let y = 0.5; y < 4; y++) for (let x = 1; x < 7; x++) SLOTS.push({ x, y, z: 1 });
for (let y = 1.5; y < 3; y++) for (let x = 2; x < 6; x++) SLOTS.push({ x, y, z: 2 });
const COLS = 8, ROWS = 5;

// Who covers whom, and who sits beside whom.
const above = SLOTS.map((s) => SLOTS.map((t, j) => (t.z === s.z + 1 && Math.abs(t.x - s.x) < 1 && Math.abs(t.y - s.y) < 1 ? j : -1)).filter((j) => j >= 0));
const lefts = SLOTS.map((s) => SLOTS.map((t, j) => (t.z === s.z && Math.abs(t.y - s.y) < 1 && Math.abs(t.x - (s.x - 1)) < 0.01 ? j : -1)).filter((j) => j >= 0));
const rights = SLOTS.map((s) => SLOTS.map((t, j) => (t.z === s.z && Math.abs(t.y - s.y) < 1 && Math.abs(t.x - (s.x + 1)) < 0.01 ? j : -1)).filter((j) => j >= 0));

function isFree(i, present) {
  if (!present[i]) return false;
  if (above[i].some((j) => present[j])) return false;
  return !lefts[i].some((j) => present[j]) || !rights[i].some((j) => present[j]);
}

// 18 tile pictures, each used 4 times.
const ICONS = [
  '<circle cx="12" cy="12" r="7"/>',
  '<path d="M12 3l9 9-9 9-9-9z"/>',
  '<path d="M12 4l9 16H3z"/>',
  '<path d="M12 2.5l2.8 6 6.5.7-4.9 4.4 1.4 6.4L12 16.8 6.2 20l1.4-6.4-4.9-4.4 6.5-.7z"/>',
  '<path d="M12 20.5s-7.6-4.6-9.2-9C1.6 8 3.6 4.5 7 4.5c2.1 0 3.6 1.2 5 3 1.4-1.8 2.9-3 5-3 3.4 0 5.4 3.5 4.2 7-1.6 4.4-9.2 9-9.2 9z"/>',
  '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
  '<circle cx="12" cy="12" r="4.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" stroke-width="2.2" stroke-linecap="round" fill="none"/>',
  '<path d="M5 19C5 10 10 4 20 4c0 10-6 15-15 15z"/><path d="M5 19l8-8" stroke-width="1.8" fill="none" stroke-linecap="round"/>',
  '<circle cx="12" cy="7" r="3.3"/><circle cx="17" cy="12" r="3.3"/><circle cx="12" cy="17" r="3.3"/><circle cx="7" cy="12" r="3.3"/>',
  '<path d="M13.5 2L5 13.5h6L9.5 22 19 9.5h-6.2z"/>',
  '<path d="M12 3c3.5 5 6.5 8.4 6.5 12A6.5 6.5 0 0 1 5.5 15C5.5 11.4 8.5 8 12 3z"/>',
  '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>',
  '<rect x="5" y="5" width="14" height="14" rx="2.5"/>',
  '<path d="M7 3h10l4 6-9 12L3 9z"/>',
  '<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 5a4 4 0 1 1 0 8 4 4 0 0 1 0-8z" fill-rule="evenodd"/>',
  '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6z"/>',
  '<path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z"/>',
  '<path d="M16 3v11.5a3.5 3.5 0 1 1-2-3.2V6l-6 1.5v9a3.5 3.5 0 1 1-2-3.2V5z"/>'
];
const INK = ['#8A2443', '#8C6A24', '#2E5F5A'];
const faceHtml = (f) => '<svg viewBox="0 0 24 24" aria-hidden="true" fill="' + INK[f % 3] + '" stroke="' + INK[f % 3] + '">' + ICONS[f] + '</svg>';
const NAMES = ['circle', 'diamond', 'triangle', 'star', 'heart', 'moon', 'sun', 'leaf', 'flower', 'lightning', 'drop', 'crown', 'square', 'gem', 'ring', 'cross', 'hexagon', 'music note'];

// Deal faces onto the given slots by taking pairs of free tiles away from a full table.
function dealOnto(slots, rand = Math.random) {
  for (let attempt = 0; attempt < 200; attempt++) {
    const present = SLOTS.map((_, i) => slots.includes(i));
    const faces = new Array(SLOTS.length).fill(-1);
    // a shuffled list of face pairs, two pairs of each face
    const pairs = [];
    const nPairs = slots.length / 2;
    for (let k = 0; k < nPairs; k++) pairs.push(Math.floor(k / 2) % ICONS.length);
    for (let k = pairs.length - 1; k > 0; k--) { const j = Math.floor(rand() * (k + 1)); [pairs[k], pairs[j]] = [pairs[j], pairs[k]]; }
    let ok = true;
    for (const f of pairs) {
      const free = slots.filter((i) => present[i] && isFree(i, present));
      if (free.length < 2) { ok = false; break; }
      const a = free.splice(Math.floor(rand() * free.length), 1)[0];
      const b = free[Math.floor(rand() * free.length)];
      faces[a] = f; faces[b] = f;
      present[a] = false; present[b] = false;
    }
    if (ok) return faces;
  }
  return null;
}

let faces, present, history, sel, started, done, hintPair;
const tileEls = SLOTS.map((s, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tm-tile z' + s.z;
  b.dataset.i = String(i);
  b.style.setProperty('--x', s.x);
  b.style.setProperty('--y', s.y);
  b.style.setProperty('--z', s.z);
  b.style.zIndex = String(s.z * 100 + Math.round(s.y * 2) * 10 + Math.round(s.x));
  b.addEventListener('click', () => tap(i));
  boardEl.appendChild(b);
  return b;
});
boardEl.style.setProperty('--cols', COLS);
boardEl.style.setProperty('--rows', ROWS);

function moves() {
  const free = SLOTS.map((_, i) => i).filter((i) => isFree(i, present));
  const out = [];
  for (let a = 0; a < free.length; a++) for (let b = a + 1; b < free.length; b++) if (faces[free[a]] === faces[free[b]]) out.push([free[a], free[b]]);
  return out;
}

function render() {
  tileEls.forEach((b, i) => {
    b.hidden = !present[i];
    if (!present[i]) return;
    if (b.dataset.f !== String(faces[i])) { b.innerHTML = faceHtml(faces[i]); b.dataset.f = String(faces[i]); }
    const free = isFree(i, present);
    b.classList.toggle('free', free);
    b.classList.toggle('sel', i === sel);
    b.classList.toggle('hint', !!hintPair && hintPair.includes(i));
    b.setAttribute('aria-label', NAMES[faces[i]] + (free ? ', free' : ', blocked') + (i === sel ? ', selected' : ''));
    b.tabIndex = free ? 0 : -1;
  });
  const left = present.filter(Boolean).length;
  $('left').textContent = String(left);
  const m = done ? [] : moves();
  $('pairs').textContent = String(m.length);
  $('undo').disabled = !history.length || done;
  $('hint').disabled = done || !m.length;
  if (!done && left && !m.length) {
    setStatus('No pairs left to match. Shuffle the tiles', 'cpu');
    $('shuffle').classList.add('btn-gold', 'raised'); $('shuffle').classList.remove('btn-outline');
  } else { $('shuffle').classList.remove('btn-gold', 'raised'); $('shuffle').classList.add('btn-outline'); }
}

function tap(i) {
  if (done || !present[i]) return;
  if (!isFree(i, present)) { shake(tileEls[i], play); setStatus('That tile is blocked. Free tiles have an open side', 'neutral'); return; }
  hintPair = null;
  if (sel == null || sel === i) { sel = sel === i ? null : i; play('select'); render(); return; }
  if (faces[sel] !== faces[i]) { sel = i; play('select'); render(); return; }
  if (!started) { started = true; timer.start(0); rec.played(); track('game_start', { game: 'tile-match' }); }
  history.push([sel, i]);
  present[sel] = false; present[i] = false;
  sel = null;
  play('capture');
  if (!present.some(Boolean)) return win();
  setStatus(present.filter(Boolean).length + ' tiles to go', 'neutral');
  render();
  save();
}

function win() {
  done = true;
  timer.stop();
  const t = timer.elapsed();
  const record = rec.won('all', t);
  render();
  store.set(SAVE, null);
  setStatus('Table cleared!');
  $('result-img').src = MASCOT.win;
  $('result-text').textContent = 'Table cleared!';
  $('result-sub').textContent = 'All 72 tiles in ' + fmt(t) + '.' + (record ? ' A new best time!' : '');
  $('result').hidden = false;
  play('win', 0.1);
  track('game_end', { game: 'tile-match', result: 'win', seconds: Math.round(t / 1000) });
}

function shuffleTiles() {
  if (done) return;
  const slots = SLOTS.map((_, i) => i).filter((i) => present[i]);
  const f = dealOnto(slots);
  if (!f) return;
  slots.forEach((i) => { faces[i] = f[i]; });
  sel = null; hintPair = null;
  history = []; // undo can't cross a shuffle
  play('shuffle');
  setStatus('Shuffled. Keep going', 'neutral');
  render();
  save();
}

function paintRecord(stats, best) {
  $('record').textContent = (stats.won || 0) + ' of ' + (stats.played || 0) + ' tables cleared' + (best.all ? ' · best time ' + fmt(best.all) : '');
}

function newGame() {
  faces = dealOnto(SLOTS.map((_, i) => i));
  present = SLOTS.map(() => true);
  history = []; sel = null; started = false; done = false; hintPair = null;
  timer.reset();
  $('result').hidden = true;
  store.set(SAVE, null);
  setStatus('Match pairs of free tiles', 'neutral');
  render();
}
function save() { if (started && !done) store.set(SAVE, { faces, present, elapsed: timer.elapsed() }); }
function resume() {
  const g = store.get(SAVE, null);
  if (!g || !Array.isArray(g.faces) || g.faces.length !== SLOTS.length || !Array.isArray(g.present) || !g.present.some(Boolean)) return false;
  faces = g.faces; present = g.present.map(Boolean); history = []; sel = null; started = true; done = false; hintPair = null;
  timer.start(Number(g.elapsed) || 0);
  setStatus('Welcome back. Your table is where you left it', 'neutral');
  render();
  return true;
}
window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { save(); if (timer.running) timer.stop(); }
  else if (started && !done && !timer.running) timer.start(timer.elapsed());
});

$('undo').addEventListener('click', () => {
  const p = history.pop();
  if (!p || done) return;
  p.forEach((i) => { present[i] = true; });
  sel = null; hintPair = null;
  play('card');
  render(); save();
});
$('hint').addEventListener('click', () => {
  const m = moves();
  if (!m.length) return;
  hintPair = m[Math.floor(Math.random() * m.length)];
  sel = null;
  play('king');
  render();
});
$('shuffle').addEventListener('click', shuffleTiles);
$('new-game').addEventListener('click', () => { play('shuffle'); newGame(); });
$('again').addEventListener('click', () => { play('shuffle'); newGame(); });

if (!resume()) newGame();
