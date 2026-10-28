// Word Grid: find as many words as you can in a 4×4 grid of letters before the clock runs out.
// Words follow neighbouring squares (including diagonals) and can't use a square twice.
import { setStatus, MASCOT } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { soloRecord, fmt } from './solo.js';
import { words, trie, shuffled } from './word-lib.js';

const $ = (id) => document.getElementById(id);
const N = 4, SECONDS = 180;
// Our own sixteen letter dice.
const DICE = ['aaeeng', 'abbjoo', 'achops', 'affkps', 'aoottw', 'cimotu', 'deilrx', 'delrvy', 'distty', 'eeghnw', 'eeinsu', 'ehrtvw', 'eiosst', 'elrtty', 'himnuq', 'hlnnrz'];
const POINTS = (n) => (n <= 4 ? 1 : n === 5 ? 2 : n === 6 ? 3 : n === 7 ? 5 : 11);
const rec = soloRecord('bgs-grid-stats', { onPaint: paintRecord });

let grid, all, found, path, left, tick, over, started;
const T = trie(words().filter((w) => w.length >= 3 && w.length <= 9));
const cells = [...document.querySelectorAll('.wgd-cell')];
const face = (ch) => (ch === 'q' ? 'qu' : ch);

const near = (a, b) => a !== b && Math.abs(Math.floor(a / N) - Math.floor(b / N)) <= 1 && Math.abs(a % N - b % N) <= 1;

// Every word in the grid.
function solve() {
  const out = new Set();
  function go(i, node, used) {
    let n = node;
    for (const ch of face(grid[i])) { n = n && n[ch]; }
    if (!n) return;
    if (n.$ && n.$.length >= 3) out.add(n.$);
    used.add(i);
    for (let j = 0; j < N * N; j++) if (!used.has(j) && near(i, j)) go(j, n, used);
    used.delete(i);
  }
  for (let i = 0; i < N * N; i++) go(i, T, new Set());
  return [...out].sort((a, b) => b.length - a.length || a.localeCompare(b));
}

function roll() {
  for (let t = 0; t < 30; t++) {
    grid = shuffled(DICE).map((d) => d[Math.floor(Math.random() * 6)]);
    all = solve();
    if (all.length >= 40) return;
  }
}

const wordOf = (p) => p.map((i) => face(grid[i])).join('');
function render() {
  cells.forEach((c, i) => {
    c.textContent = face(grid[i]);
    c.classList.toggle('on', path.includes(i));
    c.classList.toggle('last', path[path.length - 1] === i);
    c.disabled = over;
  });
  $('wgd-word').textContent = wordOf(path);
  const s = found.reduce((a, w) => a + POINTS(w.length), 0);
  $('score').textContent = String(s);
  $('count').textContent = found.length + ' / ' + all.length;
  const list = $('wgd-found');
  list.textContent = '';
  found.slice().reverse().forEach((w) => { const li = document.createElement('li'); li.textContent = w; li.dataset.p = '+' + POINTS(w.length); list.appendChild(li); });
}

function tryAdd(i) {
  if (over) return;
  if (!started) start();
  const last = path[path.length - 1];
  if (path.includes(i)) {
    // tapping the previous square steps back
    if (path.length > 1 && path[path.length - 2] === i) { path.pop(); play('flip'); render(); }
    return;
  }
  if (path.length && !near(last, i)) return;
  path.push(i);
  play('select');
  render();
}
function submit() {
  const w = wordOf(path);
  path = [];
  if (w.length < 3) { render(); return; }
  if (found.includes(w)) { setStatus('Already found ' + w.toUpperCase(), 'neutral'); play('error'); }
  else if (all.includes(w)) { found.push(w); setStatus(w.toUpperCase() + ' +' + POINTS(w.length)); play(w.length >= 6 ? 'king' : 'found'); }
  else { setStatus(w.toUpperCase() + ' isn’t in our word list', 'neutral'); play('error'); }
  render();
}

function start() {
  started = true;
  rec.played();
  track('game_start', { game: 'word-grid' });
  const end = Date.now() + SECONDS * 1000;
  tick = setInterval(() => {
    left = Math.max(0, Math.ceil((end - Date.now()) / 1000));
    $('time').textContent = fmt(left * 1000);
    $('time').classList.toggle('low', left <= 15);
    if (left <= 0) finish();
  }, 250);
}

function finish() {
  clearInterval(tick);
  over = true; path = [];
  const s = found.reduce((a, w) => a + POINTS(w.length), 0);
  const record = rec.score(s, 'grid');
  render();
  setStatus('Time’s up! ' + s + ' points');
  // show what was missed
  const missed = all.filter((w) => !found.includes(w));
  $('wgd-missed').hidden = false;
  $('wgd-missed-list').textContent = missed.slice(0, 40).join(', ') + (missed.length > 40 ? ' and ' + (missed.length - 40) + ' more' : '');
  $('result-img').src = MASCOT[found.length >= all.length * 0.25 ? 'win' : 'draw'];
  $('result-text').textContent = s + ' points, ' + found.length + (found.length === 1 ? ' word' : ' words');
  $('result-sub').textContent = 'You found ' + found.length + ' of ' + all.length + ' possible words.' + (record ? ' A new best score!' : '') + ' The longest was ' + all[0].toUpperCase() + '.';
  $('result').hidden = false;
  play('win', 0.1);
  track('game_end', { game: 'word-grid', score: s, words: found.length });
}

function paintRecord(stats, best) {
  $('record').textContent = (stats.played || 0) + ((stats.played || 0) === 1 ? ' game' : ' games') + ' played' + (best.grid ? ' · best score ' + best.grid : '');
}

function newGame() {
  clearInterval(tick);
  roll();
  found = []; path = []; over = false; started = false; left = SECONDS;
  $('time').textContent = fmt(SECONDS * 1000);
  $('time').classList.remove('low');
  $('result').hidden = true;
  $('wgd-missed').hidden = true;
  setStatus('Find words of 3 or more letters', 'neutral');
  render();
}

// ---------- Input: drag through letters, or tap them ----------
let dragging = false, moved = false;
const grid4 = $('wgd-grid');
grid4.addEventListener('pointerdown', (e) => {
  const c = e.target.closest('.wgd-cell');
  if (!c || over) return;
  e.preventDefault();
  dragging = true; moved = false;
  const i = cells.indexOf(c);
  if (!path.length || near(path[path.length - 1], i) || path.includes(i)) tryAdd(i);
  else { path = []; tryAdd(i); }
  try { grid4.releasePointerCapture(e.pointerId); } catch (err) { /* ignore */ }
});
grid4.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const c = el && el.closest && el.closest('.wgd-cell');
  if (!c) return;
  // only count it when the finger is near the middle of a square, so diagonals are easy
  const r = c.getBoundingClientRect();
  if (Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) > r.width * 0.36) return;
  const i = cells.indexOf(c);
  if (path[path.length - 1] !== i) { moved = true; tryAdd(i); }
});
const up = () => { if (!dragging) return; dragging = false; if (moved && path.length >= 3) submit(); };
document.addEventListener('pointerup', up);
document.addEventListener('pointercancel', up);
$('wgd-enter').addEventListener('click', submit);
$('wgd-clear').addEventListener('click', () => { path = []; play('flip'); render(); });
document.addEventListener('keydown', (e) => {
  if (over || e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea')) return;
  if (e.key === 'Enter') { e.preventDefault(); submit(); return; }
  if (e.key === 'Backspace') { e.preventDefault(); path.pop(); render(); return; }
  if (e.key === 'Escape') { path = []; render(); return; }
  const k = e.key.toLowerCase();
  if (!/^[a-z]$/.test(k)) return;
  // typing: pick the matching square next to the last one (or any, to start)
  const last = path[path.length - 1];
  const opts = cells.map((_, i) => i).filter((i) => grid[i] === k && !path.includes(i) && (last === undefined || near(last, i)));
  if (opts.length) { e.preventDefault(); tryAdd(opts[0]); }
});
$('new-game').addEventListener('click', () => { play('shuffle'); newGame(); });
$('again').addEventListener('click', () => { play('shuffle'); newGame(); });
newGame();
