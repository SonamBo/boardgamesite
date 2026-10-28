// Sliding Tiles (the 15 puzzle): slide the numbered tiles back into order.
import { store } from './site.js';
import { setStatus, levelSwitch } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { clock, fmt, soloRecord, shake } from './solo.js';

const $ = (id) => document.getElementById(id);
const SIZES = { easy: 3, medium: 4, hard: 5 };
const SAVE = 'bgs-slide-game';
const boardEl = $('slide-board');
const timer = clock($('time'));
const rec = soloRecord('bgs-slide-stats', { onPaint: paintRecord });

let N, tiles, moves, started, done, level;
const els = [];

function solved() { return tiles.every((v, i) => v === (i === N * N - 1 ? 0 : i + 1)); }

function shuffle() {
  tiles = Array.from({ length: N * N }, (_, i) => (i === N * N - 1 ? 0 : i + 1));
  let blank = N * N - 1, last = -1;
  for (let k = 0; k < N * N * 40 || solved(); k++) {
    const opts = neighbours(blank).filter((j) => j !== last);
    const j = opts[Math.floor(Math.random() * opts.length)];
    [tiles[blank], tiles[j]] = [tiles[j], tiles[blank]];
    last = blank; blank = j;
  }
}
function neighbours(i) {
  const r = Math.floor(i / N), c = i % N, out = [];
  if (r > 0) out.push(i - N);
  if (r < N - 1) out.push(i + N);
  if (c > 0) out.push(i - 1);
  if (c < N - 1) out.push(i + 1);
  return out;
}

function build() {
  boardEl.textContent = '';
  els.length = 0;
  boardEl.style.setProperty('--n', N);
  for (let v = 1; v < N * N; v++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'st-tile';
    b.textContent = String(v);
    b.addEventListener('click', () => tap(tiles.indexOf(v)));
    boardEl.appendChild(b);
    els[v] = b;
  }
}

function render() {
  const blank = tiles.indexOf(0);
  tiles.forEach((v, i) => {
    if (!v) return;
    const b = els[v];
    const r = Math.floor(i / N), c = i % N;
    b.style.transform = 'translate(' + c * 100 + '%,' + r * 100 + '%)';
    b.classList.toggle('home', v === i + 1);
    const movable = Math.floor(i / N) === Math.floor(blank / N) || i % N === blank % N;
    b.classList.toggle('can', movable && !done);
    b.setAttribute('aria-label', 'Tile ' + v + ', row ' + (r + 1) + ', column ' + (c + 1) + (movable && !done ? ', can slide' : ''));
    b.disabled = done;
  });
  $('moves').textContent = String(moves);
}

// Tap any tile in the blank's row or column: it and the tiles between slide over.
function tap(i) {
  if (done) return;
  const blank = tiles.indexOf(0);
  const sameRow = Math.floor(i / N) === Math.floor(blank / N), sameCol = i % N === blank % N;
  if (!sameRow && !sameCol || i === blank) { shake(els[tiles[i]], play); return; }
  const step = sameRow ? (i > blank ? 1 : -1) : (i > blank ? N : -N);
  let b = blank;
  while (b !== i) { tiles[b] = tiles[b + step]; b += step; moves++; }
  tiles[i] = 0;
  if (!started) { started = true; timer.start(0); rec.played(); track('game_start', { game: 'sliding-tiles', level }); }
  play('move');
  render();
  if (solved()) win(); else save();
}

function win() {
  done = true;
  timer.stop();
  const t = timer.elapsed();
  const record = rec.won(level, t);
  const bm = store.get('bgs-slide-moves', {});
  const fewer = !bm[level] || moves < bm[level];
  if (fewer) { bm[level] = moves; store.set('bgs-slide-moves', bm); }
  render();
  store.set(SAVE, null);
  setStatus('Solved in ' + moves + ' moves!');
  $('result-text').textContent = 'Puzzle solved!';
  $('result-sub').textContent = moves + ' moves in ' + fmt(t) + '.' + (record ? ' A new best time!' : fewer && bm[level] !== moves ? '' : '');
  $('result').hidden = false;
  play('win', 0.15);
  track('game_end', { game: 'sliding-tiles', result: 'win', level, moves, seconds: Math.round(t / 1000) });
}

function paintRecord(stats, best) {
  const parts = [(stats.won || 0) + ((stats.won || 0) === 1 ? ' puzzle' : ' puzzles') + ' solved'];
  const bm = store.get('bgs-slide-moves', {});
  Object.entries(SIZES).forEach(([l, n]) => { if (best[l]) parts.push(n + '×' + n + ' best ' + fmt(best[l]) + (bm[l] ? ', ' + bm[l] + ' moves' : '')); });
  $('record').textContent = parts.join(' · ');
}

function newGame() {
  N = SIZES[level];
  build();
  shuffle();
  moves = 0; started = false; done = false;
  timer.reset();
  $('result').hidden = true;
  store.set(SAVE, null);
  setStatus('Put the tiles in order, 1 to ' + (N * N - 1), 'neutral');
  render();
}
function save() { if (started && !done) store.set(SAVE, { level, tiles, moves, elapsed: timer.elapsed() }); }
function resume() {
  const g = store.get(SAVE, null);
  if (!g || g.level !== level || !Array.isArray(g.tiles) || g.tiles.length !== SIZES[level] ** 2) return false;
  N = SIZES[level];
  if (new Set(g.tiles).size !== N * N) return false;
  build();
  tiles = g.tiles; moves = g.moves | 0; started = true; done = false;
  timer.start(Number(g.elapsed) || 0);
  setStatus('Welcome back. Your puzzle is where you left it', 'neutral');
  render();
  return true;
}
window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { save(); if (timer.running) timer.stop(); }
  else if (started && !done && !timer.running) timer.start(timer.elapsed());
});

// Arrow keys move the tile next to the gap into it.
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea') || done) return;
  const blank = tiles.indexOf(0), r = Math.floor(blank / N), c = blank % N;
  const t = { ArrowLeft: c < N - 1 ? blank + 1 : -1, ArrowRight: c > 0 ? blank - 1 : -1, ArrowUp: r < N - 1 ? blank + N : -1, ArrowDown: r > 0 ? blank - N : -1 }[e.key];
  if (t === undefined) return;
  e.preventDefault();
  if (t >= 0) tap(t);
});

$('new-game').addEventListener('click', () => { play('shuffle'); newGame(); });
$('again').addEventListener('click', () => { play('shuffle'); newGame(); });
const getLevel = levelSwitch('slide', (l) => { level = l; newGame(); });
level = getLevel();
if (!resume()) newGame();
