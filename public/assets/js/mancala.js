// Mancala (Kalah rules): sow seeds round the board, land in your store for another turn, capture from empty pits.
// pits[0..5] yours (left to right), [6] your store, [7..12] the opponent's (right to left along the top), [13] their store.
import { store } from './site.js';
import { setStatus, levelSwitch, opponentSwitch, record, showResult } from './game-ui.js';
import { ladder } from './ladder.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { shake } from './solo.js';
import { wait } from './dice-ui.js';
import { STORE, own, sow, moves, ended, pick } from './mancala-rules.js';

export { sow };

const $ = (id) => document.getElementById(id);
const SAVE = 'bgs-mancala-game';
const score = record('mancala');
// Rated practice-ladder game (?bot=…): fixed level. Null for an ordinary game.
const L = ladder('mancala', { resign: () => { if (!over && started) finish(true); }, again: () => newGame() });
const cpuName = L ? L.bot.name : 'Computer';
const getLevel = L ? () => L.level : levelSwitch('mancala', () => {});
const getOpp = L ? () => 'cpu' : opponentSwitch('mancala', () => newGame(), { you: 'You', cpu: 'Computer', p1: 'Player 1', p2: 'Player 2' });
const vsCpu = () => getOpp() === 'cpu';

let B, turn, over, busy, started, lastPit;
function cpuPick(b, p) { return pick(b, p, getLevel()); }

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
  const names = vsCpu() ? ['You', cpuName] : ['Player 1', 'Player 2'];
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
  if (!started) { started = true; track('game_start', { game: 'mancala', opponent: getOpp() }); L?.start(); }
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
const turnText = () => (vsCpu() ? (turn === 0 ? 'Your turn: pick a pit' : cpuName + '’s turn') : (turn === 0 ? 'Player 1' : 'Player 2') + '’s turn');

async function cpuTurn() {
  busy = true; render();
  await wait(700);
  busy = false;
  if (over) return;
  play0(cpuPick(B, 1));
}

function finish(resigned = false) {
  over = true;
  render();
  store.set(SAVE, null);
  const [a, b] = [B[6], B[13]];
  const res = resigned ? 'lose' : a > b ? 'win' : a < b ? 'lose' : 'draw';
  if (vsCpu()) {
    score.add(res);
    L?.finish(res);
    showResult(res, resigned ? 'You resigned' : res === 'win' ? 'You won!' : res === 'lose' ? (L ? cpuName : 'The computer') + ' won' : 'It’s a draw', 'You ' + a + ', ' + (L ? cpuName : 'computer') + ' ' + b + '.');
  } else showResult(res === 'draw' ? 'draw' : 'win', res === 'draw' ? 'It’s a draw' : (a > b ? 'Player 1' : 'Player 2') + ' wins!', 'Player 1 ' + a + ', Player 2 ' + b + '.');
  setStatus('Game over: ' + a + ' to ' + b, res === 'lose' && vsCpu() ? 'cpu' : '');
  play(res === 'lose' && vsCpu() ? 'lose' : 'win', 0.1);
  track('game_end', { game: 'mancala', result: res });
}

function save() { if (started && !over && !L) store.set(SAVE, { opp: getOpp(), B, turn }); }
function resume() {
  const g = store.get(SAVE, null);
  if (L || !g || g.opp !== getOpp() || !Array.isArray(g.B) || g.B.length !== 14) return false;
  B = g.B; turn = g.turn | 0; over = false; busy = false; started = true; lastPit = -1;
  render(); setStatus('Welcome back. ' + turnText(), '');
  if (vsCpu() && turn === 1) cpuTurn();
  return true;
}
function newGame() {
  L?.newGame();
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
