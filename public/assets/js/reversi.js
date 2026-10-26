// Reversi page.
import * as E from './reversi-engine.js';
import { setStatus, showResult, hideResult, setTurn, levelSwitch, record } from './game-ui.js';
import { track } from './firebase.js';

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
  setTurn(null);
  const c = E.count(board);
  const result = c.you > c.cpu ? 'win' : c.you < c.cpu ? 'lose' : 'draw';
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
  board = E.play(board, i, E.YOU).board;
  last = i;
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
  board = E.play(board, m, E.CPU).board;
  last = m;
  afterMove(E.YOU);
}

function newGame() {
  board = E.startBoard();
  over = false; busy = false; last = -1; started = false;
  hideResult();
  setTurn('you');
  setStatus('Your turn');
  render();
}

document.getElementById('new-game').addEventListener('click', newGame);
newGame();
