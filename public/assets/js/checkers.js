// Checkers page.
import * as E from './checkers-engine.js';
import { setStatus, showResult, hideResult, setTurn, levelSwitch, record, opponentSwitch } from './game-ui.js';
import { track } from './firebase.js';
import { store } from './site.js';
import { play } from './sound.js';
import { online, roomInLink } from './online.js';
import { ladder } from './ladder.js';

const SAVE = 'bgs-ck-game';

const boardEl = document.getElementById('board');
const FILES = 'abcdefgh';
const CROWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18h18l-1.6-10.5-4.6 4.2L12 4.5 9.2 11.7 4.6 7.5z"/></svg>';
const DRAW_AFTER = 80;   // half-moves of kings shuffling with no capture

// Rated practice-ladder game (?bot=…): fixed level, no level changes. Null for an ordinary game.
const L = ladder('checkers', { resign: () => { if (!over && started) { clearTimeout(cpuTimer); busy = false; finish('lose', true); } }, again: () => newGame() });
const cpuName = L ? L.bot.name : 'Computer';
const getLevel = L ? () => L.level : levelSwitch('ck');
const rec = record('ck');
const getOpp = L ? () => 'cpu' : opponentSwitch('ck', () => newGame());
const friend = () => getOpp() === 'friend';

// turn: whose move it is (E.YOU = gold at the bottom, E.CPU = black at the top; in 2-player mode, Player 1 and Player 2)
let board, over, busy, partial, lastPath, quiet, started, turn;
let cpuTimer = 0;
let onlineOn = roomInLink && !L, ol = null;
// a move as one character per square (keeps online moves short)
const ALPH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const token = (m) => m.path.map((i) => ALPH[i]).join('');
const nameOf = (side) => (side === E.YOU ? 'Player 1' : 'Player 2');
const markTurn = () => setTurn(turn === E.YOU ? 'you' : 'cpu');

// ---------- Board DOM ----------
const cells = [];
for (let i = 0; i < 64; i++) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = E.isDark(i) ? 'dark' : 'light';
  btn.dataset.i = String(i);
  if (!E.isDark(i)) { btn.tabIndex = -1; btn.setAttribute('aria-hidden', 'true'); }
  boardEl.appendChild(btn);
  cells.push(btn);
}
boardEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-i]');
  if (btn) onSquare(Number(btn.dataset.i));
});

const squareName = (i) => FILES[i & 7] + (8 - (i >> 3));

// Moves the person at the screen can make right now.
function playerMoves() {
  if (over || busy) return [];
  if (onlineOn) return ol.myTurn() ? E.legalMoves(board, turn) : [];
  if (!friend() && turn !== E.YOU) return [];
  return E.legalMoves(board, turn);
}

function render() {
  const moves = playerMoves();
  const matching = moves.filter((m) => partial.every((p, k) => m.path[k] === p));
  const pickable = new Set(partial.length <= 1 ? moves.map((m) => m.path[0]) : []);
  const targets = new Set(partial.length ? matching.map((m) => m.path[partial.length]).filter((x) => x !== undefined) : []);
  const mustCapture = moves.length && moves[0].caps.length > 0;

  for (let i = 0; i < 64; i++) {
    if (!E.isDark(i)) continue;
    const p = board[i];
    const btn = cells[i];
    btn.classList.toggle('last', !!lastPath && lastPath.includes(i));
    btn.classList.toggle('sel', partial.includes(i));
    btn.classList.toggle('can', pickable.has(i) || targets.has(i));
    btn.classList.toggle('must', mustCapture && !partial.length && pickable.has(i));
    let html = '';
    if (p) html = '<span class="piece ' + (p > 0 ? 'you' : 'cpu') + '">' + (Math.abs(p) === 2 ? CROWN : '') + '</span>';
    else if (targets.has(i)) html = '<span class="hint-dot"></span>';
    if (btn.innerHTML !== html) btn.innerHTML = html;
    const who = friend() ? (p > 0 ? 'gold ' : p < 0 ? 'black ' : '') : (p > 0 ? 'your ' : p < 0 ? 'computer ' : '');
    const what = p ? who + (Math.abs(p) === 2 ? 'king' : 'piece') : (targets.has(i) ? 'move here' : 'empty');
    btn.setAttribute('aria-label', squareName(i) + ', ' + what);
    btn.disabled = !(pickable.has(i) || targets.has(i));
  }
  const n = E.countPieces(board);
  document.getElementById('count-you').textContent = n.you + (n.you === 1 ? ' piece' : ' pieces');
  document.getElementById('count-cpu').textContent = n.cpu + (n.cpu === 1 ? ' piece' : ' pieces');
  if (!over && !busy) {
    const whose = friend() ? nameOf(turn) + '’s turn' : 'Your turn';
    setStatus(partial.length > 1 ? 'Keep jumping' : mustCapture ? whose + ': you must capture' : whose, friend() && turn === E.CPU ? 'cpu' : '');
  }
}

function onSquare(i) {
  if (over || busy) return;
  const moves = playerMoves();
  const firstPicks = new Set(moves.map((m) => m.path[0]));
  if (partial.length <= 1 && firstPicks.has(i)) {
    partial = partial[0] === i ? [] : [i];
    if (partial.length) play('select');
    render();
    return;
  }
  if (!partial.length) return;
  const matching = moves.filter((m) => partial.every((p, k) => m.path[k] === p));
  if (!matching.some((m) => m.path[partial.length] === i)) return;
  partial = partial.concat(i);
  const done = matching.find((m) => m.path.length === partial.length && m.path[partial.length - 1] === i);
  if (done) playerMove(done);
  else render();
}

function noteQuiet(m) {
  const wasKing = Math.abs(board[m.path[0]]) === 2;
  quiet = m.caps.length || !wasKing ? 0 : quiet + 1;
}

function moveSound(m) {
  const p = board[m.path[0]];
  const row = m.path[m.path.length - 1] >> 3;
  play(m.caps.length ? 'capture' : 'move');
  if ((p === 1 && row === 0) || (p === -1 && row === 7)) play('king', 0.2);
}

const saveGame = (toMove) => onlineOn || L || store.set(SAVE, { board, quiet, toMove, lastPath, mode: getOpp() });
const clearGame = () => store.set(SAVE, null);

function finish(result, resigned = false) {
  over = true;
  clearGame();
  setTurn(null);
  if (onlineOn) {
    // result is from Gold's side; Gold is seat 0
    const mine = result === 'draw' ? 'draw' : (result === 'win') === (ol.mySeat() === 0) ? 'win' : 'lose';
    play(mine === 'lose' ? 'lose' : 'win', 0.25);
    setStatus(mine === 'win' ? 'You win!' : mine === 'lose' ? 'Your friend wins' : 'It’s a draw', mine === 'lose' ? 'cpu' : 'neutral');
    showResult(mine, mine === 'win' ? 'You win!' : mine === 'lose' ? 'Your friend wins' : 'It’s a draw', mine === 'draw' ? 'No captures for a long while.' : 'Good game.');
    render();
    return;
  }
  if (friend()) {
    // result is from Player 1's side
    play(result === 'draw' ? 'draw' : 'win', 0.25);
    if (result === 'draw') { setStatus('It’s a draw', 'neutral'); showResult('draw', 'It’s a draw', 'No captures for a long while.'); }
    else {
      const winner = result === 'win' ? 'Player 1' : 'Player 2';
      setStatus(winner + ' wins!', result === 'win' ? '' : 'cpu');
      showResult('win', winner + ' wins!', 'Nicely played. New game?');
    }
    track('game_end', { game: 'checkers', result, mode: 'friend' });
    render();
    return;
  }
  play(result, 0.25);
  L?.finish(result);
  if (result === 'win') { setStatus('You win!'); showResult('win', 'You win!', 'Nicely played.'); }
  if (result === 'lose') { setStatus(resigned ? 'You resigned' : cpuName + ' wins', 'cpu'); showResult('lose', resigned ? 'You resigned' : cpuName + ' wins', 'Have another go?'); }
  if (result === 'draw') { setStatus('It’s a draw', 'neutral'); showResult('draw', 'It’s a draw', 'No captures for a long while.'); }
  rec.add(result);
  track('game_end', { game: 'checkers', result, level: getLevel() });
  render();
}

function playerMove(m, remote = false) {
  if (!started) { started = true; track('game_start', { game: 'checkers', level: friend() ? 'friend' : getLevel() }); L?.start(); }
  noteQuiet(m);
  moveSound(m);
  board = E.applyMove(board, m);
  lastPath = m.path;
  partial = [];
  const next = -turn;
  const ends = !E.legalMoves(board, next).length || quiet >= DRAW_AFTER;
  if (onlineOn && !remote) ol.send(token(m), next === E.YOU ? 0 : 1, ends);
  if (!E.legalMoves(board, next).length) return finish(turn === E.YOU ? 'win' : 'lose');
  if (quiet >= DRAW_AFTER) return finish('draw');
  turn = next;
  saveGame(turn);
  if (onlineOn) { markTurn(); render(); setStatus(ol.myTurn() ? 'Your move' : 'Waiting for your friend', ol.myTurn() ? '' : 'cpu'); return; }
  if (friend()) { markTurn(); render(); return; }
  startComputerTurn();
}

function startComputerTurn() {
  turn = E.CPU;
  busy = true;
  setTurn('cpu');
  setStatus(cpuName + ' is thinking…', 'cpu');
  render();
  cpuTimer = setTimeout(computerMove, 450);
}

function computerMove() {
  const m = E.pickComputerMove(board, getLevel());
  busy = false;
  if (!m) return finish('win');
  noteQuiet(m);
  moveSound(m);
  board = E.applyMove(board, m);
  lastPath = m.path;
  if (!E.legalMoves(board, E.YOU).length) return finish('lose');
  if (quiet >= DRAW_AFTER) return finish('draw');
  turn = E.YOU;
  saveGame(E.YOU);
  setTurn('you');
  render();
}

function newGame() {
  L?.newGame();
  board = E.startBoard();
  over = false; busy = false; partial = []; lastPath = null; quiet = 0; started = false; turn = E.YOU;
  clearTimeout(cpuTimer);
  clearGame();
  hideResult();
  setTurn('you');
  render();
}

// Pick up an unfinished game after a refresh or a return visit.
function resume() {
  const g = store.get(SAVE, null);
  if (L || !g || !Array.isArray(g.board) || g.board.length !== 64) return false;
  if ((g.mode || 'cpu') !== getOpp()) return false;
  if (!E.legalMoves(g.board, E.YOU).length || !E.legalMoves(g.board, E.CPU).length) return false;
  board = g.board;
  quiet = g.quiet | 0;
  lastPath = Array.isArray(g.lastPath) ? g.lastPath : null;
  over = false; busy = false; partial = []; started = true;
  turn = g.toMove === E.CPU ? E.CPU : E.YOU;
  hideResult();
  if (turn === E.CPU && !friend()) { startComputerTurn(); return true; }
  markTurn();
  render();
  if (!friend()) setStatus('Welcome back. Your turn');
  return true;
}

document.getElementById('new-game').addEventListener('click', () => { if (!onlineOn) newGame(); });
document.getElementById('new-game').classList.add('online-hide');
ol = online('checkers', {
  reset: () => newGame(),
  apply: (t) => { const m = E.legalMoves(board, turn).find((x) => token(x) === t); if (m) playerMove(m, true); },
  seatName: (s) => (s === 0 ? 'Gold (bottom, first)' : 'Black'),
  over: () => over,
  onlineChanged: (on) => { onlineOn = on; document.body.classList.toggle('online', on); boardEl.classList.toggle('flipped', on && ol && ol.mySeat() === 1); render(); }
});
if (roomInLink || !resume()) newGame();
