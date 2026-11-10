// Tic-tac-toe: three in a row on a 3×3 grid. Against the computer (Easy / Medium / Hard),
// two players on one device, or online with a friend by link (online.js; the token is the cell 0–8).
import { setStatus, showResult, hideResult, levelSwitch, opponentSwitch, record, setTurn, sideSwitch } from './game-ui.js';
import { play } from './sound.js';
import { track } from './firebase.js';
import { online, roomInLink } from './online.js';

const $ = (id) => document.getElementById(id);
const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
const X = 1, O = 2;
const score = record('ttt');
const getLevel = levelSwitch('ttt', () => {});
const getOpp = opponentSwitch('ttt', () => { if (!onlineOn) newGame(); });
// Against the computer you play X (first), O, or take turns going first (Alternate).
const getSide = sideSwitch('ttt', ['x', 'o', 'alt'], () => { if (!onlineOn) newGame(); }, 'alt');
let cpuTimer = 0;
const boardEl = $('board');
const undoBtn = $('undo');
// grids before each move, for Undo (vs the computer it takes back your move and its reply)
let history = [];

let board, turn, over, busy, youAre = X, firstThisGame = O, onlineOn = roomInLink, ol = null;
const vsCpu = () => !onlineOn && getOpp() === 'cpu';

const cells = Array.from({ length: 9 }, (_, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'ttt-cell';
  b.dataset.i = i;
  b.addEventListener('click', () => human(i));
  boardEl.appendChild(b);
  return b;
});
const MARK = {
  [X]: '<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M24 24l52 52M76 24L24 76"/></svg>',
  [O]: '<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="28"/></svg>'
};

function winner(b) {
  for (const l of LINES) if (b[l[0]] && b[l[0]] === b[l[1]] && b[l[0]] === b[l[2]]) return { who: b[l[0]], line: l };
  return b.every(Boolean) ? { who: 0, line: [] } : null;
}

// perfect play: minimax with a small preference for quicker wins
function minimax(b, p, depth) {
  const w = winner(b);
  if (w) return { s: w.who === 0 ? 0 : (w.who === O ? 10 - depth : depth - 10) };
  let best = { s: p === O ? -99 : 99, i: -1 };
  for (let i = 0; i < 9; i++) {
    if (b[i]) continue;
    b[i] = p;
    const r = minimax(b, p === X ? O : X, depth + 1);
    b[i] = 0;
    if ((p === O && r.s > best.s) || (p === X && r.s < best.s)) best = { s: r.s, i };
  }
  return best;
}
function cpuMove() {
  const me = youAre === X ? O : X, them = youAre;
  const free = board.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0);
  const lvl = getLevel();
  const finishing = (p) => free.find((i) => { const b = board.slice(); b[i] = p; return winner(b)?.who === p; });
  if (lvl === 'easy') {
    const w = finishing(me);
    if (w !== undefined && Math.random() < 0.6) return w;
    return free[Math.floor(Math.random() * free.length)];
  }
  if (lvl === 'medium') {
    const w = finishing(me); if (w !== undefined) return w;
    const block = finishing(them); if (block !== undefined && Math.random() < 0.9) return block;
    if (!board[4] && Math.random() < 0.6) return 4;
    return free[Math.floor(Math.random() * free.length)];
  }
  // hard: never loses. Minimax is written from O's side, so swap marks when the computer is X.
  const b = me === O ? board.slice() : board.map((v) => (v === X ? O : v === O ? X : 0));
  if (free.length === 9) return [0, 2, 4, 6, 8][Math.floor(Math.random() * 5)];
  return minimax(b, O, 0).i;
}

function render(line = []) {
  cells.forEach((c, i) => {
    c.innerHTML = board[i] ? MARK[board[i]] : '';
    c.className = 'ttt-cell' + (board[i] === X ? ' x' : board[i] === O ? ' o' : '') + (line.includes(i) ? ' win' : '');
    c.disabled = over || !!board[i] || busy;
    c.setAttribute('aria-label', 'Row ' + (Math.floor(i / 3) + 1) + ', column ' + (i % 3 + 1) + ': ' + (board[i] === X ? 'X' : board[i] === O ? 'O' : 'empty'));
  });
  undoBtn.disabled = busy || over || onlineOn || !(vsCpu() ? history.some((h) => h.turn === youAre) : history.length);
}
const nameOf = (p) => (onlineOn ? (p === seatMark() ? 'You' : 'Your friend') : vsCpu() ? (p === youAre ? 'You' : 'Computer') : p === X ? 'Player X' : 'Player O');
const seatMark = () => (ol && ol.mySeat() === 1 ? O : X);
function turnText() {
  if (onlineOn) return turn === seatMark() ? 'Your turn' : 'Waiting for your friend';
  if (vsCpu()) return turn === youAre ? 'Your turn' : 'Computer is thinking…';
  return (turn === X ? 'X' : 'O') + ' to play';
}

function place(i, remote = false) {
  if (over || board[i]) return;
  history.push({ board: board.slice(), turn });
  board[i] = turn;
  play(turn === X ? 'place' : 'drop');
  const w = winner(board);
  const mover = turn;
  turn = turn === X ? O : X;
  if (onlineOn && !remote) ol.send(String(i), turn === X ? 0 : 1, !!w);
  if (w) return finish(w);
  render();
  setTurn(onlineOn ? (turn === seatMark() ? 'you' : 'cpu') : vsCpu() ? (turn === youAre ? 'you' : 'cpu') : turn === X ? 'you' : 'cpu');
  setStatus(turnText(), (onlineOn && turn !== seatMark()) || (vsCpu() && turn !== youAre) ? 'cpu' : '');
  if (vsCpu() && turn !== youAre) {
    busy = true; render();
    cpuTimer = setTimeout(() => { busy = false; place(cpuMove()); }, 450);
  }
  return mover;
}
function human(i) {
  if (over || busy || board[i]) return;
  if (onlineOn) { if (!ol || !ol.myTurn() || turn !== seatMark()) return; }
  else if (vsCpu() && turn !== youAre) return;
  place(i);
}

function finish(w) {
  over = true;
  render(w.line);
  setTurn('');
  if (w.who === 0) {
    setStatus('It’s a draw', 'neutral');
    showResult('draw', 'It’s a draw', 'Nobody got three in a row.');
    if (vsCpu()) score.add('draw');
  } else if (onlineOn || vsCpu()) {
    const mine = w.who === (onlineOn ? seatMark() : youAre);
    setStatus(mine ? 'You win!' : onlineOn ? 'Your friend wins' : 'Computer wins', mine ? '' : 'cpu');
    showResult(mine ? 'win' : 'lose', mine ? 'You win!' : onlineOn ? 'Your friend wins' : 'Computer wins', mine ? 'Three in a row.' : 'Have another go?');
    if (vsCpu()) score.add(mine ? 'win' : 'lose');
  } else {
    const who = w.who === X ? 'X' : 'O';
    setStatus(who + ' wins!');
    showResult('win', who + ' wins!', 'Three in a row. Swap who goes first?');
  }
  play(w.who === 0 ? 'drop' : 'win', 0.1);
  track('game_end', { game: 'tic-tac-toe', mode: onlineOn ? 'online' : getOpp(), level: getLevel(), result: w.who === 0 ? 'draw' : 'win' });
}

function newGame() {
  clearTimeout(cpuTimer);
  board = Array(9).fill(0); over = false; busy = false; history = [];
  hideResult();
  if (onlineOn) { turn = X; youAre = X; }
  else {
    // players take turns going first; against the computer you play X when you start, O when it does
    firstThisGame = firstThisGame === X ? O : X;
    turn = X;
    const side = getSide();
    youAre = !vsCpu() ? X : side === 'x' ? X : side === 'o' ? O : firstThisGame === X ? X : O;
  }
  $('mark-you').innerHTML = MARK[onlineOn ? seatMark() : youAre];
  $('mark-cpu').innerHTML = MARK[(onlineOn ? seatMark() : youAre) === X ? O : X];
  render();
  setTurn(turn === (onlineOn ? seatMark() : youAre) || (!vsCpu() && !onlineOn) ? 'you' : 'cpu');
  setStatus(turnText(), '');
  track('game_start', { game: 'tic-tac-toe', mode: onlineOn ? 'online' : getOpp() });
  if (vsCpu() && turn !== youAre) { busy = true; render(); cpuTimer = setTimeout(() => { busy = false; place(cpuMove()); }, 500); }
}

$('new-game').addEventListener('click', () => { if (!onlineOn) newGame(); });
$('new-game').classList.add('online-hide');
$('again').addEventListener('click', () => { if (!onlineOn) newGame(); });
$('again').classList.add('online-hide');
undoBtn.addEventListener('click', () => {
  if (busy || over || onlineOn || !history.length) return;
  // vs the computer, take back your move and its reply
  let h = history.pop();
  while (vsCpu() && h.turn !== youAre && history.length) h = history.pop();
  if (vsCpu() && h.turn !== youAre) { history.push(h); return; }
  board = h.board; turn = h.turn;
  play('card');
  render();
  setTurn(vsCpu() || turn === X ? 'you' : 'cpu');
  setStatus(turnText(), '');
});
undoBtn.classList.add('online-hide');
document.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
  const n = Number(e.key);
  if (n >= 1 && n <= 9) { e.preventDefault(); human(n - 1); }
});

ol = online('tic-tac-toe', {
  reset: () => newGame(),
  apply: (tok) => place(Number(tok), true),
  seatName: (seat) => (seat === 0 ? 'X (you go first)' : 'O'),
  over: () => over,
  onlineChanged: (on) => {
    onlineOn = on; document.body.classList.toggle('online', on);
    if (board && on) { $('mark-you').innerHTML = MARK[seatMark()]; $('mark-cpu').innerHTML = MARK[seatMark() === X ? O : X]; render(); }
  }
});
newGame();
