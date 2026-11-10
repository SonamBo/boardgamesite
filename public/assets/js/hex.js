// Hex: Gold joins top to bottom, Ivory joins left to right. Take turns placing stones; there are no draws.
import { store } from './site.js';
import { setStatus, levelSwitch, opponentSwitch, record, showResult, sideSwitch, movesFirst, animationSwitch, popIn, lightUp, animating, stopAnimations, hintButton, tapConfirm } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { wait } from './dice-ui.js';
import { online, roomInLink } from './online.js';

const $ = (id) => document.getElementById(id);
const SIZE_KEY = 'bgs-hex-size';
const SWAP_KEY = 'bgs-hex-swap';
const score = record('hex', { draws: false });
const getLevel = levelSwitch('hex', () => {});
const getOpp = opponentSwitch('hex', () => newGame(), { you: 'You', cpu: 'Computer', p1: 'Gold', p2: 'Ivory' });
const vsCpu = () => getOpp() === 'cpu';
// Against the computer you move first (gold, top to bottom), second (ivory, left to right) or either at random.
const getSide = sideSwitch('hex', ['first', 'second', 'random'], () => newGame());
let me = 1;   // your colour against the computer in this game
let gameNo = 0;   // a computer move still waiting when a new game starts is dropped
const cpuTurnNow = () => vsCpu() && !onlineOn && turn !== me;
animationSwitch();
const cellEl = (i) => svg.querySelector('.hx[data-i="' + i + '"]');
const tap2 = tapConfirm();   // on small cells: tap once to preview, again to place
// Show hint: Easy, against the computer
const hint = hintButton({
  shown: () => vsCpu() && !onlineOn && getLevel() === 'easy',
  find: () => {
    if (!humanTurn()) return null;
    if (canSwap()) return 'Gold’s stone is near the middle: swapping is a good idea';
    return [cellEl(cpuPick(B, me, 'hard'))];
  }
});
const goal = (p) => (p === 1 ? 'join top to bottom' : 'join left to right');
function paintSides() {
  if (!vsCpu() || onlineOn) return;
  document.querySelector('[data-name="p1"]').textContent = me === 1 ? 'You' : 'Computer';
  document.querySelector('[data-name="p2"]').textContent = me === 2 ? 'You' : 'Computer';
}
const svg = $('hx-board');
let n = [7, 9, 11].includes(store.get(SIZE_KEY, 9)) ? store.get(SIZE_KEY, 9) : 9;
let B, turn, over, busy, started, last, winPath, onlineOn = roomInLink, ol = null;
// Swap (pie) rule, off by default: after Gold's first stone, Ivory may take it over instead of placing one.
// The stone is replaced by an ivory stone on the mirror-image cell (row and column swapped), so it serves Ivory's sides.
let swapRule = store.get(SWAP_KEY, false) === true;
// positions before each move, for Undo (vs the computer it takes back your move and its reply)
let history = [];
const undoBtn = $('undo'), swapBtn = $('swap');
const stones = () => B.filter(Boolean).length;
const canSwap = () => swapRule && !over && turn === 2 && stones() === 1 && B.indexOf(1) >= 0;
const humanTurn = () => !busy && !over && !animating() && (onlineOn ? ol.myTurn() : !cpuTurnNow());

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
function cpuPick(b, p, lvl = getLevel()) {
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
  svg.classList.toggle('wait', busy || over || cpuTurnNow());
  undoBtn.disabled = busy || over || onlineOn || !(vsCpu() ? history.some((h) => h.turn === me) : history.length);
  swapBtn.hidden = !(canSwap() && humanTurn());
  $('row-you').classList.toggle('turn-you', turn === 1 && !over);
  $('row-cpu').classList.toggle('turn-cpu', turn === 2 && !over);
}

async function put(i, remote = false) {
  tap2.clear();
  history.push({ B: B.slice(), turn, last });
  if (!started) { started = true; track('game_start', { game: 'hex', opponent: getOpp(), size: n }); }
  B[i] = turn; last = i;
  play('place');
  const path = connected(B, turn);
  if (onlineOn && !remote) ol.send(String(i), 2 - turn, !!path);
  if (path) {
    winPath = path;
    finish(turn);
    // light up the winning chain from one edge to the other
    lightUp(path.slice().reverse().map(cellEl), 80);
    return;
  }
  turn = 3 - turn;
  render();
  popIn(cellEl(i), 200);
  if (onlineOn) { setStatus(ol.myTurn() ? 'Your turn: join ' + (ol.mySeat() === 0 ? 'top to bottom' : 'left to right') : 'Waiting for your friend', ol.myTurn() ? '' : 'cpu'); return; }
  setStatus(statusText(), (vsCpu() ? turn !== me : turn === 2) ? 'cpu' : '');
  if (canSwap() && humanTurn()) setStatus((vsCpu() ? 'Your turn' : 'Ivory') + ': place a stone, or swap to take over Gold’s stone', vsCpu() ? '' : 'cpu');
  if (cpuTurnNow()) cpuTurn();
}
const statusText = () => (vsCpu() ? (turn === me ? 'Your turn: ' + goal(me) : 'Computer is thinking…') : (turn === 1 ? 'Gold: ' : 'Ivory: ') + goal(turn));
async function cpuTurn() {
  const g = gameNo;
  busy = true; render(); await wait(500);
  if (g !== gameNo) return;
  busy = false;
  if (over) return;
  if (canSwap() && cpuWantsSwap()) return swap();
  put(cpuPick(B, 3 - me));
}
// The computer takes over a first stone in the middle of the board, where it's strongest.
function cpuWantsSwap() {
  const i = B.indexOf(1), r = Math.floor(i / n), c = i % n, m = (n - 1) / 2;
  return Math.abs(r - m) + Math.abs(c - m) + Math.abs(r + c - 2 * m) <= (getLevel() === 'easy' ? n * 0.35 : n * 0.6);
}
function swap(remote = false) {
  if (!canSwap()) return;
  history.push({ B: B.slice(), turn, last });
  const i = B.indexOf(1), r = Math.floor(i / n), c = i % n, j = c * n + r;
  B[i] = 0; B[j] = 2; last = j;
  play('card');
  if (onlineOn && !remote) ol.send('s', 0, false);
  turn = 1;
  render();
  if (onlineOn) { setStatus(ol.myTurn() ? 'Your friend swapped. Your turn: join top to bottom' : 'Waiting for your friend', ol.myTurn() ? '' : 'cpu'); return; }
  if (cpuTurnNow()) { setStatus('You swapped: the stone is yours now. Computer is thinking…', 'cpu'); cpuTurn(); return; }
  setStatus(vsCpu() ? 'The computer swapped: your stone is now theirs. Your turn' : 'Ivory swapped. Gold: join top to bottom', '');
}
function finish(w) {
  over = true; render();
  if (onlineOn) {
    const won = w - 1 === ol.mySeat();
    showResult(won ? 'win' : 'lose', won ? 'You connected!' : 'Your friend connected', w === 1 ? 'Top joined to bottom.' : 'Left joined to right.');
    setStatus(won ? 'You won!' : 'You lost', won ? '' : 'cpu');
    play(won ? 'win' : 'lose', 0.1);
    return;
  }
  const how = w === 1 ? 'Top joined to bottom.' : 'Left joined to right.';
  if (vsCpu()) {
    const won = w === me;
    score.add(won ? 'win' : 'lose');
    showResult(won ? 'win' : 'lose', won ? 'You connected!' : 'The computer connected', how);
    setStatus(won ? 'You win!' : 'The computer wins', won ? '' : 'cpu');
    play(won ? 'win' : 'lose', 0.1);
  } else { showResult('win', (w === 1 ? 'Gold' : 'Ivory') + ' wins!', how); setStatus((w === 1 ? 'Gold' : 'Ivory') + ' wins!', ''); play('win', 0.1); }
  track('game_end', { game: 'hex', result: w === (vsCpu() ? me : 1) ? 'win' : 'lose' });
}
function newGame() {
  gameNo++;
  stopAnimations();
  hint.reset();
  B = new Array(n * n).fill(0); turn = 1; history = []; over = false; busy = false; started = false; last = -1; winPath = null;
  me = movesFirst(getSide()) ? 1 : 2;
  $('result').hidden = true;
  paintSides();
  render();
  setStatus(statusText(), cpuTurnNow() ? 'cpu' : '');
  if (cpuTurnNow()) cpuTurn();
}
// a click from the keyboard (detail 0) places straight away; a tap may ask for a second tap first
svg.addEventListener('click', (e) => { const h = e.target.closest('.hx'); if (!h || !humanTurn()) return; const i = Number(h.dataset.i); if (!B[i] && (e.detail === 0 || tap2.ok(i, h, turn))) put(i); });
svg.addEventListener('keydown', (e) => { const h = e.target.closest('.hx'); if (h && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); h.dispatchEvent(new MouseEvent('click', { bubbles: true })); } });
document.querySelector('[data-hsize]').parentElement.classList.add('online-hide');
document.querySelector('[data-hsize]').parentElement.previousElementSibling.classList.add('online-hide');
document.querySelectorAll('[data-hsize]').forEach((b) => {
  b.setAttribute('aria-pressed', String(Number(b.dataset.hsize) === n));
  b.addEventListener('click', () => { if (busy) return; n = Number(b.dataset.hsize); store.set(SIZE_KEY, n); document.querySelectorAll('[data-hsize]').forEach((x) => x.setAttribute('aria-pressed', String(Number(x.dataset.hsize) === n))); newGame(); });
});
$('new-game').addEventListener('click', () => { if (!busy && !onlineOn) newGame(); });
$('new-game').classList.add('online-hide');
swapBtn.addEventListener('click', () => { if (humanTurn()) swap(); });
undoBtn.addEventListener('click', () => {
  if (busy || over || onlineOn || !history.length) return;
  // vs the computer, take back your move and its reply
  let h = history.pop();
  while (vsCpu() && h.turn !== me && history.length) h = history.pop();
  if (vsCpu() && h.turn !== me) { history.push(h); return; }
  B = h.B; turn = h.turn; last = h.last; winPath = null;
  play('card');
  render();
  setStatus(statusText(), !vsCpu() && turn === 2 ? 'cpu' : '');
});
undoBtn.classList.add('online-hide');
document.querySelector('[data-hswap]').parentElement.classList.add('online-hide');
document.querySelector('[data-hswap]').parentElement.previousElementSibling.classList.add('online-hide');
document.querySelectorAll('[data-hswap]').forEach((b) => {
  const paint = () => document.querySelectorAll('[data-hswap]').forEach((x) => x.setAttribute('aria-pressed', String((x.dataset.hswap === 'on') === swapRule)));
  paint();
  b.addEventListener('click', () => { if (busy) return; swapRule = b.dataset.hswap === 'on'; store.set(SWAP_KEY, swapRule); paint(); newGame(); });
});
ol = online('hex', {
  reset: () => newGame(),
  apply: (t) => { if (t === 's') return swap(true); const i = Number(t); if (B[i] === 0) put(i, true); },
  seatName: (s) => (s === 0 ? 'Gold (top to bottom)' : 'Ivory (left to right)'),
  // the room carries the board size, plus 's' when the swap rule is on: '9' or '9s'
  variant: (v) => { if (v) { const k = parseInt(v, 10); if ([7, 9, 11].includes(k)) n = k; swapRule = /s$/.test(v); } return String(n) + (swapRule ? 's' : ''); },
  over: () => over,
  onlineChanged: (on) => { onlineOn = on; document.body.classList.toggle('online', on); render(); }
});
$('again').addEventListener('click', newGame);
newGame();
