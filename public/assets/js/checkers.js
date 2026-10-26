// Checkers page.
import * as E from './checkers-engine.js';
import { setStatus, showResult, hideResult, setTurn, levelSwitch, record } from './game-ui.js';
import { track } from './firebase.js';

const boardEl = document.getElementById('board');
const FILES = 'abcdefgh';
const CROWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18h18l-1.6-10.5-4.6 4.2L12 4.5 9.2 11.7 4.6 7.5z"/></svg>';
const DRAW_AFTER = 80;   // half-moves of kings shuffling with no capture

const getLevel = levelSwitch('ck');
const rec = record('ck');

let board, over, busy, partial, lastPath, quiet, started;

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

function playerMoves() {
  return !over && !busy ? E.legalMoves(board, E.YOU) : [];
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
    const who = p > 0 ? 'your ' : p < 0 ? 'computer ' : '';
    const what = p ? who + (Math.abs(p) === 2 ? 'king' : 'piece') : (targets.has(i) ? 'move here' : 'empty');
    btn.setAttribute('aria-label', squareName(i) + ', ' + what);
    btn.disabled = !(pickable.has(i) || targets.has(i));
  }
  const n = E.countPieces(board);
  document.getElementById('count-you').textContent = n.you + (n.you === 1 ? ' piece' : ' pieces');
  document.getElementById('count-cpu').textContent = n.cpu + (n.cpu === 1 ? ' piece' : ' pieces');
  if (!over && !busy) setStatus(partial.length > 1 ? 'Keep jumping' : mustCapture ? 'Your turn: you must capture' : 'Your turn');
}

function onSquare(i) {
  if (over || busy) return;
  const moves = playerMoves();
  const firstPicks = new Set(moves.map((m) => m.path[0]));
  if (partial.length <= 1 && firstPicks.has(i)) {
    partial = partial[0] === i ? [] : [i];
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

function finish(result) {
  over = true;
  setTurn(null);
  if (result === 'win') { setStatus('You win!'); showResult('win', 'You win!', 'Nicely played.'); }
  if (result === 'lose') { setStatus('Computer wins', 'cpu'); showResult('lose', 'Computer wins', 'Have another go?'); }
  if (result === 'draw') { setStatus('It’s a draw', 'neutral'); showResult('draw', 'It’s a draw', 'No captures for a long while.'); }
  rec.add(result);
  track('game_end', { game: 'checkers', result, level: getLevel() });
  render();
}

function playerMove(m) {
  if (!started) { started = true; track('game_start', { game: 'checkers', level: getLevel() }); }
  noteQuiet(m);
  board = E.applyMove(board, m);
  lastPath = m.path;
  partial = [];
  if (!E.legalMoves(board, E.CPU).length) return finish('win');
  if (quiet >= DRAW_AFTER) return finish('draw');
  busy = true;
  setTurn('cpu');
  setStatus('Computer is thinking…', 'cpu');
  render();
  setTimeout(computerMove, 450);
}

function computerMove() {
  const m = E.pickComputerMove(board, getLevel());
  busy = false;
  if (!m) return finish('win');
  noteQuiet(m);
  board = E.applyMove(board, m);
  lastPath = m.path;
  if (!E.legalMoves(board, E.YOU).length) return finish('lose');
  if (quiet >= DRAW_AFTER) return finish('draw');
  setTurn('you');
  render();
}

function newGame() {
  board = E.startBoard();
  over = false; busy = false; partial = []; lastPath = null; quiet = 0; started = false;
  hideResult();
  setTurn('you');
  render();
}

document.getElementById('new-game').addEventListener('click', newGame);
newGame();
