// Reversi page: against the computer, or two players taking turns on one device.
import * as E from './reversi-engine.js';
import { setStatus, showResult, hideResult, setTurn, levelSwitch, record, opponentSwitch } from './game-ui.js';
import { track } from './firebase.js';
import { store } from './site.js';
import { play } from './sound.js';

const SAVE = 'bgs-rv-game';
const saveGame = () => store.set(SAVE, { board, last, toMove: turn, mode: getOpp() });
const clearGame = () => store.set(SAVE, null);
function placeSound(flips) {
  play('place');
  flips.slice(0, 12).forEach((_, k) => play('flip', 0.08 + k * 0.035));
}

const boardEl = document.getElementById('board');
const FILES = 'abcdefgh';
const getLevel = levelSwitch('rv');
const rec = record('rv');
const getOpp = opponentSwitch('rv', () => newGame());
const friend = () => getOpp() === 'friend';

// turn: E.YOU (gold, moves first) or E.CPU (black). In 2-player mode these are Player 1 and Player 2.
let board, over, busy, last, started, turn;
let cpuTimer = 0;
const nameOf = (side) => (side === E.YOU ? 'Player 1' : 'Player 2');
const humanToMove = () => !over && !busy && (friend() || turn === E.YOU);

const cells = [];
for (let i = 0; i < 64; i++) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.i = String(i);
  btn.innerHTML = '<span></span>';
  boardEl.appendChild(btn);
  cells.push(btn);
}
boardEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-i]');
  if (btn) onSquare(Number(btn.dataset.i));
});

const squareName = (i) => FILES[i & 7] + ((i >> 3) + 1);

function render() {
  const moves = new Set(humanToMove() ? E.legalMoves(board, turn) : []);
  const dotClass = 'move-dot' + (friend() && turn === E.CPU ? ' p2' : '');
  for (let i = 0; i < 64; i++) {
    const v = board[i];
    const btn = cells[i];
    const span = btn.firstChild;
    const cls = v === E.YOU ? 'disc you' : v === E.CPU ? 'disc cpu' : moves.has(i) ? dotClass : '';
    if (span.className !== cls) span.className = cls;
    btn.classList.toggle('last', i === last);
    btn.classList.toggle('can', moves.has(i));
    btn.disabled = !moves.has(i);
    const dark = friend() ? 'black' : 'computer';
    btn.setAttribute('aria-label', squareName(i) + ', ' + (v === E.YOU ? 'gold' : v === E.CPU ? dark : moves.has(i) ? 'you can play here' : 'empty'));
  }
  const c = E.count(board);
  document.getElementById('count-you').textContent = c.you + (c.you === 1 ? ' disc' : ' discs');
  document.getElementById('count-cpu').textContent = c.cpu + (c.cpu === 1 ? ' disc' : ' discs');
}

function finish() {
  over = true; busy = false;
  clearGame();
  setTurn(null);
  const c = E.count(board);
  const result = c.you > c.cpu ? 'win' : c.you < c.cpu ? 'lose' : 'draw';
  const line = c.you + ' – ' + c.cpu;
  if (friend()) {
    play(result === 'draw' ? 'draw' : 'win', 0.4);
    if (result === 'draw') { setStatus('It’s a draw', 'neutral'); showResult('draw', 'It’s a draw', '32 discs each.'); }
    else {
      const winner = result === 'win' ? 'Player 1' : 'Player 2';
      setStatus(winner + ' wins ' + line, result === 'win' ? '' : 'cpu');
      showResult('win', winner + ' wins!', 'Final score ' + line + '.');
    }
    track('game_end', { game: 'reversi', result, mode: 'friend' });
    render();
    return;
  }
  play(result, 0.4);
  if (result === 'win') { setStatus('You win ' + line); showResult('win', 'You win!', 'Final score ' + line + '.'); }
  if (result === 'lose') { setStatus('Computer wins ' + line, 'cpu'); showResult('lose', 'Computer wins', 'Final score ' + line + '. Have another go?'); }
  if (result === 'draw') { setStatus('It’s a draw', 'neutral'); showResult('draw', 'It’s a draw', '32 discs each.'); }
  rec.add(result);
  track('game_end', { game: 'reversi', result, level: getLevel() });
  render();
}

function onSquare(i) {
  if (!humanToMove() || !E.flipsFor(board, i, turn).length) return;
  if (!started) { started = true; track('game_start', { game: 'reversi', level: friend() ? 'friend' : getLevel() }); }
  const r = E.play(board, i, turn);
  placeSound(r.flips);
  board = r.board;
  last = i;
  afterMove(-turn);
}

// Hand the turn to `next`, handling passes and the end of the game.
function afterMove(next) {
  if (E.isOver(board)) return finish();
  if (!E.legalMoves(board, next).length) {
    // `next` must pass; the same side plays again.
    const mover = -next;
    turn = mover;
    saveGame();
    const passer = friend() ? nameOf(next) + ' has no move.' : next === E.CPU ? 'Computer has no move.' : 'You have no move.';
    if (!friend() && mover === E.CPU) {
      setStatus(passer + ' Computer plays again', 'cpu');
      busy = true;
      setTurn('cpu');
      render();
      cpuTimer = setTimeout(computerMove, 900);
      return;
    }
    busy = false;
    setTurn(mover === E.YOU ? 'you' : 'cpu');
    setStatus(passer + ' ' + (friend() ? nameOf(mover) + ' again' : 'Your turn again'), friend() && mover === E.CPU ? 'cpu' : '');
    render();
    return;
  }
  turn = next;
  saveGame();
  if (!friend() && turn === E.CPU) {
    busy = true;
    setTurn('cpu');
    setStatus('Computer is thinking…', 'cpu');
    render();
    cpuTimer = setTimeout(computerMove, 500);
    return;
  }
  busy = false;
  setTurn(turn === E.YOU ? 'you' : 'cpu');
  setStatus(friend() ? nameOf(turn) + '’s turn' : 'Your turn', friend() && turn === E.CPU ? 'cpu' : '');
  render();
}

function computerMove() {
  const m = E.pickComputerMove(board, getLevel());
  busy = false;
  if (m < 0) return afterMove(E.YOU);
  const r = E.play(board, m, E.CPU);
  placeSound(r.flips);
  board = r.board;
  last = m;
  afterMove(E.YOU);
}

function newGame() {
  clearTimeout(cpuTimer);
  board = E.startBoard();
  over = false; busy = false; last = -1; started = false; turn = E.YOU;
  clearGame();
  hideResult();
  setTurn('you');
  setStatus(friend() ? 'Player 1’s turn' : 'Your turn');
  render();
}

// Pick up an unfinished game after a refresh or a return visit.
function resume() {
  const g = store.get(SAVE, null);
  if (!g || !Array.isArray(g.board) || g.board.length !== 64 || E.isOver(g.board)) return false;
  if ((g.mode || 'cpu') !== getOpp()) return false;
  board = g.board;
  last = typeof g.last === 'number' ? g.last : -1;
  over = false; busy = false; started = true;
  hideResult();
  const next = g.toMove === E.CPU ? E.CPU : E.YOU;
  // afterMove(next) hands the turn to `next` (or handles a pass).
  afterMove(next);
  if (!friend() && turn === E.YOU && !busy) setStatus('Welcome back. Your turn');
  return true;
}

document.getElementById('new-game').addEventListener('click', newGame);
if (!resume()) newGame();
