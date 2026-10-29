// Mancala (Kalah rules): sow seeds round the board, land in your store for another turn, capture from empty pits.
// pits[0..5] yours (left to right), [6] your store, [7..12] the opponent's (right to left along the top), [13] their store.
import { store } from './site.js';
import { setStatus, levelSwitch, opponentSwitch, record, showResult } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { shake } from './solo.js';
import { wait } from './dice-ui.js';

const $ = (id) => document.getElementById(id);
const SAVE = 'bgs-mancala-game';
const score = record('mancala');
const getLevel = levelSwitch('mancala', () => {});
const getOpp = opponentSwitch('mancala', () => newGame(), { you: 'You', cpu: 'Computer', p1: 'Player 1', p2: 'Player 2' });
const vsCpu = () => getOpp() === 'cpu';

let B, turn, over, busy, started, lastPit;
const STORE = [6, 13];
const own = (p, i) => (p === 0 ? i >= 0 && i <= 5 : i >= 7 && i <= 12);

// Sow from pit i for player p. Returns { b, again, captured, last }.
export function sow(b0, p, i) {
  const b = b0.slice();
  let n = b[i]; b[i] = 0; let j = i;
  while (n) { j = (j + 1) % 14; if (j === STORE[1 - p]) continue; b[j]++; n--; }
  let captured = 0;
  if (own(p, j) && b[j] === 1 && b[12 - j] > 0) { captured = b[12 - j] + 1; b[STORE[p]] += captured; b[j] = 0; b[12 - j] = 0; }
  const again = j === STORE[p];
  // game end: one side empty, the other side's seeds go to its owner
  if (b.slice(0, 6).every((x) => !x) || b.slice(7, 13).every((x) => !x)) {
    for (let k = 0; k < 6; k++) { b[6] += b[k]; b[k] = 0; b[13] += b[7 + k]; b[7 + k] = 0; }
  }
  return { b, again, captured, last: j };
}
const moves = (b, p) => [0, 1, 2, 3, 4, 5].map((k) => (p === 0 ? k : 7 + k)).filter((i) => b[i] > 0);
const ended = (b) => b.slice(0, 6).every((x) => !x) && b.slice(7, 13).every((x) => !x);

function minimax(b, p, depth, alpha, beta, me) {
  if (depth === 0 || ended(b)) return b[STORE[me]] - b[STORE[1 - me]];
  const ms = moves(b, p);
  let best = p === me ? -Infinity : Infinity;
  for (const i of ms) {
    const r = sow(b, p, i);
    const v = minimax(r.b, r.again && !ended(r.b) ? p : 1 - p, depth - 1, alpha, beta, me);
    if (p === me) { best = Math.max(best, v); alpha = Math.max(alpha, v); } else { best = Math.min(best, v); beta = Math.min(beta, v); }
    if (beta <= alpha) break;
  }
  return best;
}
function cpuPick(b, p) {
  const lvl = getLevel(), depth = { easy: 1, medium: 4, hard: 9 }[lvl];
  const ms = moves(b, p);
  if (lvl === 'easy' && Math.random() < 0.4) return ms[Math.floor(Math.random() * ms.length)];
  let best = ms[0], bv = -Infinity;
  for (const i of ms) {
    const r = sow(b, p, i);
    const v = minimax(r.b, r.again && !ended(r.b) ? p : 1 - p, depth - 1, -Infinity, Infinity, p) + Math.random() * 0.1;
    if (v > bv) { bv = v; best = i; }
  }
  return best;
}

// ---------- Drawing ----------
const pitEls = [...document.querySelectorAll('.mc-pit')];
function seedsHtml(n) {
  let h = '';
  const shown = Math.min(n, 18);
  for (let k = 0; k < shown; k++) {
    const a = k * 2.399, r = 15 * Math.sqrt((k + 0.5) / Math.max(shown, 6));
    h += '<i style="left:' + (50 + Math.cos(a) * r * 2.4).toFixed(1) + '%;top:' + (50 + Math.sin(a) * r * 2.4).toFixed(1) + '%;--h:' + ((k * 47) % 360) + '"></i>';
  }
  return h;
}
function render() {
  const names = vsCpu() ? ['You', 'Computer'] : ['Player 1', 'Player 2'];
  pitEls.forEach((el) => {
    const i = Number(el.dataset.i);
    el.querySelector('.seeds').innerHTML = seedsHtml(B[i]);
    el.querySelector('b').textContent = String(B[i]);
    const mine = own(turn, i) && B[i] > 0 && !over && !busy && !(vsCpu() && turn === 1);
    el.classList.toggle('can', mine);
    el.classList.toggle('last', i === lastPit);
    if (el.tagName === 'BUTTON') el.disabled = !mine;
    el.setAttribute('aria-label', (STORE.includes(i) ? (i === 6 ? names[0] : names[1]) + '’s store' : 'Pit') + ': ' + B[i] + (B[i] === 1 ? ' seed' : ' seeds'));
  });
  $('score-you').textContent = String(B[6]);
  $('score-cpu').textContent = String(B[13]);
  $('row-you').classList.toggle('turn-you', turn === 0 && !over);
  $('row-cpu').classList.toggle('turn-cpu', turn === 1 && !over);
}

async function moveFrom(i) {
  if (over || busy) return;
  if (!started) { started = true; track('game_start', { game: 'mancala', opponent: getOpp() }); }
  busy = true;
  const p = turn;
  // animate the sowing seed by seed
  let n = B[i]; B[i] = 0; let j = i;
  const step = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 110;
  while (n) { j = (j + 1) % 14; if (j === STORE[1 - p]) continue; B[j]++; n--; lastPit = j; if (step) { render(); play('select'); await wait(step); } }
  // apply captures and the end of game using the rules function on the starting board
  const r = sow(prevBoard, p, i);
  B = r.b; lastPit = r.last;
  busy = false;
  const who = p === 0 && vsCpu() ? 'You' : (vsCpu() ? 'The computer' : p === 0 ? 'Player 1' : 'Player 2');
  if (r.captured) { play('capture'); setStatus(who + ' captured ' + r.captured + ' seeds!', p && vsCpu() ? 'cpu' : ''); }
  else play('place');
  if (ended(B)) return finish();
  if (r.again) { setStatus(who + (who === 'You' ? ' land' : ' lands') + ' in the store: go again!', p && vsCpu() ? 'cpu' : ''); }
  else { turn = 1 - p; if (!r.captured) setStatus(turnText(), turn && vsCpu() ? 'cpu' : ''); }
  render();
  save();
  if (vsCpu() && turn === 1) cpuTurn();
}
let prevBoard = null;
function play0(i) { prevBoard = B.slice(); moveFrom(i); }
const turnText = () => (vsCpu() ? (turn === 0 ? 'Your turn: pick a pit' : 'Computer’s turn') : (turn === 0 ? 'Player 1' : 'Player 2') + '’s turn');

async function cpuTurn() {
  busy = true; render();
  await wait(700);
  busy = false;
  play0(cpuPick(B, 1));
}

function finish() {
  over = true;
  render();
  store.set(SAVE, null);
  const [a, b] = [B[6], B[13]];
  const res = a > b ? 'win' : a < b ? 'lose' : 'draw';
  if (vsCpu()) {
    score.add(res);
    showResult(res, res === 'win' ? 'You won!' : res === 'lose' ? 'The computer won' : 'It’s a draw', 'You ' + a + ', computer ' + b + '.');
  } else showResult(res === 'draw' ? 'draw' : 'win', res === 'draw' ? 'It’s a draw' : (a > b ? 'Player 1' : 'Player 2') + ' wins!', 'Player 1 ' + a + ', Player 2 ' + b + '.');
  setStatus('Game over: ' + a + ' to ' + b, res === 'lose' && vsCpu() ? 'cpu' : '');
  play(res === 'lose' && vsCpu() ? 'lose' : 'win', 0.1);
  track('game_end', { game: 'mancala', result: res });
}

function save() { if (started && !over) store.set(SAVE, { opp: getOpp(), B, turn }); }
function resume() {
  const g = store.get(SAVE, null);
  if (!g || g.opp !== getOpp() || !Array.isArray(g.B) || g.B.length !== 14) return false;
  B = g.B; turn = g.turn | 0; over = false; busy = false; started = true; lastPit = -1;
  render(); setStatus('Welcome back. ' + turnText(), '');
  if (vsCpu() && turn === 1) cpuTurn();
  return true;
}
function newGame() {
  B = [4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0]; turn = 0; over = false; busy = false; started = false; lastPit = -1;
  $('result').hidden = true;
  store.set(SAVE, null);
  render();
  setStatus(turnText(), '');
}
pitEls.forEach((el) => el.addEventListener('click', () => {
  const i = Number(el.dataset.i);
  if (busy || over || (vsCpu() && turn === 1)) return;
  if (!own(turn, i) || !B[i]) { shake(el, play); return; }
  play0(i);
}));
$('new-game').addEventListener('click', () => { if (!busy) newGame(); });
$('again').addEventListener('click', newGame);
window.addEventListener('pagehide', save);
if (!resume()) newGame();
