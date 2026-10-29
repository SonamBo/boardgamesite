// Hex: Gold joins top to bottom, Ivory joins left to right. Take turns placing stones; there are no draws.
import { store } from './site.js';
import { setStatus, levelSwitch, opponentSwitch, record, showResult } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { wait } from './dice-ui.js';

const $ = (id) => document.getElementById(id);
const SIZE_KEY = 'bgs-hex-size';
const score = record('hex');
const getLevel = levelSwitch('hex', () => {});
const getOpp = opponentSwitch('hex', () => newGame(), { you: 'You', cpu: 'Computer', p1: 'Gold', p2: 'Ivory' });
const vsCpu = () => getOpp() === 'cpu';
const svg = $('hx-board');
let n = [7, 9, 11].includes(store.get(SIZE_KEY, 9)) ? store.get(SIZE_KEY, 9) : 9;
let B, turn, over, busy, started, last, winPath;

const NB = [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0]];
const nbs = (i) => { const r = Math.floor(i / n), c = i % n; return NB.map(([dr, dc]) => [r + dr, c + dc]).filter(([a, b]) => a >= 0 && b >= 0 && a < n && b < n).map(([a, b]) => a * n + b); };
// player 1 joins row 0 to row n-1; player 2 joins column 0 to column n-1
const startSide = (p, i) => (p === 1 ? Math.floor(i / n) === 0 : i % n === 0);
const endSide = (p, i) => (p === 1 ? Math.floor(i / n) === n - 1 : i % n === n - 1);

function connected(b, p) {
  const seen = new Set(), prev = new Map(), q = [];
  for (let i = 0; i < n * n; i++) if (b[i] === p && startSide(p, i)) { q.push(i); seen.add(i); }
  while (q.length) {
    const i = q.shift();
    if (endSide(p, i)) { const path = []; for (let x = i; x != null; x = prev.get(x)) path.push(x); return path; }
    for (const j of nbs(i)) if (!seen.has(j) && b[j] === p) { seen.add(j); prev.set(j, i); q.push(j); }
  }
  return null;
}
// fewest empty cells p still needs to connect (own stones cost nothing)
function distance(b, p) {
  const dist = new Array(n * n).fill(Infinity);
  const dq = [];
  for (let i = 0; i < n * n; i++) if (startSide(p, i) && b[i] !== 3 - p) { dist[i] = b[i] === p ? 0 : 1; dq.push(i); }
  dq.sort((a, c) => dist[a] - dist[c]);
  while (dq.length) {
    let k = 0; for (let t = 1; t < dq.length; t++) if (dist[dq[t]] < dist[dq[k]]) k = t;
    const i = dq.splice(k, 1)[0];
    if (endSide(p, i)) return dist[i];
    for (const j of nbs(i)) {
      if (b[j] === 3 - p) continue;
      const d = dist[i] + (b[j] === p ? 0 : 1);
      if (d < dist[j]) { dist[j] = d; dq.push(j); }
    }
  }
  return 99;
}
function cpuPick(b, p) {
  const lvl = getLevel();
  const empties = b.map((x, i) => (x ? -1 : i)).filter((i) => i >= 0);
  if (empties.length === n * n) return Math.floor(n / 2) * n + Math.floor(n / 2);
  const noise = lvl === 'easy' ? 3 : lvl === 'medium' ? 0.8 : 0.05;
  let best = empties[0], bv = -Infinity;
  for (const i of empties) {
    b[i] = p;
    const mine = distance(b, p), theirs = distance(b, 3 - p);
    b[i] = 0;
    // also value blocking: what if the opponent took this cell?
    b[i] = 3 - p; const block = distance(b, 3 - p); b[i] = 0;
    const v = theirs * 1.0 - mine * 1.1 - block * (lvl === 'hard' ? 0.5 : 0.2) + Math.random() * noise;
    if (v > bv) { bv = v; best = i; }
  }
  return best;
}

// ---------- Drawing: a rhombus of hexagons ----------
const R = 1, W = Math.sqrt(3) * R;
const center = (i) => { const r = Math.floor(i / n), c = i % n; return [W * (c + r / 2) + W, 1.5 * R * r + 2 * R]; };
function render() {
  const w = W * (n + (n - 1) / 2) + 2 * W, h = 1.5 * R * (n - 1) + 4 * R;
  svg.setAttribute('viewBox', '0 0 ' + w.toFixed(2) + ' ' + h.toFixed(2));
  let s = '';
  // coloured edges: gold top and bottom, ivory left and right
  const [ax, ay] = center(0), [bx, by] = center(n - 1), [cx, cy] = center(n * n - n), [dx, dy] = center(n * n - 1);
  const pad = 1.25;
  s += '<path d="M' + (ax - W * 0.6) + ' ' + (ay - pad) + 'L' + (bx + W * 0.6) + ' ' + (by - pad) + '" class="edge e1"/>';
  s += '<path d="M' + (cx - W * 0.6) + ' ' + (cy + pad) + 'L' + (dx + W * 0.6) + ' ' + (dy + pad) + '" class="edge e1"/>';
  s += '<path d="M' + (ax - pad) + ' ' + (ay - 0.6) + 'L' + (cx - pad) + ' ' + (cy + 0.6) + '" class="edge e2"/>';
  s += '<path d="M' + (bx + pad) + ' ' + (by - 0.6) + 'L' + (dx + pad) + ' ' + (dy + 0.6) + '" class="edge e2"/>';
  for (let i = 0; i < n * n; i++) {
    const [x, y] = center(i);
    const pts = [0, 1, 2, 3, 4, 5].map((k) => { const a = Math.PI / 6 + k * Math.PI / 3; return (x + R * 0.98 * Math.cos(a)).toFixed(3) + ',' + (y + R * 0.98 * Math.sin(a)).toFixed(3); }).join(' ');
    s += '<polygon points="' + pts + '" class="hx' + (B[i] ? ' p' + B[i] : '') + (i === last ? ' last' : '') + (winPath && winPath.includes(i) ? ' win' : '') + '" data-i="' + i + '" tabindex="' + (B[i] ? -1 : 0) + '" role="button" aria-label="Row ' + (Math.floor(i / n) + 1) + ', column ' + (i % n + 1) + (B[i] ? (B[i] === 1 ? ', gold' : ', ivory') : ', empty') + '"/>';
  }
  svg.innerHTML = s;
  svg.classList.toggle('wait', busy || over || (vsCpu() && turn === 2));
  $('row-you').classList.toggle('turn-you', turn === 1 && !over);
  $('row-cpu').classList.toggle('turn-cpu', turn === 2 && !over);
}

async function put(i) {
  if (!started) { started = true; track('game_start', { game: 'hex', opponent: getOpp(), size: n }); }
  B[i] = turn; last = i;
  play('place');
  const path = connected(B, turn);
  if (path) { winPath = path; return finish(turn); }
  turn = 3 - turn;
  render();
  setStatus(vsCpu() ? (turn === 1 ? 'Your turn: join top to bottom' : 'Computer’s turn') : (turn === 1 ? 'Gold: join top to bottom' : 'Ivory: join left to right'), turn === 2 ? 'cpu' : '');
  if (vsCpu() && turn === 2) { busy = true; render(); await wait(400); busy = false; put(cpuPick(B, 2)); }
}
function finish(w) {
  over = true; render();
  if (vsCpu()) {
    const won = w === 1;
    score.add(won ? 'win' : 'lose');
    showResult(won ? 'win' : 'lose', won ? 'You connected!' : 'The computer connected', won ? 'Top joined to bottom.' : 'Left joined to right.');
    play(won ? 'win' : 'lose', 0.1);
  } else { showResult('win', (w === 1 ? 'Gold' : 'Ivory') + ' wins!', w === 1 ? 'Top joined to bottom.' : 'Left joined to right.'); play('win', 0.1); }
  setStatus((w === 1 ? (vsCpu() ? 'You win!' : 'Gold wins!') : (vsCpu() ? 'The computer wins' : 'Ivory wins!')), w === 2 && vsCpu() ? 'cpu' : '');
  track('game_end', { game: 'hex', result: w === 1 ? 'win' : 'lose' });
}
function newGame() {
  B = new Array(n * n).fill(0); turn = 1; over = false; busy = false; started = false; last = -1; winPath = null;
  $('result').hidden = true;
  render();
  setStatus(vsCpu() ? 'Your turn: join top to bottom' : 'Gold: join top to bottom', '');
}
svg.addEventListener('click', (e) => { const h = e.target.closest('.hx'); if (!h || busy || over || (vsCpu() && turn === 2)) return; const i = Number(h.dataset.i); if (!B[i]) put(i); });
svg.addEventListener('keydown', (e) => { const h = e.target.closest('.hx'); if (h && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); h.dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
document.querySelectorAll('[data-hsize]').forEach((b) => {
  b.setAttribute('aria-pressed', String(Number(b.dataset.hsize) === n));
  b.addEventListener('click', () => { if (busy) return; n = Number(b.dataset.hsize); store.set(SIZE_KEY, n); document.querySelectorAll('[data-hsize]').forEach((x) => x.setAttribute('aria-pressed', String(Number(x.dataset.hsize) === n))); newGame(); });
});
$('new-game').addEventListener('click', () => { if (!busy) newGame(); });
$('again').addEventListener('click', newGame);
newGame();
