// Checkers page.
import * as E from './checkers-engine.js';
import { setStatus, showResult, hideResult, setTurn, levelSwitch, record, opponentSwitch, sideSwitch, animationSwitch, moveQueue, slide, fadeOut, showCaptures, hintButton, moveHistory, askResume, modeName } from './game-ui.js';
import { track } from './firebase.js';
import { store } from './site.js';
import { play } from './sound.js';
import { online, roomInLink } from './online.js';
import { ladder } from './ladder.js';
import { offerReview, hideReview } from './review.js';

// every move this game, for the post-game review (squares named a1–h8, gold moves up from rank 1)
let gameLog = [];
const SQ = (i) => 'abcdefgh'[i % 8] + (8 - Math.floor(i / 8));
const logMove = (b, side, m) => gameLog.push({ position: b.slice(), side, move: m.path.map(SQ).join('-') });

const SAVE = 'bgs-ck-game';

const boardEl = document.getElementById('board');
const undoBtn = document.getElementById('undo');
const FILES = 'abcdefgh';
const CROWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18h18l-1.6-10.5-4.6 4.2L12 4.5 9.2 11.7 4.6 7.5z"/></svg>';
const DRAW_AFTER = 80;   // half-moves of kings shuffling with no capture

// Rated practice-ladder game (?bot=…): fixed level, no level changes. Null for an ordinary game.
const L = ladder('checkers', { resign: () => { if (!over && started) { clearTimeout(cpuTimer); busy = false; finish('lose', true); } }, again: () => newGame() });
const cpuName = L ? L.bot.name : 'Computer';
const getLevel = L ? () => L.level : levelSwitch('ck');
const rec = record('ck');
const getOpp = L ? () => 'cpu' : opponentSwitch('ck', () => newGame(), { p1: 'Gold', p2: 'Black' });
const friend = () => getOpp() === 'friend';
// Against the computer you play gold or black (black moves first). Playing black turns the board round.
const getSide = L ? () => 'gold' : sideSwitch('ck', ['gold', 'black'], () => newGame());
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

// turn: whose move it is (E.YOU = gold, which starts at the bottom, E.CPU = black at the top). Black moves first, as in the American rules.
let board, over, busy, partial, lastPath, quiet, started, turn;
let cpuTimer = 0;
// positions before each move, for Undo (vs the computer it takes back your move and its reply)
let history = [];
const snapshot = () => history.push({ board: board.slice(), turn, quiet, lastPath, log: gameLog.length });
let onlineOn = roomInLink && !L, ol = null;
// a move as one character per square (keeps online moves short)
const ALPH = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const token = (m) => m.path.map((i) => ALPH[i]).join('');
const nameOf = (side) => (side === E.YOU ? 'Gold' : 'Black');
const markTurn = () => setTurn(turn === E.YOU ? 'you' : 'cpu');
// The gold row and the black row of the players card, named for this game; the board turns round when you play black.
function paintSides() {
  const vsCpu = !friend() && !onlineOn;
  const gold = document.querySelector('[data-name="p1"]'), black = document.querySelector('[data-name="p2"]');
  if (vsCpu) { gold.textContent = me === E.YOU ? 'You' : cpuName; black.textContent = me === E.YOU ? cpuName : 'You'; }
  boardEl.classList.toggle('flipped', onlineOn ? !!ol && ol.mySeat() === 0 : vsCpu && me === E.CPU);
  boardEl.setAttribute('aria-label', 'Checkers board. ' + (vsCpu ? 'You play ' + (me === E.YOU ? 'gold' : 'black') + ' from the bottom.' : 'Gold starts at the bottom.'));
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

  for (let i = 0; i < 64; i++) {
    if (!E.isDark(i)) continue;
    const p = shown[i];
    const btn = cells[i];
    btn.classList.toggle('last', !!shownPath && shownPath.includes(i));
    btn.classList.toggle('sel', partial.includes(i));
    btn.classList.toggle('can', pickable.has(i) || targets.has(i));
    btn.classList.toggle('must', mustCapture && !partial.length && pickable.has(i));
    let html = '';
    if (p) html = '<span class="piece ' + (p > 0 ? 'you' : 'cpu') + '">' + (Math.abs(p) === 2 ? CROWN : '') + '</span>';
    else if (targets.has(i)) html = '<span class="hint-dot"></span>';
    if (btn.innerHTML !== html) btn.innerHTML = html;
    const who = friend() ? (p > 0 ? 'gold ' : p < 0 ? 'black ' : '') : (p * me > 0 ? 'your ' : p ? 'computer ' : '');
    const what = p ? who + (Math.abs(p) === 2 ? 'king' : 'piece') : (targets.has(i) ? 'move here' : 'empty');
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
    setStatus(partial.length > 1 ? 'Keep jumping' : mustCapture ? whose + ': you must capture' : whose, friend() && turn === E.CPU ? 'cpu' : '');
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

function noteQuiet(m) {
  const wasKing = Math.abs(board[m.path[0]]) === 2;
  quiet = m.caps.length || !wasKing ? 0 : quiet + 1;
}

function moveSound(m) {
  const p = board[m.path[0]];
  const row = m.path[m.path.length - 1] >> 3;
  play(m.caps.length ? 'capture' : 'move');
  if ((p === 1 && row === 0) || (p === -1 && row === 7)) play('king', 0.2);
}

const saveGame = (toMove) => onlineOn || L || store.set(SAVE, { board, quiet, toMove, lastPath, mode: getOpp(), me });
const clearGame = () => store.set(SAVE, null);

function finish(result, resigned = false) {
  over = true;
  if (!friend() && !onlineOn) offerReview(() => ({ game: 'checkers', board: 'checkers', plies: gameLog, me, final: board.slice() }));
  clearGame();
  setTurn(null);
  if (onlineOn) {
    // result is from Gold's side; Gold is seat 1 (Black moves first, so Black is seat 0)
    const mine = result === 'draw' ? 'draw' : (result === 'win') === (ol.mySeat() === 1) ? 'win' : 'lose';
    play(mine === 'lose' ? 'lose' : 'win', 0.25);
    setStatus(mine === 'win' ? 'You win!' : mine === 'lose' ? 'Your friend wins' : 'It’s a draw', mine === 'lose' ? 'cpu' : 'neutral');
    showResult(mine, mine === 'win' ? 'You win!' : mine === 'lose' ? 'Your friend wins' : 'It’s a draw', mine === 'draw' ? 'No captures for a long while.' : 'Good game.');
    render(); hist.end();
    return;
  }
  if (friend()) {
    // result is from Gold's side
    play(result === 'draw' ? 'draw' : 'win', 0.25);
    if (result === 'draw') { setStatus('It’s a draw', 'neutral'); showResult('draw', 'It’s a draw', 'No captures for a long while.'); }
    else {
      const winner = nameOf(result === 'win' ? E.YOU : E.CPU);
      setStatus(winner + ' wins!', result === 'win' ? '' : 'cpu');
      showResult('win', winner + ' wins!', 'Nicely played. New game?');
    }
    track('game_end', { game: 'checkers', result, mode: 'friend' });
    render(); hist.end();
    return;
  }
  play(result, 0.25);
  L?.finish(result);
  if (result === 'win') { setStatus('You win!'); showResult('win', 'You win!', 'Nicely played.'); }
  if (result === 'lose') { setStatus(resigned ? 'You resigned' : cpuName + ' wins', 'cpu'); showResult('lose', resigned ? 'You resigned' : cpuName + ' wins', 'Have another go?'); }
  if (result === 'draw') { setStatus('It’s a draw', 'neutral'); showResult('draw', 'It’s a draw', 'No captures for a long while.'); }
  rec.add(result);
  track('game_end', { game: 'checkers', result, level: getLevel() });
  render(); hist.end();
}

// Slide the piece hop by hop, longer hops (a flying king) taking longer, and fade the captured pieces.
function showMove(m) {
  const step = 190;
  const weights = m.path.slice(1).map((to, k) => 0.55 + 0.45 * Math.abs((to >> 3) - (m.path[k] >> 3)));
  const total = weights.reduce((a, b) => a + b, 0);
  const jobs = [slide(cells[m.path[0]].querySelector('.piece'), m.path.slice(1).map((i) => cells[i]), step, weights)];
  // each captured piece comes off as it's jumped
  let t = 0;
  m.caps.forEach((c, k) => { t += weights[k]; jobs.push(fadeOut(cells[c].querySelector('.piece'), 200, step * t - 60)); });
  return Promise.all(jobs);
}
function playerMove(m, remote = false) {
  partial = [];
  Q.run(() => showMove(m), () => makePlayerMove(m, remote));
}
function makePlayerMove(m, remote) {
  snapshot();
  logMove(board, turn, m);
  if (!started) { started = true; track('game_start', { game: 'checkers', level: friend() ? 'friend' : getLevel() }); L?.start(); }
  noteQuiet(m);
  moveSound(m);
  board = E.applyMove(board, m);
  lastPath = m.path;
  partial = [];
  const next = -turn;
  const ends = !E.legalMoves(board, next).length || quiet >= DRAW_AFTER;
  if (onlineOn && !remote) ol.send(token(m), next === E.CPU ? 0 : 1, ends);
  // the result is from gold's side in 2-player and online games, and from yours against the computer
  if (!E.legalMoves(board, next).length) return finish(turn === (friend() || onlineOn ? E.YOU : me) ? 'win' : 'lose');
  if (quiet >= DRAW_AFTER) return finish('draw');
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
  if (quiet >= DRAW_AFTER) return finish('draw');
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
  over = false; busy = false; partial = []; lastPath = null; quiet = 0; started = false; turn = E.CPU;   // Black moves first
  me = getSide() === 'black' ? E.CPU : E.YOU;
  clearTimeout(cpuTimer);
  clearGame();
  hideResult();
  paintSides();
  if (!friend() && !onlineOn && me !== E.CPU) { startComputerTurn(); return; }
  markTurn();
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
  if (getOpp() === 'cpu' && (g.me === E.CPU ? 'black' : 'gold') !== getSide()) return false;
  me = g.me === E.CPU ? E.CPU : E.YOU;
  if (!E.legalMoves(g.board, E.YOU).length || !E.legalMoves(g.board, E.CPU).length) return false;
  board = g.board;
  quiet = g.quiet | 0;
  lastPath = Array.isArray(g.lastPath) ? g.lastPath : null;
  over = false; busy = false; partial = []; started = true;
  turn = g.toMove === E.CPU ? E.CPU : E.YOU;
  hideResult();
  paintSides();
  markTurn();
  busy = true; render();   // the saved game shows behind the question
  askResume(modeName(friend(), getLevel(), friend() ? '' : 'you play ' + (me === E.YOU ? 'gold' : 'black'))).then((ok) => {
    busy = false;
    if (!ok) return newGame();
    if (turn !== me && !friend()) return startComputerTurn();
    render();
  });
  return true;
}

document.getElementById('new-game').addEventListener('click', () => { if (!onlineOn) newGame(); });
undoBtn.addEventListener('click', () => {
  if (busy || over || onlineOn || !history.length || Q.busy()) return;
  // vs the computer, take back your move and its reply
  let h = history.pop();
  while (!friend() && h.turn !== me && history.length) h = history.pop();
  if (!friend() && h.turn !== me) { history.push(h); return; }
  board = h.board; turn = h.turn; quiet = h.quiet; lastPath = h.lastPath;
  gameLog.length = h.log;
  partial = [];
  play('card');
  saveGame(turn);
  markTurn();
  render();
});
undoBtn.classList.add('online-hide');
document.getElementById('new-game').classList.add('online-hide');
ol = online('checkers', {
  reset: () => newGame(),
  // an online move waits for any move still animating, then is found on the board as it is then
  apply: (t) => Q.run(async () => { const m = E.legalMoves(board, turn).find((x) => token(x) === t); if (!m) return false; await showMove(m); return m; }, (m) => makePlayerMove(m, true)),
  seatName: (s) => (s === 0 ? 'Black (moves first)' : 'Gold'),
  over: () => over,
  onlineChanged: (on) => { onlineOn = on; document.body.classList.toggle('online', on); paintSides(); render(); }
});
if (roomInLink || !resume()) newGame();
