// Reversi page: against the computer, or two players taking turns on one device.
import * as E from './reversi-engine.js';
import { online, roomInLink } from './online.js';
import { setStatus, showResult, hideResult, setTurn, levelSwitch, record, opponentSwitch, sideSwitch, movesFirst, hintButton, moveHistory, askResume, modeName } from './game-ui.js';
import { track } from './firebase.js';
import { store } from './site.js';
import { play } from './sound.js';

const SAVE = 'bgs-rv-game';
const saveGame = () => onlineOn || store.set(SAVE, { board, last, toMove: turn, mode: getOpp(), me, side: getSide() });
const clearGame = () => store.set(SAVE, null);
function placeSound(flips) {
  play('place');
  flips.slice(0, 12).forEach((_, k) => play('flip', 0.08 + k * 0.035));
}

const boardEl = document.getElementById('board');
const undoBtn = document.getElementById('undo');
const FILES = 'abcdefgh';
const getLevel = levelSwitch('rv');
const rec = record('rv');
const getOpp = opponentSwitch('rv', () => newGame());
const friend = () => getOpp() === 'friend';
// Against the computer you move first (gold), second (black) or either at random.
const getSide = sideSwitch('rv', ['first', 'second', 'random'], () => newGame());
let me = E.YOU;   // your colour against the computer in this game: gold moves first
// Show hint: Easy, against the computer
const hint = hintButton({
  shown: () => !friend() && !onlineOn && getLevel() === 'easy',
  find: () => {
    if (!humanToMove() || friend()) return null;
    const i = E.pickComputerMove(board, 'medium', Math.random, me);
    return i >= 0 ? [cells[i]] : null;
  }
});

// turn: E.YOU (gold, moves first) or E.CPU (black). In 2-player mode these are Player 1 and Player 2.
// Against the computer, `me` is your colour and the computer plays -me.
let board, over, busy, last, started, turn;
let cpuTimer = 0;
// positions before each move, for Undo (vs the computer it takes back your move and its reply)
let history = [];
const snapshot = () => history.push({ board: board.slice(), turn, last });
let onlineOn = roomInLink, ol = null;
const friendish = () => friend() || onlineOn; // no computer turns
const nameOf = (side) => (side === E.YOU ? 'Player 1' : 'Player 2');
const humanToMove = () => !over && !busy && (onlineOn ? ol.myTurn() : friend() || turn === me);
const rowOf = (side) => (side === E.YOU ? 'you' : 'cpu');   // the players card has a gold row and a black row
// Name the gold and black rows for this game.
function paintSides() {
  if (friendish()) return;
  document.querySelector('[data-name="p1"]').textContent = me === E.YOU ? 'You' : 'Computer';
  document.querySelector('[data-name="p2"]').textContent = me === E.YOU ? 'Computer' : 'You';
  boardEl.setAttribute('aria-label', 'Reversi board. You play ' + (me === E.YOU ? 'gold and move first.' : 'black and move second.'));
}

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
// Moves so far, and a replay at the end: history holds the position before each move, so the position
// after k moves is history[k] (or the board itself). view: the position being replayed (null: the game).
let view = null;
const hist = moveHistory({ show: (k) => { view = k == null ? null : { board: history[k].board, last: history[k].last }; render(); } });

function render() {
  const shown = view ? view.board : board, shownLast = view ? view.last : last;
  const moves = new Set(humanToMove() ? E.legalMoves(board, turn) : []);
  const dotClass = 'move-dot' + (turn === E.CPU ? ' p2' : '');
  for (let i = 0; i < 64; i++) {
    const v = shown[i];
    const btn = cells[i];
    const span = btn.firstChild;
    const cls = v === E.YOU ? 'disc you' : v === E.CPU ? 'disc cpu' : moves.has(i) ? dotClass : '';
    if (span.className !== cls) span.className = cls;
    btn.classList.toggle('last', i === shownLast);
    btn.classList.toggle('can', moves.has(i));
    btn.disabled = !moves.has(i);
    btn.setAttribute('aria-label', squareName(i) + ', ' + (v === E.YOU ? 'gold' : v === E.CPU ? 'black' : moves.has(i) ? 'you can play here' : 'empty'));
  }
  undoBtn.disabled = busy || over || onlineOn || !(friend() ? history.length : history.some((h) => h.turn === me));
  const c = E.count(shown);
  hist.set(history.map((h, k) => squareName(k + 1 < history.length ? history[k + 1].last : last)));
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
  if (onlineOn) {
    const mine = result === 'draw' ? 'draw' : (result === 'win') === (ol.mySeat() === 0) ? 'win' : 'lose';
    play(mine === 'lose' ? 'lose' : 'win', 0.4);
    setStatus(mine === 'win' ? 'You win ' + line : mine === 'lose' ? 'Your friend wins ' + line : 'It’s a draw', mine === 'lose' ? 'cpu' : '');
    showResult(mine, mine === 'win' ? 'You win!' : mine === 'lose' ? 'Your friend wins' : 'It’s a draw', 'Final score ' + line + ' (Gold – Black).');
    render(); hist.end();
    return;
  }
  if (friend()) {
    play(result === 'draw' ? 'draw' : 'win', 0.4);
    if (result === 'draw') { setStatus('It’s a draw', 'neutral'); showResult('draw', 'It’s a draw', '32 discs each.'); }
    else {
      const winner = result === 'win' ? 'Player 1' : 'Player 2';
      setStatus(winner + ' wins ' + line, result === 'win' ? '' : 'cpu');
      showResult('win', winner + ' wins!', 'Final score ' + line + '.');
    }
    track('game_end', { game: 'reversi', result, mode: 'friend' });
    render(); hist.end();
    return;
  }
  // against the computer: your discs first
  const mine = me === E.YOU ? result : result === 'win' ? 'lose' : result === 'lose' ? 'win' : 'draw';
  const myLine = me === E.YOU ? line : c.cpu + ' – ' + c.you;
  play(mine, 0.4);
  if (mine === 'win') { setStatus('You win ' + myLine); showResult('win', 'You win!', 'Final score ' + myLine + '.'); }
  if (mine === 'lose') { setStatus('Computer wins ' + myLine, 'cpu'); showResult('lose', 'Computer wins', 'Final score ' + myLine + '. Have another go?'); }
  if (mine === 'draw') { setStatus('It’s a draw', 'neutral'); showResult('draw', 'It’s a draw', '32 discs each.'); }
  rec.add(mine);
  track('game_end', { game: 'reversi', result: mine, level: getLevel() });
  render(); hist.end();
}

function onSquare(i, remote = false) {
  if ((!remote && !humanToMove()) || !E.flipsFor(board, i, turn).length) return;
  if (!started) { started = true; track('game_start', { game: 'reversi', level: friend() ? 'friend' : getLevel() }); }
  snapshot();
  const r = E.play(board, i, turn);
  placeSound(r.flips);
  board = r.board;
  last = i;
  afterMove(-turn);
  if (onlineOn && !remote) ol.send(String(i), turn === E.YOU ? 0 : 1, E.isOver(board));
  if (onlineOn && !over) setStatus(ol.myTurn() ? 'Your turn' : 'Waiting for your friend', ol.myTurn() ? '' : 'cpu');
}

// Hand the turn to `next`, handling passes and the end of the game.
function afterMove(next) {
  if (E.isOver(board)) return finish();
  if (!E.legalMoves(board, next).length) {
    // `next` must pass; the same side plays again.
    const mover = -next;
    turn = mover;
    saveGame();
    const passer = friend() ? nameOf(next) + ' has no move.' : next !== me ? 'Computer has no move.' : 'You have no move.';
    if (!friendish() && mover !== me) {
      setStatus(passer + ' Computer plays again', 'cpu');
      busy = true;
      setTurn(rowOf(mover));
      render();
      cpuTimer = setTimeout(computerMove, 900);
      return;
    }
    busy = false;
    setTurn(rowOf(mover));
    setStatus(passer + ' ' + (friend() ? nameOf(mover) + ' again' : 'Your turn again'), friend() && mover === E.CPU ? 'cpu' : '');
    render();
    return;
  }
  turn = next;
  saveGame();
  if (!friendish() && turn !== me) {
    busy = true;
    setTurn(rowOf(turn));
    setStatus('Computer is thinking…', 'cpu');
    render();
    cpuTimer = setTimeout(computerMove, 500);
    return;
  }
  busy = false;
  setTurn(rowOf(turn));
  setStatus(friend() ? nameOf(turn) + '’s turn' : 'Your turn', friend() && turn === E.CPU ? 'cpu' : '');
  render();
}

function computerMove() {
  const m = E.pickComputerMove(board, getLevel(), Math.random, -me);
  busy = false;
  if (m < 0) return afterMove(me);
  snapshot();
  const r = E.play(board, m, -me);
  placeSound(r.flips);
  board = r.board;
  last = m;
  afterMove(me);
}

function newGame() {
  clearTimeout(cpuTimer);
  hint.reset();
  board = E.startBoard();
  history = []; view = null; hist.reset();
  over = false; busy = false; last = -1; started = false; turn = E.YOU;   // gold moves first
  me = movesFirst(getSide()) ? E.YOU : E.CPU;
  clearGame();
  hideResult();
  paintSides();
  if (!friendish() && me !== E.YOU) {
    // the computer opens
    busy = true; setTurn('you'); setStatus('Computer is thinking…', 'cpu'); render();
    cpuTimer = setTimeout(computerMove, 500);
    return;
  }
  setTurn('you');
  setStatus(friend() ? 'Player 1’s turn' : 'Your turn' + (getSide() === 'random' && !onlineOn ? ': you move first this time' : ''));
  render();
}

// Pick up an unfinished game after a refresh or a return visit.
function resume() {
  const g = store.get(SAVE, null);
  if (!g || !Array.isArray(g.board) || g.board.length !== 64 || E.isOver(g.board)) return false;
  if ((g.mode || 'cpu') !== getOpp()) return false;
  // a game against the computer reopens only with the same First / Second / Random choice
  if (getOpp() === 'cpu' && (g.side || 'first') !== getSide()) return false;
  me = g.me === E.CPU ? E.CPU : E.YOU;
  paintSides();
  board = g.board;
  last = typeof g.last === 'number' ? g.last : -1;
  over = false; busy = false; started = true;
  hideResult();
  const next = g.toMove === E.CPU ? E.CPU : E.YOU;
  turn = next; busy = true; render();   // the saved game shows behind the question
  askResume(modeName(friend(), getLevel(), friend() ? '' : 'you play ' + (me === E.YOU ? 'gold' : 'black'))).then((ok) => {
    busy = false;
    if (!ok) return newGame();
    // afterMove(next) hands the turn to `next` (or handles a pass).
    afterMove(next);
  });
  return true;
}

document.getElementById('new-game').addEventListener('click', () => { if (!onlineOn) newGame(); });
undoBtn.addEventListener('click', () => {
  if (busy || over || onlineOn || !history.length) return;
  // vs the computer, take back your move and its reply
  let h = history.pop();
  while (!friend() && h.turn !== me && history.length) h = history.pop();
  if (!friend() && h.turn !== me) { history.push(h); return; }
  board = h.board; turn = h.turn; last = h.last;
  play('card');
  saveGame();
  setTurn(rowOf(turn));
  setStatus(friend() ? nameOf(turn) + '’s turn' : 'Your turn', friend() && turn === E.CPU ? 'cpu' : '');
  render();
});
undoBtn.classList.add('online-hide');
document.getElementById('new-game').classList.add('online-hide');
ol = online('reversi', {
  reset: () => newGame(),
  apply: (t) => onSquare(Number(t), true),
  seatName: (s) => (s === 0 ? 'Gold (first)' : 'Black'),
  over: () => over,
  onlineChanged: (on) => { onlineOn = on; document.body.classList.toggle('online', on); render(); }
});
if (roomInLink || !resume()) newGame();
