// Four in a Row page: vs-computer mode and the daily challenge.
import * as E from './c4-engine.js';
import { store, dateKey, yesterdayKey } from './site.js';
import { track } from './firebase.js';

const $ = (id) => document.getElementById(id);
const boardEl = $('board');
const statusEl = $('status');
const mode = (new URLSearchParams(location.search).get('mode') === 'daily' || location.hash === '#daily') ? 'daily' : 'classic';
window.addEventListener('hashchange', () => location.reload());

const MASCOT = {
  win: '/assets/img/mascot-trophy.webp',
  lose: '/assets/img/mascot-confused.webp',
  draw: '/assets/img/mascot-wave.webp'
};

let board = E.emptyBoard();
let busy = false;        // computer thinking or animation running
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
}

// ---------- Classic: vs computer ----------
const score = store.get('bgs-c4-score', { w: 0, l: 0, d: 0 });
function renderScore() {
  $('score-you').textContent = score.w + (score.w === 1 ? ' win' : ' wins');
  $('score-cpu').textContent = score.l + (score.l === 1 ? ' win' : ' wins');
  $('score-draws').textContent = String(score.d);
}
function setTurn(who) {
  $('row-you').classList.toggle('turn-you', who === 'you');
  $('row-cpu').classList.toggle('turn-cpu', who === 'cpu');
}
function finishClassic(result) {
  over = true;
  setTurn(null);
  if (result === 'win') { score.w++; setStatus('You win!'); showResult('win', 'You win!', 'Nicely played.'); }
  if (result === 'lose') { score.l++; setStatus('Computer wins', 'cpu'); showResult('lose', 'Computer wins', 'Have another go?'); }
  if (result === 'draw') { score.d++; setStatus('It’s a draw', 'neutral'); showResult('draw', 'It’s a draw', 'The board is full.'); }
  store.set('bgs-c4-score', score);
  renderScore();
  track('game_end', { game: 'four_in_a_row', result });
}
function classicMove(c) {
  if (!started) { started = true; track('game_start', { game: 'four_in_a_row', mode: 'classic' }); }
  drop(c, E.YOU);
  const line = E.findLine(board, E.YOU);
  if (line) { highlight = line; finishClassic('win'); render(); return; }
  if (E.isFull(board)) { finishClassic('draw'); render(); return; }
  busy = true;
  setTurn('cpu');
  setStatus('Computer is thinking…', 'cpu');
  render();
  setTimeout(() => {
    drop(E.pickComputerMove(board), E.CPU);
    busy = false;
    const cpuLine = E.findLine(board, E.CPU);
    if (cpuLine) { highlight = cpuLine; finishClassic('lose'); }
    else if (E.isFull(board)) finishClassic('draw');
    else { setTurn('you'); setStatus('Your turn'); }
    render();
  }, 550);
}
function newGame() {
  board = E.emptyBoard();
  over = false; busy = false; highlight = []; started = false;
  $('result').hidden = true;
  setTurn('you');
  setStatus('Your turn');
  render();
}

// ---------- Daily challenge ----------
const today = dateKey();
const puzzle = mode === 'daily' ? E.dailyPuzzle(today) : null;
function renderStreak(d) {
  $('daily-streak').textContent = d && d.streak > 0 ? d.streak + (d.streak === 1 ? ' day' : ' days') : '0 days';
}
function dailyMove(c, restoring) {
  const right = c === puzzle.answer;
  drop(c, E.YOU);
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
  $('new-game').addEventListener('click', newGame);
  newGame();
}
