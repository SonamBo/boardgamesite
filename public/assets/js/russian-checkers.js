// Russian Checkers page. Same board and controls as the Checkers page (checkers.js), with the shashki rules
// from russian-checkers-engine.js: flying kings, men capturing backwards, and the Russian draw rules.
import * as E from './russian-checkers-engine.js';
import { setStatus, showResult, hideResult, setTurn, levelSwitch, record, opponentSwitch, sideSwitch, animationSwitch, moveQueue, slide, fadeOut, showCaptures, hintButton, moveHistory, askResume, modeName } from './game-ui.js';
import { track } from './firebase.js';
import { store } from './site.js';
import { play } from './sound.js';
import { online, roomInLink } from './online.js';
import { ladder } from './ladder.js';
import { offerReview, hideReview } from './review.js';

const GAME = 'russian-checkers';

// every move this game, for the post-game review (squares named a1–h8, gold moves up from rank 1)
let gameLog = [];
const SQ = (i) => 'abcdefgh'[i % 8] + (8 - Math.floor(i / 8));
const logMove = (b, side, m) => gameLog.push({ position: b.slice(), side, move: m.path.map(SQ).join('-') });

const SAVE = 'bgs-rck-game';

const boardEl = document.getElementById('board');
const undoBtn = document.getElementById('undo');
const FILES = 'abcdefgh';
const CROWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18h18l-1.6-10.5-4.6 4.2L12 4.5 9.2 11.7 4.6 7.5z"/></svg>';
// Russian draw rules: 15 moves each (30 half-moves) with only kings moving and nothing captured,
// or the same position three times with the same player to move.
const DRAW_AFTER = 30;
const REPEATS = 3;

// Rated practice-ladder game (?bot=…): fixed level, no level changes. Null for an ordinary game.
const L = ladder(GAME, { resign: () => { if (!over && started) { clearTimeout(cpuTimer); busy = false; finish('lose', true); } }, again: () => newGame() });
const cpuName = L ? L.bot.name : 'Computer';
const getLevel = L ? () => L.level : levelSwitch('rck');
const rec = record('rck');
const getOpp = L ? () => 'cpu' : opponentSwitch('rck', () => newGame());
const friend = () => getOpp() === 'friend';
// Against the computer you play white (gold, moves first) or black. Playing black turns the board round.
const getSide = L ? () => 'white' : sideSwitch('rck', ['white', 'black'], () => newGame());
let me = E.YOU;   // the side the person plays against the computer in this game
animationSwitch();
const Q = moveQueue();   // moves animate one at a time
// Moves so far, and a replay at the end: view is the position being replayed (null: the game itself)
let view = null;
const sqIndex = (n) => (8 - Number(n.slice(1))) * 8 + 'abcdefgh'.indexOf(n[0]);
const hist = moveHistory({
  show: (k) => { view = k == null ? null : { board: gameLog[k].position, lastPath: k ? gameLog[k - 1].move.split('-').map(sqIndex) : null }; render(); }
});
// Show hint: Easy, against the computer
const hint = hintButton({
  shown: () => !L && !friend() && !onlineOn && getLevel() === 'easy',
  find: () => {
    if (!playerMoves().length) return null;
    const m = E.pickComputerMove(board, 'medium', Math.random, me);
    return m ? m.path.map((i) => cells[i]) : null;
  }
});

// turn: whose move it is (E.YOU = gold at the bottom, E.CPU = black at the top; in 2-player mode, Player 1 and Player 2)
// seen: how often each position has come up since the last capture or man move (for the repetition draw)
let board, over, busy, partial, lastPath, quiet, started, turn, seen, drawWhy;
let cpuTimer = 0;
// positions before each move, for Undo (vs the computer it takes back your move and its reply)
let history = [];
const snapshot = () => history.push({ board: board.slice(), turn, quiet, lastPath, log: gameLog.length, seen: { ...seen } });
let onlineOn = roomInLink && !L, ol = null;
// a move as one character per square (keeps online moves short)
const ALPH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const token = (m) => m.path.map((i) => ALPH[i]).join('');
const nameOf = (side) => (side === E.YOU ? 'Player 1' : 'Player 2');
const markTurn = () => setTurn(turn === E.YOU ? 'you' : 'cpu');
const posKey = (b, side) => b.join('') + side;
// The players card names the white (gold) and black rows for this game; the board turns round when you play black.
function paintSides() {
  const vsCpu = !friend() && !onlineOn;
  const white = document.querySelector('[data-name="p1"]'), black = document.querySelector('[data-name="p2"]');
  if (vsCpu) { white.textContent = me === E.YOU ? 'You' : cpuName; black.textContent = me === E.YOU ? cpuName : 'You'; }
  boardEl.classList.toggle('flipped', onlineOn ? !!ol && ol.mySeat() === 1 : vsCpu && me === E.CPU);
  boardEl.setAttribute('aria-label', 'Russian Checkers board. ' + (vsCpu ? 'You play ' + (me === E.YOU ? 'white (gold)' : 'black') + ' from the bottom.' : 'White (gold) starts at the bottom.'));
}

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
  if (over || busy || Q.busy()) return [];
  if (onlineOn) return ol.myTurn() ? E.legalMoves(board, turn) : [];
  if (!friend() && turn !== me) return [];
  return E.legalMoves(board, turn);
}

function render() {
  const shown = view ? view.board : board, shownPath = view ? view.lastPath : lastPath;
  const moves = playerMoves();
  const matching = moves.filter((m) => partial.every((p, k) => m.path[k] === p));
  const pickable = new Set(partial.length <= 1 ? moves.map((m) => m.path[0]) : []);
  const targets = new Set(partial.length ? matching.map((m) => m.path[partial.length]).filter((x) => x !== undefined) : []);
  const mustCapture = moves.length && moves[0].caps.length > 0;
  // pieces already jumped in the capture being entered (they stay on the board until it ends)
  const jumped = new Set();
  if (partial.length > 1 && matching.length) matching[0].caps.slice(0, partial.length - 1).forEach((x) => jumped.add(x));

  for (let i = 0; i < 64; i++) {
    if (!E.isDark(i)) continue;
    const p = shown[i];
    const btn = cells[i];
    btn.classList.toggle('last', !!shownPath && shownPath.includes(i));
    btn.classList.toggle('sel', partial.includes(i));
    btn.classList.toggle('can', pickable.has(i) || targets.has(i));
    btn.classList.toggle('must', mustCapture && !partial.length && pickable.has(i));
    let html = '';
    if (p) html = '<span class="piece ' + (p > 0 ? 'you' : 'cpu') + '"' + (jumped.has(i) ? ' style="opacity: .45"' : '') + '>' + (Math.abs(p) === 2 ? CROWN : '') + '</span>';
    else if (targets.has(i)) html = '<span class="hint-dot"></span>';
    if (btn.innerHTML !== html) btn.innerHTML = html;
    const who = friend() ? (p > 0 ? 'gold ' : p < 0 ? 'black ' : '') : (p * me > 0 ? 'your ' : p ? 'computer ' : '');
    const what = p ? who + (Math.abs(p) === 2 ? 'king' : 'piece') + (jumped.has(i) ? ', captured' : '') : (targets.has(i) ? 'move here' : 'empty');
    btn.setAttribute('aria-label', squareName(i) + ', ' + what);
    btn.disabled = !(pickable.has(i) || targets.has(i));
  }
  // Undo: vs the computer only once you've moved (it may have opened the game)
  undoBtn.disabled = busy || over || onlineOn || !(friend() ? history.length : history.some((h) => h.turn === me));
  const n = E.countPieces(shown);
  hist.set(gameLog.map((e) => e.move));
  document.getElementById('count-you').textContent = n.you + (n.you === 1 ? ' piece' : ' pieces');
  document.getElementById('count-cpu').textContent = n.cpu + (n.cpu === 1 ? ' piece' : ' pieces');
  // what each side has taken (both start with 12)
  showCaptures(document.getElementById('cap-you'), 12 - n.cpu, 'ck-black', 'Pieces gold has taken');
  showCaptures(document.getElementById('cap-cpu'), 12 - n.you, 'ck-gold', 'Pieces black has taken');
  if (!over && !busy) {
    const whose = friend() ? nameOf(turn) + '’s turn' : 'Your turn';
    setStatus(partial.length > 1 ? 'Keep capturing' : mustCapture ? whose + ': you must capture' : whose, friend() && turn === E.CPU ? 'cpu' : '');
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

// Before the move is applied: count king-only moves, and start the repetition count again after
// anything that can't be undone (a capture or a man moving).
function noteQuiet(m) {
  const wasKing = Math.abs(board[m.path[0]]) === 2;
  quiet = m.caps.length || !wasKing ? 0 : quiet + 1;
  if (!quiet) seen = {};
}
// After the move: is it a draw now?
function drawNow(next) {
  const k = posKey(board, next);
  seen[k] = (seen[k] || 0) + 1;
  if (seen[k] >= REPEATS) { drawWhy = 'The same position came up three times.'; return true; }
  if (quiet >= DRAW_AFTER) { drawWhy = '15 moves each with only kings moving and nothing captured.'; return true; }
  return false;
}

function moveSound(m) {
  play(m.caps.length ? 'capture' : 'move');
  if (E.crowns(board, m)) play('king', 0.2);
}

const saveGame = (toMove) => onlineOn || L || store.set(SAVE, { board, quiet, seen, toMove, lastPath, mode: getOpp(), me });
const clearGame = () => store.set(SAVE, null);

function finish(result, resigned = false) {
  over = true;
  if (!friend() && !onlineOn) offerReview(() => ({ game: GAME, board: GAME, plies: gameLog, me, final: board.slice() }));
  clearGame();
  setTurn(null);
  const drawSub = drawWhy || 'Neither side can make progress.';
  if (onlineOn) {
    // result is from Gold's side; Gold is seat 0
    const mine = result === 'draw' ? 'draw' : (result === 'win') === (ol.mySeat() === 0) ? 'win' : 'lose';
    play(mine === 'lose' ? 'lose' : 'win', 0.25);
    setStatus(mine === 'win' ? 'You win!' : mine === 'lose' ? 'Your friend wins' : 'It’s a draw', mine === 'lose' ? 'cpu' : 'neutral');
    showResult(mine, mine === 'win' ? 'You win!' : mine === 'lose' ? 'Your friend wins' : 'It’s a draw', mine === 'draw' ? drawSub : 'Good game.');
    render(); hist.end();
    return;
  }
  if (friend()) {
    // result is from Player 1's side
    play(result === 'draw' ? 'draw' : 'win', 0.25);
    if (result === 'draw') { setStatus('It’s a draw', 'neutral'); showResult('draw', 'It’s a draw', drawSub); }
    else {
      const winner = result === 'win' ? 'Player 1' : 'Player 2';
      setStatus(winner + ' wins!', result === 'win' ? '' : 'cpu');
      showResult('win', winner + ' wins!', 'Nicely played. New game?');
    }
    track('game_end', { game: GAME, result, mode: 'friend' });
    render(); hist.end();
    return;
  }
  play(result, 0.25);
  L?.finish(result);
  if (result === 'win') { setStatus('You win!'); showResult('win', 'You win!', 'Nicely played.'); }
  if (result === 'lose') { setStatus(resigned ? 'You resigned' : cpuName + ' wins', 'cpu'); showResult('lose', resigned ? 'You resigned' : cpuName + ' wins', 'Have another go?'); }
  if (result === 'draw') { setStatus('It’s a draw', 'neutral'); showResult('draw', 'It’s a draw', drawSub); }
  rec.add(result);
  track('game_end', { game: GAME, result, level: getLevel() });
  render(); hist.end();
}

// Slide the piece hop by hop, longer hops (a flying king) taking longer, and fade the captured pieces.
function showMove(m) {
  const step = 190;
  const weights = m.path.slice(1).map((to, k) => 0.55 + 0.45 * Math.abs((to >> 3) - (m.path[k] >> 3)));
  const total = weights.reduce((a, b) => a + b, 0);
  const jobs = [slide(cells[m.path[0]].querySelector('.piece'), m.path.slice(1).map((i) => cells[i]), step, weights)];
  // Turkish strike: the captured pieces come off together at the end of the move
  m.caps.forEach((c) => jobs.push(fadeOut(cells[c].querySelector('.piece'), 220, step * total)));
  return Promise.all(jobs);
}
function playerMove(m, remote = false) {
  partial = [];
  Q.run(() => showMove(m), () => makePlayerMove(m, remote));
}
function makePlayerMove(m, remote) {
  snapshot();
  logMove(board, turn, m);
  if (!started) { started = true; track('game_start', { game: GAME, level: friend() ? 'friend' : getLevel() }); L?.start(); }
  noteQuiet(m);
  moveSound(m);
  board = E.applyMove(board, m);
  lastPath = m.path;
  partial = [];
  const next = -turn;
  const stuck = !E.legalMoves(board, next).length;
  const draw = !stuck && drawNow(next);
  if (onlineOn && !remote) ol.send(token(m), next === E.YOU ? 0 : 1, stuck || draw);
  // the result is from white's side in 2-player and online games, and from yours against the computer
  if (stuck) return finish(turn === (friend() || onlineOn ? E.YOU : me) ? 'win' : 'lose');
  if (draw) return finish('draw');
  turn = next;
  saveGame(turn);
  if (onlineOn) { markTurn(); render(); setStatus(ol.myTurn() ? 'Your move' : 'Waiting for your friend', ol.myTurn() ? '' : 'cpu'); return; }
  if (friend()) { markTurn(); render(); return; }
  startComputerTurn();
}

function startComputerTurn() {
  turn = -me;
  busy = true;
  markTurn();
  setStatus(cpuName + ' is thinking…', 'cpu');
  render();
  cpuTimer = setTimeout(computerMove, 450);
}

function computerMove() {
  const m = E.pickComputerMove(board, getLevel(), Math.random, -me);
  if (!m) { busy = false; return finish('win'); }
  Q.run(() => showMove(m), () => { busy = false; makeComputerMove(m); });
}
function makeComputerMove(m) {
  snapshot();
  logMove(board, -me, m);
  noteQuiet(m);
  moveSound(m);
  board = E.applyMove(board, m);
  lastPath = m.path;
  if (!E.legalMoves(board, me).length) return finish('lose');
  if (drawNow(me)) return finish('draw');
  turn = me;
  saveGame(me);
  markTurn();
  render();
}

function newGame() {
  Q.reset();
  view = null; hist.reset();
  hint.reset();
  L?.newGame();
  gameLog = []; history = []; hideReview();
  board = E.startBoard();
  over = false; busy = false; partial = []; lastPath = null; quiet = 0; seen = {}; drawWhy = ''; started = false; turn = E.YOU;   // white moves first
  me = getSide() === 'black' ? E.CPU : E.YOU;
  clearTimeout(cpuTimer);
  clearGame();
  hideResult();
  paintSides();
  if (!friend() && !onlineOn && me !== E.YOU) { startComputerTurn(); return; }
  setTurn('you');
  render();
}

// Pick up an unfinished game after a refresh or a return visit.
function resume() {
  Q.reset();
  view = null; hist.reset();
  const g = store.get(SAVE, null);
  if (L || !g || !Array.isArray(g.board) || g.board.length !== 64) return false;
  if ((g.mode || 'cpu') !== getOpp()) return false;
  // a game against the computer reopens only with the side it was played with
  if (getOpp() === 'cpu' && (g.me === E.CPU ? 'black' : 'white') !== getSide()) return false;
  me = g.me === E.CPU ? E.CPU : E.YOU;
  if (!E.legalMoves(g.board, E.YOU).length || !E.legalMoves(g.board, E.CPU).length) return false;
  board = g.board;
  quiet = g.quiet | 0;
  seen = g.seen && typeof g.seen === 'object' ? g.seen : {};
  drawWhy = '';
  lastPath = Array.isArray(g.lastPath) ? g.lastPath : null;
  over = false; busy = false; partial = []; started = true;
  turn = g.toMove === E.CPU ? E.CPU : E.YOU;
  hideResult();
  paintSides();
  markTurn();
  busy = true; render();   // the saved game shows behind the question
  askResume(modeName(friend(), getLevel(), friend() ? '' : 'you play ' + (me === E.YOU ? 'white (gold)' : 'black'))).then((ok) => {
    busy = false;
    if (!ok) return newGame();
    if (turn !== me && !friend()) return startComputerTurn();
    render();
  });
  return true;
}

document.getElementById('new-game').addEventListener('click', () => { if (!onlineOn) newGame(); });
undoBtn.addEventListener('click', () => {
  // a rated (ladder) game has no take-backs: Undo is hidden there, and does nothing if reached anyway
  if (busy || over || onlineOn || L || !history.length || Q.busy()) return;
  // vs the computer, take back your move and its reply
  let h = history.pop();
  while (!friend() && h.turn !== me && history.length) h = history.pop();
  if (!friend() && h.turn !== me) { history.push(h); return; }
  board = h.board; turn = h.turn; quiet = h.quiet; lastPath = h.lastPath; seen = { ...h.seen };
  gameLog.length = h.log;
  partial = [];
  play('card');
  saveGame(turn);
  markTurn();
  render();
});
undoBtn.classList.add('online-hide');
document.getElementById('new-game').classList.add('online-hide');
ol = online(GAME, {
  reset: () => newGame(),
  // an online move waits for any move still animating, then is found on the board as it is then
  apply: (t) => Q.run(async () => { const m = E.legalMoves(board, turn).find((x) => token(x) === t); if (!m) return false; await showMove(m); return m; }, (m) => makePlayerMove(m, true)),
  seatName: (s) => (s === 0 ? 'Gold (bottom, first)' : 'Black'),
  over: () => over,
  onlineChanged: (on) => { onlineOn = on; document.body.classList.toggle('online', on); paintSides(); render(); }
});
if (roomInLink || !resume()) newGame();
