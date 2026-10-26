// Reversi page.
import * as E from './reversi-engine.js';
import { setStatus, showResult, hideResult, setTurn, levelSwitch, record } from './game-ui.js';
import { track } from './firebase.js';
import { store } from './site.js';
import { play } from './sound.js';

const SAVE = 'bgs-rv-game';
const saveGame = (toMove) => store.set(SAVE, { board, last, toMove });
const clearGame = () => store.set(SAVE, null);
function placeSound(flips) {
  play('place');
  flips.slice(0, 12).forEach((_, k) => play('flip', 0.08 + k * 0.035));
}

const boardEl = document.getElementById('board');
const FILES = 'abcdefgh';
const getLevel = levelSwitch('rv');
const rec = record('rv');

let board, over, busy, last, started;

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
  const moves = new Set(!over && !busy ? E.legalMoves(board, E.YOU) : []);
  for (let i = 0; i < 64; i++) {
    const v = board[i];
    const btn = cells[i];
    const span = btn.firstChild;
    const cls = v === E.YOU ? 'disc you' : v === E.CPU ? 'disc cpu' : moves.has(i) ? 'move-dot' : '';
    if (span.className !== cls) span.className = cls;
    btn.classList.toggle('last', i === last);
    btn.classList.toggle('can', moves.has(i));
    btn.disabled = !moves.has(i);
    btn.setAttribute('aria-label', squareName(i) + ', ' + (v === E.YOU ? 'gold' : v === E.CPU ? 'computer' : moves.has(i) ? 'you can play here' : 'empty'));
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
  play(result, 0.4);
  const line = c.you + ' – ' + c.cpu;
  if (result === 'win') { setStatus('You win ' + line); showResult('win', 'You win!', 'Final score ' + line + '.'); }
  if (result === 'lose') { setStatus('Computer wins ' + line, 'cpu'); showResult('lose', 'Computer wins', 'Final score ' + line + '. Have another go?'); }
  if (result === 'draw') { setStatus('It’s a draw', 'neutral'); showResult('draw', 'It’s a draw', '32 discs each.'); }
  rec.add(result);
  track('game_end', { game: 'reversi', result, level: getLevel() });
  render();
}

function onSquare(i) {
  if (over || busy || !E.flipsFor(board, i, E.YOU).length) return;
  if (!started) { started = true; track('game_start', { game: 'reversi', level: getLevel() }); }
  const r = E.play(board, i, E.YOU);
  placeSound(r.flips);
  board = r.board;
  last = i;
  saveGame(E.CPU);
  afterMove(E.CPU);
}

// Decide whose turn is next, handling passes and the end of the game.
function afterMove(next) {
  if (E.isOver(board)) return finish();
  if (next === E.CPU) {
    if (!E.legalMoves(board, E.CPU).length) {
      setTurn('you');
      setStatus('Computer has no move. Your turn again');
      render();
      return;
    }
    busy = true;
    setTurn('cpu');
    setStatus('Computer is thinking…', 'cpu');
    render();
    setTimeout(computerMove, 500);
  } else {
    busy = false;
    if (!E.legalMoves(board, E.YOU).length) {
      setStatus('You have no move. Computer plays again', 'cpu');
      busy = true;
      render();
      setTimeout(computerMove, 900);
      return;
    }
    setTurn('you');
    setStatus('Your turn');
    render();
  }
}

function computerMove() {
  const m = E.pickComputerMove(board, getLevel());
  if (m < 0) { busy = false; return afterMove(E.YOU); }
  const r = E.play(board, m, E.CPU);
  placeSound(r.flips);
  board = r.board;
  last = m;
  saveGame(E.YOU);
  afterMove(E.YOU);
}

function newGame() {
  board = E.startBoard();
  over = false; busy = false; last = -1; started = false;
  clearGame();
  hideResult();
  setTurn('you');
  setStatus('Your turn');
  render();
}

// Pick up an unfinished game after a refresh or a return visit.
function resume() {
  const g = store.get(SAVE, null);
  if (!g || !Array.isArray(g.board) || g.board.length !== 64 || E.isOver(g.board)) return false;
  board = g.board;
  last = typeof g.last === 'number' ? g.last : -1;
  over = false; busy = false; started = true;
  hideResult();
  afterMove(g.toMove === E.CPU ? E.CPU : E.YOU);
  if (g.toMove !== E.CPU && !busy) setStatus('Welcome back. Your turn');
  return true;
}

document.getElementById('new-game').addEventListener('click', newGame);
if (!resume()) newGame();
