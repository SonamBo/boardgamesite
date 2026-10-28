// Slide & Merge: slide the tiles, merge matching numbers, reach 2048.
import { store } from './site.js';
import { setStatus, MASCOT } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { soloRecord } from './solo.js';

const $ = (id) => document.getElementById(id);
const N = 4;
const SAVE = 'bgs-merge-game';
const rec = soloRecord('bgs-merge-stats', { onPaint: paintRecord });
const boardEl = $('merge-board');
const tilesEl = $('merge-tiles');

let grid, score, prev, over, won, keepGoing, started, nextId = 1;
const tileEls = new Map(); // id → element

for (let i = 0; i < N * N; i++) {
  const c = document.createElement('div');
  c.className = 'mg-cell';
  boardEl.insertBefore(c, tilesEl);
}

const empty = () => Array.from({ length: N }, () => new Array(N).fill(null));
function addRandom() {
  const free = [];
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (!grid[r][c]) free.push([r, c]);
  if (!free.length) return;
  const [r, c] = free[Math.floor(Math.random() * free.length)];
  grid[r][c] = { id: nextId++, v: Math.random() < 0.9 ? 2 : 4, fresh: true };
}

// Slide every row toward `dir`. Returns true if anything moved.
function slide(dir) {
  let moved = false, gained = 0, best = 0;
  const lines = [];
  for (let k = 0; k < N; k++) {
    const pos = [];
    for (let j = 0; j < N; j++) {
      if (dir === 'left') pos.push([k, j]);
      if (dir === 'right') pos.push([k, N - 1 - j]);
      if (dir === 'up') pos.push([j, k]);
      if (dir === 'down') pos.push([N - 1 - j, k]);
    }
    lines.push(pos);
  }
  const next = empty();
  for (const pos of lines) {
    const tiles = pos.map(([r, c]) => grid[r][c]).filter(Boolean);
    const out = [];
    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      if (i + 1 < tiles.length && tiles[i + 1].v === t.v) {
        const v = t.v * 2;
        out.push({ id: nextId++, v, merged: true, from: [t.id, tiles[i + 1].id] });
        gained += v; best = Math.max(best, v);
        i++;
      } else out.push({ id: t.id, v: t.v });
    }
    pos.forEach(([r, c], i) => {
      next[r][c] = out[i] || null;
      const was = grid[r][c];
      if ((was && !out[i]) || (!was && out[i]) || (was && out[i] && was.id !== out[i].id)) moved = true;
    });
  }
  if (!moved) return false;
  prev = { grid: grid.map((row) => row.map((t) => (t ? { id: t.id, v: t.v } : null))), score };
  grid = next;
  score += gained;
  if (gained) play(best >= 128 ? 'king' : 'capture'); else play('move');
  return true;
}

function canMove() {
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const t = grid[r][c];
    if (!t) return true;
    if (c + 1 < N && grid[r][c + 1] && grid[r][c + 1].v === t.v) return true;
    if (r + 1 < N && grid[r + 1][c] && grid[r + 1][c].v === t.v) return true;
  }
  return false;
}

function move(dir) {
  if (over || (won && !keepGoing)) return;
  // Where merged tiles came from, so the two parts slide into place before the new tile appears.
  const before = new Map();
  grid.forEach((row, r) => row.forEach((t, c) => { if (t) before.set(t.id, [r, c]); }));
  if (!slide(dir)) return;
  if (!started) { started = true; rec.played(); track('game_start', { game: 'slide-merge' }); }
  // slide the merged pieces to their meeting square first
  grid.forEach((row, r) => row.forEach((t, c) => {
    if (t && t.from) t.from.forEach((id) => { const el = tileEls.get(id); if (el) { place(el, r, c); el.classList.add('gone'); } });
  }));
  addRandom();
  render();
  const top = Math.max(...grid.flat().filter(Boolean).map((t) => t.v));
  if (top >= 2048 && !won) {
    won = true;
    rec.won('top', score, { higherIsBetter: true });
    showResult('win', 'You made 2048!', 'Score ' + score + '. Keep going to beat your best.', 'Keep going');
    play('win', 0.15);
    track('game_end', { game: 'slide-merge', result: 'win', score });
  } else if (!canMove()) {
    over = true;
    const record = rec.score(score, 'top');
    store.set(SAVE, null);
    showResult(won ? 'win' : 'lose', 'No moves left', 'Final score ' + score + '. Biggest tile ' + top + '.' + (record ? ' A new best score!' : ''), 'Play again');
    play('lose');
    track('game_end', { game: 'slide-merge', result: won ? 'win' : 'lose', score });
  }
  save();
}

const cellPos = () => {
  const gap = parseFloat(getComputedStyle(boardEl).getPropertyValue('--mg-gap')) || 10;
  const size = (tilesEl.clientWidth - gap * (N - 1)) / N;
  return { gap, size };
};
function place(el, r, c) {
  const { gap, size } = cellPos();
  el.style.width = el.style.height = size + 'px';
  el.style.transform = 'translate(' + c * (size + gap) + 'px,' + r * (size + gap) + 'px)';
}

function render() {
  const live = new Set();
  grid.forEach((row, r) => row.forEach((t, c) => {
    if (!t) return;
    live.add(t.id);
    let el = tileEls.get(t.id);
    if (!el) {
      el = document.createElement('div');
      el.className = 'mg-tile';
      tilesEl.appendChild(el);
      tileEls.set(t.id, el);
      place(el, r, c);
      el.classList.add(t.merged ? 'pop' : 'new');
    } else place(el, r, c);
    el.textContent = String(t.v);
    el.dataset.v = String(Math.min(t.v, 4096));
    el.classList.toggle('big', t.v >= 1024);
    t.fresh = false; t.merged = false; delete t.from;
  }));
  for (const [id, el] of tileEls) {
    if (!live.has(id)) { tileEls.delete(id); setTimeout(() => el.remove(), 120); }
  }
  $('score').textContent = String(score);
  $('best').textContent = String(Math.max(score, rec.best.top || 0));
  $('undo').disabled = !prev || over;
  boardEl.setAttribute('aria-label', 'Board: ' + grid.map((row) => row.map((t) => (t ? t.v : 'empty')).join(', ')).join('; '));
}

function showResult(kind, text, sub, btn) {
  $('result-img').src = MASCOT[kind];
  $('result-text').textContent = text;
  $('result-sub').textContent = sub;
  $('again').textContent = btn;
  $('result').hidden = false;
  setStatus(text, kind === 'lose' ? 'cpu' : '');
}

function paintRecord(stats, best) {
  $('record').textContent = (stats.won || 0) + ((stats.won || 0) === 1 ? ' time' : ' times') + ' reached 2048' + (best.top ? ' · best score ' + best.top : '');
}

function newGame() {
  if (started && !over) rec.score(score, 'top');
  grid = empty(); score = 0; prev = null; over = false; won = false; keepGoing = false; started = false;
  tilesEl.textContent = ''; tileEls.clear();
  addRandom(); addRandom();
  $('result').hidden = true;
  setStatus('Join the numbers to reach 2048', 'neutral');
  store.set(SAVE, null);
  render();
}
function save() {
  if (over) return;
  store.set(SAVE, { grid: grid.map((row) => row.map((t) => (t ? t.v : 0))), score, won, keepGoing });
}
function resume() {
  const g = store.get(SAVE, null);
  if (!g || !Array.isArray(g.grid) || g.grid.length !== N) return false;
  grid = g.grid.map((row) => row.map((v) => (v ? { id: nextId++, v } : null)));
  if (!grid.flat().some(Boolean)) return false;
  score = g.score | 0; won = !!g.won; keepGoing = !!g.keepGoing; prev = null; over = false; started = true;
  setStatus('Welcome back. Your game is where you left it', 'neutral');
  render();
  return true;
}

// ---------- Input ----------
const KEYS = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', a: 'left', d: 'right', w: 'up', s: 'down' };
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea')) return;
  const dir = KEYS[e.key];
  if (dir) { e.preventDefault(); move(dir); }
});
let touch = null;
boardEl.addEventListener('pointerdown', (e) => { touch = { x: e.clientX, y: e.clientY }; try { boardEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } });
boardEl.addEventListener('pointerup', (e) => {
  if (!touch) return;
  const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
  touch = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 24) return;
  move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
});
boardEl.addEventListener('pointercancel', () => { touch = null; });
document.querySelectorAll('[data-dir]').forEach((b) => b.addEventListener('click', () => move(b.dataset.dir)));
$('undo').addEventListener('click', () => {
  if (!prev || over) return;
  grid = prev.grid.map((row) => row.map((t) => (t ? { id: nextId++, v: t.v } : null)));
  score = prev.score; prev = null;
  tilesEl.textContent = ''; tileEls.clear();
  play('card');
  render(); save();
});
$('new-game').addEventListener('click', newGame);
$('again').addEventListener('click', () => {
  if (won && !over && !keepGoing) { keepGoing = true; $('result').hidden = true; setStatus('Keep going: how high can you get?', 'neutral'); save(); return; }
  newGame();
});
let raf = 0;
window.addEventListener('resize', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { tileEls.forEach((el) => el.classList.add('still')); render(); requestAnimationFrame(() => tileEls.forEach((el) => el.classList.remove('still'))); }); });

if (!resume()) newGame();
