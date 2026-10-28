// Word Search: find the hidden words in the grid. Drag across a word, in any allowed direction.
import { THEMES, themeWords } from './themes.js';
import { store } from './site.js';
import { setStatus, levelSwitch } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { clock, fmt, soloRecord } from './solo.js';
import { shuffled, randomLetter } from './word-lib.js';

const $ = (id) => document.getElementById(id);
const LEVELS = {
  easy: { n: 8, words: 6, dirs: [[0, 1], [1, 0]] },
  medium: { n: 10, words: 8, dirs: [[0, 1], [1, 0], [1, 1], [-1, 1]] },
  hard: { n: 12, words: 10, dirs: [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]] }
};
const NAME = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const SAVE = 'bgs-ws-game';
const gridEl = $('ws-grid');
const svg = $('ws-lines');
const timer = clock($('time'));
const rec = soloRecord('bgs-ws-stats', { onPaint: paintRecord });

let level, N, grid, placed, found, theme, started, done;
let cells = [];

function make() {
  const L = LEVELS[level];
  N = L.n;
  for (let attempt = 0; attempt < 50; attempt++) {
    theme = shuffled(Object.keys(THEMES))[0];
    const pool = shuffled(themeWords(theme).filter((w) => w.length <= N && w.length >= 3));
    grid = Array.from({ length: N * N }, () => '');
    placed = [];
    for (const w of pool) {
      if (placed.length >= L.words) break;
      const spots = [];
      for (const [dr, dc] of L.dirs) for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
        const er = r + dr * (w.length - 1), ec = c + dc * (w.length - 1);
        if (er < 0 || ec < 0 || er >= N || ec >= N) continue;
        let ok = true, overlap = 0;
        for (let k = 0; k < w.length; k++) {
          const ch = grid[(r + dr * k) * N + c + dc * k];
          if (ch && ch !== w[k]) { ok = false; break; }
          if (ch) overlap++;
        }
        if (ok && overlap < w.length) spots.push({ r, c, dr, dc, overlap });
      }
      if (!spots.length) continue;
      // prefer crossings a little, so words share letters
      spots.sort((a, b) => b.overlap - a.overlap + (Math.random() - 0.5) * 2);
      const s = spots[0];
      for (let k = 0; k < w.length; k++) grid[(s.r + s.dr * k) * N + s.c + s.dc * k] = w[k];
      placed.push({ word: w, ...s });
    }
    if (placed.length >= L.words) break;
  }
  grid = grid.map((ch) => ch || randomLetter());
}

function build() {
  gridEl.style.setProperty('--n', N);
  [...gridEl.querySelectorAll('.ws-cell')].forEach((e) => e.remove());
  cells = grid.map((ch, i) => {
    const d = document.createElement('span');
    d.className = 'ws-cell';
    d.textContent = ch;
    d.dataset.i = String(i);
    gridEl.appendChild(d);
    return d;
  });
  svg.setAttribute('viewBox', '0 0 ' + N + ' ' + N);
  const list = $('ws-words');
  list.textContent = '';
  placed.slice().sort((a, b) => a.word.localeCompare(b.word)).forEach((p) => {
    const li = document.createElement('li');
    li.textContent = p.word;
    li.dataset.w = p.word;
    list.appendChild(li);
  });
  $('ws-theme').textContent = theme;
}

const HUES = ['#CFAA62', '#B0405F', '#5FA39A', '#8FB8E8', '#C9A2F0', '#E39B6A', '#8FD19E', '#E6C88A', '#FF9C8A', '#7FD6D0'];
function render() {
  svg.querySelectorAll('line.found').forEach((l) => l.remove());
  found.forEach((w, k) => {
    const p = placed.find((x) => x.word === w);
    line(p.r, p.c, p.r + p.dr * (w.length - 1), p.c + p.dc * (w.length - 1), 'found', HUES[k % HUES.length]);
  });
  document.querySelectorAll('#ws-words li').forEach((li) => li.classList.toggle('got', found.includes(li.dataset.w)));
  $('left').textContent = String(placed.length - found.length);
}
function line(r1, c1, r2, c2, cls, colour) {
  const l = document.createElementNS('http://www.w3.org/2000/svg', 'line');
  l.setAttribute('x1', c1 + 0.5); l.setAttribute('y1', r1 + 0.5);
  l.setAttribute('x2', c2 + 0.5); l.setAttribute('y2', r2 + 0.5);
  l.setAttribute('class', cls);
  if (colour) l.style.stroke = colour;
  svg.appendChild(l);
  return l;
}

// ---------- Dragging a selection ----------
let drag = null;
function cellAt(x, y) {
  const rect = gridEl.getBoundingClientRect();
  const c = Math.floor((x - rect.left) / rect.width * N), r = Math.floor((y - rect.top) / rect.height * N);
  return r >= 0 && c >= 0 && r < N && c < N ? { r, c } : null;
}
function snap(a, b) {
  const dr = b.r - a.r, dc = b.c - a.c;
  if (!dr && !dc) return { ...a, len: 0, dr: 0, dc: 0 };
  // closest of the 8 directions
  const ang = Math.atan2(dr, dc), step = Math.round(ang / (Math.PI / 4));
  const d = [[0, 1], [1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1]][(step + 8) % 8];
  let len = Math.max(Math.abs(dr), Math.abs(dc));
  while (len > 0 && (a.r + d[0] * len < 0 || a.r + d[0] * len >= N || a.c + d[1] * len < 0 || a.c + d[1] * len >= N)) len--;
  return { r: a.r + d[0] * len, c: a.c + d[1] * len, len, dr: d[0], dc: d[1] };
}
gridEl.addEventListener('pointerdown', (e) => {
  if (done) return;
  const a = cellAt(e.clientX, e.clientY);
  if (!a) return;
  e.preventDefault();
  try { gridEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  // tap-tap selection: a second tap finishes a line started by the first
  if (drag && drag.tapped) { finish(snap(drag.a, a)); return; }
  drag = { a, el: line(a.r, a.c, a.r, a.c, 'sel'), moved: false };
  play('select');
});
gridEl.addEventListener('pointermove', (e) => {
  if (!drag || drag.tapped) return;
  const b = cellAt(e.clientX, e.clientY);
  if (!b) return;
  const s = snap(drag.a, b);
  if (s.len) drag.moved = true;
  drag.el.setAttribute('x2', s.c + 0.5); drag.el.setAttribute('y2', s.r + 0.5);
});
gridEl.addEventListener('pointerup', (e) => {
  if (!drag || drag.tapped) return;
  if (!drag.moved) { drag.tapped = true; setStatus('Now tap the last letter of the word', 'neutral'); return; }
  const b = cellAt(e.clientX, e.clientY) || drag.a;
  finish(snap(drag.a, b));
});
function finish(s) {
  const a = drag.a;
  drag.el.remove();
  drag = null;
  if (!s.len) { setStatus('Drag across a word, or tap its first and last letters', 'neutral'); return; }
  let w = '';
  for (let k = 0; k <= s.len; k++) w += grid[(a.r + s.dr * k) * N + a.c + s.dc * k];
  const rev = [...w].reverse().join('');
  const hit = placed.find((p) => !found.includes(p.word) && (p.word === w || p.word === rev) &&
    ((p.r === a.r && p.c === a.c) || (p.r === s.r && p.c === s.c)));
  if (!hit) { play('error'); setStatus(w.toUpperCase() + ' isn’t one of the words', 'neutral'); return; }
  if (!started) { started = true; timer.start(0); rec.played(); track('game_start', { game: 'word-search', level }); }
  found.push(hit.word);
  play('found');
  render();
  if (found.length === placed.length) win();
  else { setStatus('Found ' + hit.word.toUpperCase() + '!'); save(); }
}

function win() {
  done = true;
  timer.stop();
  const t = timer.elapsed();
  const record = rec.won(level, t);
  store.set(SAVE, null);
  setStatus('All words found!');
  $('result-text').textContent = 'All ' + placed.length + ' words found!';
  $('result-sub').textContent = NAME[level] + ' in ' + fmt(t) + '.' + (record ? ' A new best time!' : '');
  $('result').hidden = false;
  play('win', 0.1);
  track('game_end', { game: 'word-search', result: 'win', level, seconds: Math.round(t / 1000) });
}

function paintRecord(stats, best) {
  const parts = [(stats.won || 0) + ((stats.won || 0) === 1 ? ' puzzle' : ' puzzles') + ' finished'];
  Object.keys(NAME).forEach((l) => { if (best[l]) parts.push(NAME[l] + ' best ' + fmt(best[l])); });
  $('record').textContent = parts.join(' · ');
}

function newGame() {
  make();
  found = []; started = false; done = false; drag = null;
  timer.reset();
  $('result').hidden = true;
  store.set(SAVE, null);
  build(); render();
  setStatus('Find the ' + placed.length + ' hidden words', 'neutral');
}
function save() { if (started && !done) store.set(SAVE, { level, N, grid, placed, found, theme, elapsed: timer.elapsed() }); }
function resume() {
  const g = store.get(SAVE, null);
  if (!g || g.level !== level || !Array.isArray(g.grid) || !Array.isArray(g.placed)) return false;
  ({ N, grid, placed, found, theme } = g);
  started = true; done = false;
  build(); render();
  timer.start(Number(g.elapsed) || 0);
  setStatus('Welcome back. ' + (placed.length - found.length) + ' words to go', 'neutral');
  return true;
}
window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { save(); if (timer.running) timer.stop(); }
  else if (started && !done && !timer.running) timer.start(timer.elapsed());
});

$('new-game').addEventListener('click', () => { play('shuffle'); newGame(); });
$('again').addEventListener('click', () => { play('shuffle'); newGame(); });
const getLevel = levelSwitch('ws', (l) => { level = l; newGame(); });
level = getLevel();
if (!resume()) newGame();
