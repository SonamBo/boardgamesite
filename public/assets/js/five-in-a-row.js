// Five in a Row (Gomoku): take turns placing stones. First to make five in a row, in any direction, wins.
import { store } from './site.js';
import { setStatus, levelSwitch, opponentSwitch, record, showResult } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { online, roomInLink } from './online.js';

const $ = (id) => document.getElementById(id);
const N = 15, SAVE = 'bgs-gomoku-game';
const score = record('gomoku');
const getLevel = levelSwitch('gomoku', () => {});
const getOpp = opponentSwitch('gomoku', () => newGame(), { you: 'You', cpu: 'Computer', p1: 'Gold', p2: 'Ivory' });
const vsCpu = () => getOpp() === 'cpu';
const boardEl = $('gm-board');
const DIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];

let B, turn, over, busy, started, last, winLine, history, onlineOn = roomInLink, ol = null;
const cells = [];
for (let i = 0; i < N * N; i++) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'gm';
  b.addEventListener('click', () => place(i));
  boardEl.appendChild(b);
  cells.push(b);
}
const rc = (i) => [Math.floor(i / N), i % N];
const idx = (r, c) => (r >= 0 && c >= 0 && r < N && c < N ? r * N + c : -1);

function lineAt(b, i, p) {
  const [r, c] = rc(i);
  for (const [dr, dc] of DIRS) {
    const line = [i];
    for (const s of [1, -1]) { let k = 1; while (true) { const j = idx(r + dr * k * s, c + dc * k * s); if (j < 0 || b[j] !== p) break; line.push(j); k++; } }
    if (line.length >= 5) return line;
  }
  return null;
}

// How good a spot is for player p: counts each direction's run and how many open ends it has.
function spotValue(b, i, p) {
  const [r, c] = rc(i);
  let total = 0;
  for (const [dr, dc] of DIRS) {
    let count = 1, open = 0;
    for (const s of [1, -1]) {
      let k = 1;
      while (true) { const j = idx(r + dr * k * s, c + dc * k * s); if (j < 0 || b[j] !== p) { if (j >= 0 && b[j] === 0) open++; break; } count++; k++; }
    }
    if (count >= 5) total += 1e6;
    else if (count === 4) total += open === 2 ? 1e5 : open === 1 ? 1e4 : 0;
    else if (count === 3) total += open === 2 ? 5e3 : open === 1 ? 400 : 0;
    else if (count === 2) total += open === 2 ? 300 : open === 1 ? 40 : 0;
    else total += open * 5;
  }
  return total;
}
function cpuPick(b, p) {
  const lvl = getLevel();
  const cand = [];
  const any = b.some((x) => x);
  for (let i = 0; i < N * N; i++) {
    if (b[i]) continue;
    if (!any) { if (i === idx(7, 7)) cand.push(i); continue; }
    const [r, c] = rc(i);
    let near = false;
    for (let dr = -2; dr <= 2 && !near; dr++) for (let dc = -2; dc <= 2; dc++) { const j = idx(r + dr, c + dc); if (j >= 0 && b[j]) { near = true; break; } }
    if (near) cand.push(i);
  }
  const defendW = lvl === 'easy' ? 0.5 : lvl === 'medium' ? 0.85 : 0.95;
  const noise = lvl === 'easy' ? 3000 : lvl === 'medium' ? 200 : 0;
  let best = cand[0], bv = -Infinity;
  for (const i of cand) {
    const v = spotValue(b, i, p) + spotValue(b, i, 3 - p) * defendW + Math.random() * (noise + 1);
    if (v > bv) { bv = v; best = i; }
  }
  return best;
}

function render() {
  cells.forEach((b, i) => {
    b.className = 'gm' + (B[i] === 1 ? ' p1' : B[i] === 2 ? ' p2' : '') + (i === last ? ' last' : '') + (winLine && winLine.includes(i) ? ' win' : '');
    const [r, c] = rc(i);
    b.setAttribute('aria-label', 'Row ' + (r + 1) + ', column ' + (c + 1) + (B[i] ? (B[i] === 1 ? ', gold stone' : ', ivory stone') : ', empty'));
    b.disabled = over || !!B[i];
  });
  $('row-you').classList.toggle('turn-you', turn === 1 && !over);
  $('row-cpu').classList.toggle('turn-cpu', turn === 2 && !over);
  $('undo').disabled = !history.length || busy || over || onlineOn;
}

function place(i) {
  if (over || busy || B[i] || (onlineOn ? !ol.myTurn() : vsCpu() && turn === 2)) return;
  put(i);
}
function put(i, remote = false) {
  if (!started) { started = true; track('game_start', { game: 'five-in-a-row', opponent: getOpp() }); }
  history.push(i);
  B[i] = turn; last = i;
  play('place');
  const line = lineAt(B, i, turn);
  const full = B.every((x) => x);
  if (onlineOn && !remote) ol.send(String(i), 2 - turn, !!line || full);
  if (line) { winLine = line; return finish(turn); }
  if (full) return finish(0);
  turn = 3 - turn;
  render();
  save();
  if (onlineOn) { setStatus(ol.myTurn() ? 'Your turn' : 'Waiting for your friend', ol.myTurn() ? '' : 'cpu'); return; }
  if (vsCpu() && turn === 2) {
    busy = true; render();
    setStatus('Computer’s turn', 'cpu');
    setTimeout(() => { busy = false; put(cpuPick(B, 2)); }, 450);
  } else setStatus(turnText(), turn === 2 ? 'cpu' : '');
}
const turnText = () => (vsCpu() ? 'Your turn' : (turn === 1 ? 'Gold' : 'Ivory') + '’s turn');

function finish(w) {
  over = true;
  render();
  store.set(SAVE, null);
  if (onlineOn) {
    const kind = !w ? 'draw' : w - 1 === ol.mySeat() ? 'win' : 'lose';
    showResult(kind, kind === 'draw' ? 'It’s a draw' : kind === 'win' ? 'Five in a row! You won' : 'Your friend made five in a row', history.length + ' stones played.');
    setStatus(kind === 'win' ? 'You won!' : kind === 'lose' ? 'You lost' : 'Draw', kind === 'lose' ? 'cpu' : '');
    play(kind === 'win' ? 'win' : 'lose', 0.1);
    return;
  }
  if (!w) { if (vsCpu()) score.add('draw'); showResult('draw', 'It’s a draw', 'The board is full.'); setStatus('Draw', 'neutral'); return; }
  if (vsCpu()) {
    const won = w === 1;
    score.add(won ? 'win' : 'lose');
    showResult(won ? 'win' : 'lose', won ? 'Five in a row! You won' : 'The computer made five in a row', history.length + ' stones played.');
    setStatus(won ? 'You won!' : 'The computer won', won ? '' : 'cpu');
    play(won ? 'win' : 'lose', 0.1);
  } else { showResult('win', (w === 1 ? 'Gold' : 'Ivory') + ' wins!', 'Five in a row.'); setStatus((w === 1 ? 'Gold' : 'Ivory') + ' wins!'); play('win', 0.1); }
  track('game_end', { game: 'five-in-a-row', result: w === 1 ? 'win' : 'lose' });
}

function save() { if (started && !over && !onlineOn) store.set(SAVE, { opp: getOpp(), history }); }
function newGame(moves = []) {
  B = new Array(N * N).fill(0); turn = 1; over = false; busy = false; started = false; last = -1; winLine = null; history = [];
  $('result').hidden = true;
  moves.forEach((i) => { B[i] = turn; turn = 3 - turn; history.push(i); last = i; });
  started = moves.length > 0;
  render();
  setStatus(moves.length ? 'Welcome back. ' + turnText() : turnText() + ': place a stone anywhere', '');
}
$('undo').addEventListener('click', () => {
  if (!history.length || busy || over) return;
  const h = history.slice(0, vsCpu() ? Math.max(0, history.length - 2) : history.length - 1);
  newGame(h); play('card'); save();
});
$('new-game').addEventListener('click', () => { if (!busy && !onlineOn) { store.set(SAVE, null); newGame(); } });
$('new-game').classList.add('online-hide');
$('undo').classList.add('online-hide');
ol = online('five-in-a-row', {
  reset: () => newGame(),
  apply: (t) => { const i = Number(t); if (B[i] === 0) put(i, true); },
  seatName: (s) => (s === 0 ? 'Gold (first)' : 'Ivory'),
  over: () => over,
  onlineChanged: (on) => { onlineOn = on; document.body.classList.toggle('online', on); render(); }
});
$('again').addEventListener('click', () => newGame());
window.addEventListener('pagehide', save);
const g = roomInLink ? null : store.get(SAVE, null);
if (g && g.opp === getOpp() && Array.isArray(g.history) && g.history.length) newGame(g.history); else newGame();
