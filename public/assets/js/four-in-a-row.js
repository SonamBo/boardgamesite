// Four in a Row page: vs-computer mode (Easy/Medium/Hard) and the daily challenge.
import * as E from './c4-engine.js';
import { store, dateKey, yesterdayKey } from './site.js';
import { onProgressLoaded } from './store.js';
import { levelSwitch, opponentSwitch } from './game-ui.js';
import { play } from './sound.js';
import { track } from './firebase.js';
import { online, roomInLink } from './online.js';

const $ = (id) => document.getElementById(id);
const boardEl = $('board');
const statusEl = $('status');
const mode = (new URLSearchParams(location.search).get('mode') === 'daily' || location.hash === '#daily') ? 'daily' : 'classic';
window.addEventListener('hashchange', () => location.reload());

const SAVE = 'bgs-c4-game';
const MASCOT = {
  win: '/assets/img/mascot-trophy.webp',
  lose: '/assets/img/mascot-confused.webp',
  draw: '/assets/img/mascot-wave.webp'
};

let board = E.emptyBoard();
let busy = false;        // computer thinking
let over = false;
let highlight = [];      // winning cells
let answerCell = -1;     // daily: where the right move would land
let lastDropped = -1;
let started = false;

// ---------- Board DOM ----------
const buttons = [];
for (let i = 0; i < E.ROWS * E.COLS; i++) {
  const c = i % E.COLS;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.dataset.col = String(c);
  btn.setAttribute('aria-label', 'Column ' + (c + 1));
  const disc = document.createElement('span');
  disc.className = 'disc';
  btn.appendChild(disc);
  boardEl.appendChild(btn);
  buttons.push(btn);
}
boardEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-col]');
  if (btn) onColumn(Number(btn.dataset.col));
});
boardEl.addEventListener('mouseover', (e) => {
  const btn = e.target.closest('button[data-col]');
  if (!btn) return;
  const c = btn.dataset.col;
  buttons.forEach((b) => b.classList.toggle('col-hover', b.dataset.col === c));
});
boardEl.addEventListener('mouseleave', () => buttons.forEach((b) => b.classList.remove('col-hover')));
// Keyboard: number keys 1–7 drop into that column while focus is on the board
boardEl.addEventListener('keydown', (e) => {
  const n = Number(e.key);
  if (n >= 1 && n <= 7) { e.preventDefault(); onColumn(n - 1); }
});

function render() {
  boardEl.classList.toggle('hover-ok', !over && !busy);
  for (let i = 0; i < buttons.length; i++) {
    const v = board[i];
    const disc = buttons[i].firstChild;
    disc.className = 'disc' +
      (v === E.YOU ? ' p1' : v === E.CPU ? ' p2' : '') +
      (highlight.includes(i) ? ' win' : '') +
      (i === answerCell ? ' answer' : '') +
      (i === lastDropped ? ' drop' : '');
    buttons[i].disabled = over || busy || E.lowestRow(board, i % E.COLS) < 0;
  }
  lastDropped = -1;
}

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.className = 'status' + (kind ? ' ' + kind : '');
}

function showResult(kind, text, sub) {
  $('result').hidden = false;
  $('result-img').src = MASCOT[kind];
  $('result-text').textContent = text;
  $('result-sub').textContent = sub || '';
  $('result-sub').hidden = !sub;
}

function drop(c, p) {
  const r = E.lowestRow(board, c);
  board = E.place(board, c, p);
  lastDropped = r * E.COLS + c;
  play('drop');
}

// ---------- Classic: vs computer ----------
const getLevel = mode === 'classic' ? levelSwitch('c4') : () => 'medium';
const getOpp = mode === 'classic' ? opponentSwitch('c4', () => { renderScore(); newGame(); }) : () => 'cpu';
const friend = () => getOpp() === 'friend';
let turn = E.YOU;                       // whose disc drops next (2-player mode: Player 1 = gold, Player 2 = ivory)
let cpuTimer = 0;
let onlineOn = roomInLink && mode === 'classic', ol = null;
const score = store.get('bgs-c4-score', { w: 0, l: 0, d: 0 });
const tally = { w: 0, l: 0, d: 0 };     // 2-player games this visit (not saved)
function renderScore() {
  const s = friend() ? tally : score;
  $('score-you').textContent = s.w + (s.w === 1 ? ' win' : ' wins');
  $('score-cpu').textContent = s.l + (s.l === 1 ? ' win' : ' wins');
  $('score-draws').textContent = String(s.d);
}
// An account's saved progress arrived after sign-in: show it.
onProgressLoaded(() => {
  Object.assign(score, { w: 0, l: 0, d: 0 }, store.get('bgs-c4-score', {}));
  if (mode === 'classic') renderScore();
  else {
    const d = store.get('bgs-daily', null);
    renderStreak(d && (d.lastSolved === today || d.lastSolved === yesterdayKey()) ? d : null);
  }
});
function setTurn(who) {
  $('row-you').classList.toggle('turn-you', who === 'you');
  $('row-cpu').classList.toggle('turn-cpu', who === 'cpu');
}
const saveGame = (toMove) => onlineOn || store.set(SAVE, { board, toMove, mode: getOpp() });
const clearGame = () => store.set(SAVE, null);

function finishClassic(result) {
  over = true;
  clearGame();
  setTurn(null);
  if (onlineOn) {
    // result is from Gold's side; Gold is seat 0
    const mine = result === 'draw' ? 'draw' : (result === 'win') === (ol.mySeat() === 0) ? 'win' : 'lose';
    setStatus(mine === 'win' ? 'You win!' : mine === 'lose' ? 'Your friend wins' : 'It’s a draw', mine === 'lose' ? 'cpu' : 'neutral');
    showResult(mine, mine === 'win' ? 'You win!' : mine === 'lose' ? 'Your friend wins' : 'It’s a draw', mine === 'draw' ? 'The board is full.' : 'Good game.');
    play(mine === 'lose' ? 'lose' : 'win');
    return;
  }
  if (friend()) {
    // result is from Player 1's side
    tally[result === 'win' ? 'w' : result === 'lose' ? 'l' : 'd']++;
    if (result === 'draw') { setStatus('It’s a draw', 'neutral'); showResult('draw', 'It’s a draw', 'The board is full.'); }
    else {
      const winner = result === 'win' ? 'Player 1' : 'Player 2';
      setStatus(winner + ' wins!', result === 'win' ? '' : 'cpu');
      showResult('win', winner + ' wins!', 'Nicely played. Swap who goes first?');
    }
    play(result === 'draw' ? 'draw' : 'win');
    renderScore();
    track('game_end', { game: 'four_in_a_row', result, mode: 'friend' });
    return;
  }
  if (result === 'win') { score.w++; setStatus('You win!'); showResult('win', 'You win!', 'Nicely played.'); }
  if (result === 'lose') { score.l++; setStatus('Computer wins', 'cpu'); showResult('lose', 'Computer wins', 'Have another go?'); }
  if (result === 'draw') { score.d++; setStatus('It’s a draw', 'neutral'); showResult('draw', 'It’s a draw', 'The board is full.'); }
  play(result);
  store.set('bgs-c4-score', score);
  renderScore();
  track('game_end', { game: 'four_in_a_row', result, level: getLevel() });
}
function startComputerTurn() {
  busy = true;
  turn = E.CPU;
  setTurn('cpu');
  setStatus('Computer is thinking…', 'cpu');
  render();
  cpuTimer = setTimeout(computerMove, 550);
}
function computerMove() {
  drop(E.pickComputerMove(board, getLevel()), E.CPU);
  busy = false;
  const cpuLine = E.findLine(board, E.CPU);
  if (cpuLine) { highlight = cpuLine; finishClassic('lose'); }
  else if (E.isFull(board)) finishClassic('draw');
  else { turn = E.YOU; saveGame(E.YOU); setTurn('you'); setStatus('Your turn'); }
  render();
}
const nameOf = (p) => (p === E.YOU ? 'Player 1' : 'Player 2');
function classicMove(c, remote = false) {
  if (!started) { started = true; track('game_start', { game: 'four_in_a_row', mode: 'classic', level: friend() ? 'friend' : getLevel() }); }
  const me = friend() || onlineOn ? turn : E.YOU;
  drop(c, me);
  const line = E.findLine(board, me);
  if (onlineOn && !remote) ol.send(String(c), me === E.YOU ? 1 : 0, !!line || E.isFull(board));
  if (line) { highlight = line; finishClassic(me === E.YOU ? 'win' : 'lose'); render(); return; }
  if (E.isFull(board)) { finishClassic('draw'); render(); return; }
  if (onlineOn) {
    turn = -me;
    setTurn(turn === E.YOU ? 'you' : 'cpu');
    setStatus(ol.myTurn() ? 'Your turn' : 'Waiting for your friend', ol.myTurn() ? '' : 'cpu');
    render();
    return;
  }
  if (friend()) {
    turn = -me;
    saveGame(turn);
    setTurn(turn === E.YOU ? 'you' : 'cpu');
    setStatus(nameOf(turn) + '’s turn', turn === E.CPU ? 'cpu' : '');
    render();
    return;
  }
  saveGame(E.CPU);
  startComputerTurn();
}
function newGame() {
  clearTimeout(cpuTimer);
  board = E.emptyBoard();
  over = false; busy = false; highlight = []; started = false; turn = E.YOU;
  clearGame();
  $('result').hidden = true;
  setTurn('you');
  setStatus(friend() ? 'Player 1’s turn' : 'Your turn');
  render();
}
// Pick up an unfinished game after a refresh or a return visit.
function resumeClassic() {
  const g = store.get(SAVE, null);
  if (!g || !Array.isArray(g.board) || g.board.length !== E.ROWS * E.COLS) return false;
  if (!g.board.some(Boolean) || E.findLine(g.board, E.YOU) || E.findLine(g.board, E.CPU) || E.isFull(g.board)) return false;
  if ((g.mode || 'cpu') !== getOpp()) return false;
  board = g.board;
  over = false; highlight = []; started = true;
  turn = g.toMove === E.CPU ? E.CPU : E.YOU;
  $('result').hidden = true;
  if (friend()) {
    setTurn(turn === E.YOU ? 'you' : 'cpu');
    setStatus(nameOf(turn) + '’s turn', turn === E.CPU ? 'cpu' : '');
    render();
    return true;
  }
  if (g.toMove === E.CPU) { startComputerTurn(); return true; }
  setTurn('you');
  setStatus('Welcome back. Your turn');
  render();
  return true;
}

// ---------- Daily challenge ----------
const today = dateKey();
const puzzle = mode === 'daily' ? E.dailyPuzzle(today) : null;
function renderStreak(d) {
  $('daily-streak').textContent = d && d.streak > 0 ? d.streak + (d.streak === 1 ? ' day' : ' days') : '0 days';
}
function dailyMove(c, restoring) {
  const right = c === puzzle.answer;
  if (restoring) board = E.place(board, c, E.YOU);
  else drop(c, E.YOU);
  over = true;
  if (right) {
    highlight = E.findLine(board, E.YOU) || [];
    setStatus('Solved!');
  } else {
    const r = E.lowestRow(board, puzzle.answer);
    answerCell = r >= 0 ? r * E.COLS + puzzle.answer : -1;
    setStatus('Not this time', 'neutral');
  }
  let d = store.get('bgs-daily', null);
  if (!restoring) {
    const streak = right ? ((d && d.lastSolved === yesterdayKey()) ? d.streak + 1 : 1) : 0;
    d = { date: today, solved: right, col: c, streak, lastSolved: right ? today : (d && d.lastSolved) || null };
    store.set('bgs-daily', d);
    play(right ? 'win' : 'lose', 0.15);
    track('daily_attempt', { game: 'four_in_a_row', solved: right });
  }
  renderStreak(d);
  showResult(right ? 'win' : 'lose',
    right ? 'Solved!' : 'Not quite',
    right ? 'Come back tomorrow for a new one.' : 'The winning move was column ' + (puzzle.answer + 1) + ' (circled). New puzzle at midnight.');
  render();
}

// ---------- Input ----------
function onColumn(c) {
  if (over || busy || E.lowestRow(board, c) < 0) return;
  if (onlineOn && !ol.myTurn()) return;
  if (mode === 'daily') dailyMove(c, false);
  else classicMove(c);
}

// ---------- Start ----------
document.querySelectorAll('[data-mode-link]').forEach((a) => {
  if (a.dataset.modeLink === mode) a.setAttribute('aria-current', 'page');
});
if (mode === 'daily') {
  document.querySelectorAll('#site-nav a').forEach((a) => {
    if (a.getAttribute('href') === '/') a.removeAttribute('aria-current');
    if (a.getAttribute('href') === '/play/four-in-a-row?mode=daily') a.setAttribute('aria-current', 'page');
  });
  document.title = 'Daily Challenge – Four in a Row | BoardGameSite';
  $('classic-panel').hidden = true;
  $('level-box').hidden = true;
  $('daily-panel').hidden = false;
  $('new-game').hidden = true;
  $('board-title').textContent = 'Daily challenge';
  $('board-hint').textContent = 'Gold to move. One move wins — you get one try.';
  board = puzzle.board.slice();
  const saved = store.get('bgs-daily', null);
  renderStreak(saved && (saved.lastSolved === today || saved.lastSolved === yesterdayKey()) ? saved : null);
  if (saved && saved.date === today) dailyMove(saved.col, true);
  else { setStatus('Find the winning move'); render(); }
} else {
  renderScore();
  $('new-game').addEventListener('click', () => { if (!onlineOn) newGame(); });
  $('new-game').classList.add('online-hide');
  ol = online('four-in-a-row', {
    reset: () => newGame(),
    apply: (t) => { const c = Number(t); if (E.lowestRow(board, c) >= 0) classicMove(c, true); },
    seatName: (s) => (s === 0 ? 'Gold (first)' : 'Ivory'),
    over: () => over,
    onlineChanged: (on) => { onlineOn = on; document.body.classList.toggle('online', on); render(); }
  });
  if (roomInLink || !resumeClassic()) newGame();
}
