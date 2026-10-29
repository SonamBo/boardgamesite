// Dots and Boxes: take turns drawing a line between two dots. Close a box to claim it and go again.
import { store } from './site.js';
import { setStatus, levelSwitch, opponentSwitch, record, showResult } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { wait } from './dice-ui.js';

const $ = (id) => document.getElementById(id);
const SIZES = { easy: 3, medium: 4, hard: 5 };
const SIZE_KEY = 'bgs-dots-size';
const score = record('dots');
const getLevel = levelSwitch('dots', () => {});
const getOpp = opponentSwitch('dots', () => newGame(), { you: 'You', cpu: 'Computer', p1: 'Player 1', p2: 'Player 2' });
const vsCpu = () => getOpp() === 'cpu';
const svg = $('db-board');

let n = [3, 4, 5, 6].includes(store.get(SIZE_KEY, 4)) ? store.get(SIZE_KEY, 4) : 4;
// lines: ids "h:r:c" (r 0..n, c 0..n-1) and "v:r:c" (r 0..n-1, c 0..n)
let lines, owner, turn, scores, over, busy, started, lastLine;

const allLines = () => {
  const out = [];
  for (let r = 0; r <= n; r++) for (let c = 0; c < n; c++) out.push('h:' + r + ':' + c);
  for (let r = 0; r < n; r++) for (let c = 0; c <= n; c++) out.push('v:' + r + ':' + c);
  return out;
};
const sidesOf = (r, c) => ['h:' + r + ':' + c, 'h:' + (r + 1) + ':' + c, 'v:' + r + ':' + c, 'v:' + r + ':' + (c + 1)];
function boxesOf(id) {
  const [t, r, c] = [id[0], +id.split(':')[1], +id.split(':')[2]];
  const out = [];
  if (t === 'h') { if (r > 0) out.push([r - 1, c]); if (r < n) out.push([r, c]); }
  else { if (c > 0) out.push([r, c - 1]); if (c < n) out.push([r, c]); }
  return out;
}
const count = (L, r, c) => sidesOf(r, c).filter((s) => L.has(s)).length;

// play a line: returns how many boxes it closed
function draw(id, p) {
  lines.add(id); lastLine = id;
  let closed = 0;
  for (const [r, c] of boxesOf(id)) if (count(lines, r, c) === 4) { owner[r * n + c] = p; closed++; }
  return closed;
}

// ---------- The computer ----------
function chainSize(L, id) {
  // how many boxes the opponent could take after this line is drawn
  const S = new Set(L); S.add(id);
  let taken = 0, again = true;
  while (again) {
    again = false;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (count(S, r, c) === 3) { for (const s of sidesOf(r, c)) if (!S.has(s)) S.add(s); taken++; again = true; }
    }
  }
  return taken;
}
function cpuPick() {
  const lvl = getLevel();
  const free = allLines().filter((l) => !lines.has(l));
  // 1. take any box that's ready
  const take = free.filter((l) => boxesOf(l).some(([r, c]) => count(lines, r, c) === 3));
  if (take.length && (lvl !== 'easy' || Math.random() < 0.8)) return take[0];
  // 2. a safe line that doesn't give a box away
  const safe = free.filter((l) => boxesOf(l).every(([r, c]) => count(lines, r, c) < 2));
  if (safe.length && (lvl !== 'easy' || Math.random() < 0.7)) return safe[Math.floor(Math.random() * safe.length)];
  // 3. give away as little as possible
  if (lvl === 'easy') return free[Math.floor(Math.random() * free.length)];
  let best = free[0], bv = Infinity;
  for (const l of free) { const v = chainSize(lines, l); if (v < bv) { bv = v; best = l; } }
  return best;
}

// ---------- Drawing ----------
const G = 100 / (n + 1);
function render() {
  const g = 100 / (n + 0.6), off = g * 0.3;
  const X = (c) => off + c * g, Y = (r) => off + r * g;
  let h = '';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const o = owner[r * n + c];
    if (o) h += '<rect x="' + (X(c) + 1) + '" y="' + (Y(r) + 1) + '" width="' + (g - 2) + '" height="' + (g - 2) + '" rx="2" class="bx p' + o + '"/><text x="' + (X(c) + g / 2) + '" y="' + (Y(r) + g / 2 + 2.4) + '" class="bxl">' + (vsCpu() ? (o === 1 ? 'You' : 'CPU') : 'P' + o) + '</text>';
  }
  for (const id of allLines()) {
    const [t, r, c] = [id[0], +id.split(':')[1], +id.split(':')[2]];
    const [x1, y1, x2, y2] = t === 'h' ? [X(c), Y(r), X(c + 1), Y(r)] : [X(c), Y(r), X(c), Y(r + 1)];
    const on = lines.has(id);
    h += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" class="ln' + (on ? ' on' : '') + (id === lastLine ? ' last' : '') + '"/>';
    if (!on) h += '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" class="hit" data-id="' + id + '" tabindex="0" role="button" aria-label="Line ' + id + '"/>';
  }
  for (let r = 0; r <= n; r++) for (let c = 0; c <= n; c++) h += '<circle cx="' + X(c) + '" cy="' + Y(r) + '" r="1.5" class="dot"/>';
  svg.innerHTML = h;
  svg.classList.toggle('wait', busy || over || (vsCpu() && turn === 2));
  $('score-you').textContent = String(scores[1]);
  $('score-cpu').textContent = String(scores[2]);
  $('row-you').classList.toggle('turn-you', turn === 1 && !over);
  $('row-cpu').classList.toggle('turn-cpu', turn === 2 && !over);
}

async function move(id, p) {
  if (!started) { started = true; track('game_start', { game: 'dots-and-boxes', opponent: getOpp(), size: n }); }
  const closed = draw(id, p);
  scores[p] += closed;
  play(closed ? 'found' : 'place');
  if (lines.size === allLines().length) { render(); return finish(); }
  if (!closed) turn = 3 - p;
  render();
  const who = vsCpu() ? (turn === 1 ? 'Your' : 'Computer’s') : (turn === 1 ? 'Player 1’s' : 'Player 2’s');
  setStatus(closed ? (p === 1 && vsCpu() ? 'You closed ' : (vsCpu() ? 'The computer closed ' : 'Player ' + p + ' closed ')) + (closed === 1 ? 'a box' : 'two boxes') + ': go again' : who + ' turn', turn === 2 ? 'cpu' : '');
  if (vsCpu() && turn === 2) { busy = true; render(); await wait(closed ? 350 : 600); busy = false; move(cpuPick(), 2); }
}

function finish() {
  over = true;
  render();
  const [a, b] = [scores[1], scores[2]];
  const res = a > b ? 'win' : a < b ? 'lose' : 'draw';
  if (vsCpu()) { score.add(res); showResult(res, res === 'win' ? 'You won!' : res === 'lose' ? 'The computer won' : 'It’s a draw', 'Boxes: you ' + a + ', computer ' + b + '.'); }
  else showResult(res === 'draw' ? 'draw' : 'win', res === 'draw' ? 'It’s a draw' : (a > b ? 'Player 1' : 'Player 2') + ' wins!', 'Boxes: ' + a + ' to ' + b + '.');
  setStatus('Game over: ' + a + ' to ' + b, res === 'lose' && vsCpu() ? 'cpu' : '');
  play(res === 'lose' && vsCpu() ? 'lose' : 'win', 0.1);
  track('game_end', { game: 'dots-and-boxes', result: res });
}

function newGame() {
  lines = new Set(); owner = new Array(n * n).fill(0); turn = 1; scores = [0, 0, 0]; over = false; busy = false; started = false; lastLine = null;
  $('result').hidden = true;
  render();
  setStatus((vsCpu() ? 'Your' : 'Player 1’s') + ' turn: draw a line', '');
}
svg.addEventListener('click', (e) => {
  const l = e.target.closest('.hit');
  if (!l || busy || over || (vsCpu() && turn === 2)) return;
  move(l.dataset.id, turn);
});
svg.addEventListener('keydown', (e) => { const l = e.target.closest('.hit'); if (l && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); l.dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
document.querySelectorAll('[data-dsize]').forEach((b) => {
  b.setAttribute('aria-pressed', String(Number(b.dataset.dsize) === n));
  b.addEventListener('click', () => {
    if (busy) return;
    n = Number(b.dataset.dsize); store.set(SIZE_KEY, n);
    document.querySelectorAll('[data-dsize]').forEach((x) => x.setAttribute('aria-pressed', String(Number(x.dataset.dsize) === n)));
    newGame();
  });
});
$('new-game').addEventListener('click', () => { if (!busy) newGame(); });
$('again').addEventListener('click', newGame);
void SIZES; void G;
newGame();
