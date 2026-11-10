// Mancala (Kalah rules): sow seeds round the board, land in your store for another turn, capture from empty pits.
// pits[0..5] yours (left to right), [6] your store, [7..12] the opponent's (right to left along the top), [13] their store.
import { store } from './site.js';
import { setStatus, levelSwitch, opponentSwitch, record, showResult, sideSwitch, movesFirst, animationSwitch, animMs, slide, stopAnimations, hintButton, askResume, modeName } from './game-ui.js';
import { ladder } from './ladder.js';
import { online, roomInLink } from './online.js';
import { offerReview, hideReview } from './review.js';

// every move this game, for the post-game review (pits '1'–'6' along the bottom, 't1'–'t6' along the top)
let gameLog = [];
import { track } from './firebase.js';
import { play } from './sound.js';
import { shake } from './solo.js';
import { wait } from './dice-ui.js';
import { STORE, own, sow, moves, ended, pick } from './mancala-rules.js';

export { sow };

const $ = (id) => document.getElementById(id);
const undoBtn = $('undo');
const SAVE = 'bgs-mancala-game';
const score = record('mancala');
// Rated practice-ladder game (?bot=…): fixed level. Null for an ordinary game.
const L = ladder('mancala', { resign: () => { if (!over && started) finish(true); }, again: () => newGame() });
const cpuName = L ? L.bot.name : 'Computer';
const getLevel = L ? () => L.level : levelSwitch('mancala', () => {});
const getOpp = L ? () => 'cpu' : opponentSwitch('mancala', () => newGame(), { you: 'You', cpu: 'Computer', p1: 'Player 1', p2: 'Player 2' });
let onlineOn = roomInLink && !L, ol = null;
const vsCpu = () => !onlineOn && getOpp() === 'cpu';
const mySide = () => (onlineOn ? ol.mySeat() : 0);   // the side whose pits are along the bottom
// Against the computer you move first, second or either at random. Your pits stay along the bottom.
const getSide = L ? () => 'first' : sideSwitch('mancala', ['first', 'second', 'random'], () => newGame());
let gameNo = 0;   // a computer move still waiting when a new game starts is dropped
animationSwitch();
// Show hint: Easy, against the computer
const hint = hintButton({
  shown: () => !L && vsCpu() && getLevel() === 'easy',
  find: () => {
    if (!humanCanMove()) return null;
    return [pitEls.find((el) => Number(el.dataset.i) === pick(B, 0, 'hard'))];
  }
});

let B, turn, over, busy, started, lastPit;
let sown = -1;   // the pit the last move was sown from (lastPit: where its last seed landed)
// positions before each move, for Undo (vs the computer it takes back your move and its replies)
let history = [];
// online: moves from your friend wait here while a move is still being sown
const pending = [];
function cpuPick(b, p) { return pick(b, p, getLevel()); }

// ---------- Drawing ----------
const pitEls = [...document.querySelectorAll('.mc-pit')];
function seedsHtml(n) {
  let h = '';
  const shown = Math.min(n, 18);
  for (let k = 0; k < shown; k++) {
    const a = k * 2.399, r = 15 * Math.sqrt((k + 0.5) / Math.max(shown, 6));
    h += '<i style="left:' + (50 + Math.cos(a) * r * 2.4).toFixed(1) + '%;top:' + (50 + Math.sin(a) * r * 2.4).toFixed(1) + '%;--h:' + ((k * 47) % 360) + '"></i>';
  }
  return h;
}
// Whose pits and store these are, for screen readers: "Your pit 3", "Computer’s store" (pits count from each owner's left)
function owners() {
  if (onlineOn) return mySide() === 0 ? ['Your', 'Your friend’s'] : ['Your friend’s', 'Your'];
  return vsCpu() ? ['Your', cpuName + '’s'] : ['Player 1’s', 'Player 2’s'];
}
const humanCanMove = () => !over && !busy && (onlineOn ? ol.myTurn() : !(vsCpu() && turn === 1));
function render() {
  const names = owners();
  pitEls.forEach((el) => {
    const i = Number(el.dataset.i);
    el.querySelector('.seeds').innerHTML = seedsHtml(B[i]);
    el.querySelector('b').textContent = String(B[i]);
    const mine = own(turn, i) && B[i] > 0 && humanCanMove();
    el.classList.toggle('can', mine);
    el.classList.toggle('last', i === lastPit);
    el.classList.toggle('sown', i === sown && i !== lastPit);
    if (el.tagName === 'BUTTON') el.disabled = !mine;
    const owner = names[i <= 6 ? 0 : 1];
    const what = STORE.includes(i) ? owner + ' store' : owner + ' pit ' + (i <= 5 ? i + 1 : i - 6);
    el.setAttribute('aria-label', what + ', ' + B[i] + (B[i] === 1 ? ' seed' : ' seeds'));
  });
  undoBtn.disabled = busy || over || onlineOn || !!L || !(vsCpu() ? history.some((h) => h.turn === 0) : history.length);
  $('score-you').textContent = String(B[STORE[mySide()]]);
  $('score-cpu').textContent = String(B[STORE[1 - mySide()]]);
  $('row-you').classList.toggle('turn-you', turn === 0 && !over);
  $('row-cpu').classList.toggle('turn-cpu', turn === 1 && !over);
}

// ---------- Seeds on the move ----------
const boardEl = document.querySelector('.mc-board');
const pitEl = (i) => pitEls.find((el) => Number(el.dataset.i) === i);
// `n` seeds fly from one pit (or store) to another, a few at most, then disappear into it.
async function fly(from, to, n, ms) {
  const box = boardEl.getBoundingClientRect(), a = pitEl(from).getBoundingClientRect();
  const ghosts = Array.from({ length: Math.min(n, 8) }, (_, k) => {
    const g = document.createElement('i');
    g.className = 'mc-fly';
    g.style.setProperty('--h', String((from * 53 + k * 47) % 360));
    g.style.left = (a.left - box.left + a.width / 2 + (k % 3 - 1) * a.width * 0.12) + 'px';
    g.style.top = (a.top - box.top + a.height / 2 + (Math.floor(k / 3) - 1) * a.height * 0.12) + 'px';
    boardEl.appendChild(g);
    return g;
  });
  await Promise.all(ghosts.map((g) => slide(g, [pitEl(to)], ms)));
  ghosts.forEach((g) => g.remove());
}
const clearFlying = () => boardEl.querySelectorAll('.mc-fly').forEach((g) => g.remove());

async function moveFrom(i) {
  if (over || busy) return;
  if (!started) { started = true; track('game_start', { game: 'mancala', opponent: getOpp() }); L?.start(); }
  busy = true;
  const p = turn;
  sown = i;
  // sow seed by seed: each one hops from pit to pit and drops in
  let n = B[i]; B[i] = 0; let j = i;
  const step = animMs(150);
  const g = gameNo;
  if (step) render();
  while (n) {
    const from = j;
    j = (j + 1) % 14;
    if (j === STORE[1 - p]) continue;
    if (step) { await fly(from, j, 1, 150); if (g !== gameNo) return; }
    B[j]++; n--; lastPit = j;
    if (step) { render(); play('select'); }
  }
  // apply captures and the end of game using the rules function on the starting board
  const r = sow(prevBoard, p, i);
  if (step) {
    // a capture (the last seed and the seeds opposite) and the end-of-game sweep: the seeds fly to their store
    const trips = [];
    B.forEach((v, k) => { if (!STORE.includes(k) && r.b[k] < v) trips.push([k, v - r.b[k], r.captured && (k === r.last || k === 12 - r.last) ? STORE[p] : STORE[k <= 5 ? 0 : 1]]); });
    if (trips.length) {
      await new Promise((ok) => setTimeout(ok, step));
      if (g !== gameNo) return;
      trips.forEach(([k]) => { B[k] = r.b[k]; });
      render();
      await Promise.all(trips.map(([k, cnt, to]) => fly(k, to, cnt, 380)));
      if (g !== gameNo) return;
    }
  }
  B = r.b; lastPit = r.last;
  busy = false;
  const who = onlineOn ? (p === mySide() ? 'You' : 'Your friend') : p === 0 && vsCpu() ? 'You' : (vsCpu() ? 'The computer' : p === 0 ? 'Player 1' : 'Player 2');
  if (r.captured) { play('capture'); setStatus(who + ' captured ' + r.captured + ' seeds!', p && vsCpu() ? 'cpu' : ''); }
  else play('place');
  if (ended(B)) return finish();
  if (r.again) { setStatus(who + (who === 'You' ? ' land' : ' lands') + ' in the store: go again!', p && vsCpu() ? 'cpu' : ''); }
  else { turn = 1 - p; if (!r.captured) setStatus(turnText(), turn && vsCpu() ? 'cpu' : ''); }
  render();
  save();
  if (onlineOn && !over && !r.captured && !r.again) setStatus(ol.myTurn() ? 'Your turn: pick a pit' : 'Waiting for your friend', ol.myTurn() ? '' : 'cpu');
  if (vsCpu() && turn === 1) cpuTurn();
  drain();
}
let prevBoard = null;
function play0(i, remote = false) {
  history.push({ B: B.slice(), turn, lastPit, log: gameLog.length });
  prevBoard = B.slice();
  gameLog.push({ position: B.slice(), side: turn, move: i <= 5 ? String(i + 1) : 't' + (13 - i) });
  if (onlineOn && !remote) {
    // tell the other board straight away: who moves next, and whether this move ends the game
    const r = sow(B, turn, i);
    ol.send(String(i), r.again ? turn : 1 - turn, ended(r.b));
  }
  moveFrom(i);
}
// play your friend's moves one at a time, once the last one has finished sowing
function drain() { if (!busy && pending.length && !over) play0(pending.shift(), true); }
const turnText = () => (onlineOn ? (ol.myTurn() ? 'Your turn: pick a pit' : 'Waiting for your friend') : vsCpu() ? (turn === 0 ? 'Your turn: pick a pit' : cpuName + '’s turn') : (turn === 0 ? 'Player 1' : 'Player 2') + '’s turn');

async function cpuTurn() {
  const g = gameNo;
  busy = true; render();
  // keep news like a capture or an extra turn on screen; otherwise say the computer is thinking
  if (/’s turn$/.test($('status').textContent)) setStatus(cpuName + ' is thinking…', 'cpu');
  await wait(600);
  if (g !== gameNo) return;
  busy = false;
  if (over) return;
  play0(cpuPick(B, 1));
}

function finish(resigned = false) {
  over = true;
  if (onlineOn) {
    const [mine, theirs] = [B[STORE[mySide()]], B[STORE[1 - mySide()]]];
    const res = mine > theirs ? 'win' : mine < theirs ? 'lose' : 'draw';
    showResult(res, res === 'win' ? 'You win!' : res === 'lose' ? 'Your friend wins' : 'It’s a draw', 'You ' + mine + ', your friend ' + theirs + '.');
    setStatus('Game over: ' + mine + ' to ' + theirs, res === 'lose' ? 'cpu' : '');
    play(res === 'lose' ? 'lose' : 'win', 0.1);
    track('game_end', { game: 'mancala', result: res, mode: 'online' });
    return;
  }
  if (vsCpu()) offerReview(() => ({ game: 'mancala', board: 'mancala', plies: gameLog, me: 0, final: B.slice() }));
  render();
  store.set(SAVE, null);
  const [a, b] = [B[6], B[13]];
  const res = resigned ? 'lose' : a > b ? 'win' : a < b ? 'lose' : 'draw';
  if (vsCpu()) {
    score.add(res);
    L?.finish(res);
    showResult(res, resigned ? 'You resigned' : res === 'win' ? 'You won!' : res === 'lose' ? (L ? cpuName : 'The computer') + ' won' : 'It’s a draw', 'You ' + a + ', ' + (L ? cpuName : 'computer') + ' ' + b + '.');
  } else showResult(res === 'draw' ? 'draw' : 'win', res === 'draw' ? 'It’s a draw' : (a > b ? 'Player 1' : 'Player 2') + ' wins!', 'Player 1 ' + a + ', Player 2 ' + b + '.');
  setStatus('Game over: ' + a + ' to ' + b, res === 'lose' && vsCpu() ? 'cpu' : '');
  play(res === 'lose' && vsCpu() ? 'lose' : 'win', 0.1);
  track('game_end', { game: 'mancala', result: res });
}

function save() { if (started && !over && !L && !onlineOn) store.set(SAVE, { opp: getOpp(), B, turn, side: getSide() }); }
function resume() {
  const g = store.get(SAVE, null);
  if (L || !g || g.opp !== getOpp() || !Array.isArray(g.B) || g.B.length !== 14) return false;
  // a game against the computer reopens only with the same First / Second / Random choice
  if (vsCpu() && (g.side || 'first') !== getSide()) return false;
  B = g.B; turn = g.turn | 0; over = false; busy = false; started = true; lastPit = -1; sown = -1;
  busy = true; render();   // the saved game shows behind the question
  const order = { first: 'you go first', second: 'you go second', random: 'random order' }[getSide()];
  askResume(modeName(!vsCpu(), getLevel(), vsCpu() ? order : '')).then((ok) => {
    busy = false;
    if (!ok) return newGame();
    render(); setStatus(turnText(), turn && vsCpu() ? 'cpu' : '');
    if (vsCpu() && turn === 1) cpuTurn();
  });
  return true;
}
function newGame() {
  L?.newGame();
  gameLog = []; history = []; pending.length = 0; hideReview();
  gameNo++;
  stopAnimations(); clearFlying();
  hint.reset();
  B = [4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0]; turn = 0; over = false; busy = false; started = false; lastPit = -1; sown = -1;
  if (vsCpu() && !movesFirst(getSide())) turn = 1;   // the computer sows first
  $('result').hidden = true;
  store.set(SAVE, null);
  render();
  setStatus(turnText() + (vsCpu() && getSide() === 'random' && turn === 0 ? ' (you go first this time)' : ''), turn && vsCpu() ? 'cpu' : '');
  if (vsCpu() && turn === 1) cpuTurn();
}
pitEls.forEach((el) => el.addEventListener('click', () => {
  const i = Number(el.dataset.i);
  if (!humanCanMove()) return;
  if (!own(turn, i) || !B[i]) { shake(el, play); return; }
  play0(i);
}));
$('new-game').addEventListener('click', () => { if (!busy && !onlineOn) newGame(); });
$('again').addEventListener('click', () => { if (!onlineOn) newGame(); });
$('new-game').classList.add('online-hide');
$('again').classList.add('online-hide');
undoBtn.addEventListener('click', () => {
  if (busy || over || onlineOn || L || !history.length) return;
  // vs the computer, take back your move and the computer's replies
  let h = history.pop();
  while (vsCpu() && h.turn !== 0 && history.length) h = history.pop();
  if (vsCpu() && h.turn !== 0) { history.push(h); return; }
  B = h.B; turn = h.turn; lastPit = h.lastPit; sown = -1; gameLog.length = h.log;
  play('card');
  save();
  render();
  setStatus(turnText(), turn && vsCpu() ? 'cpu' : '');
});
undoBtn.classList.add('online-hide');
// Online: the second player sees the board from their side (their pits along the bottom)
function orient() {
  const flip = onlineOn && ol && ol.mySeat() === 1;
  pitEls.forEach((el) => { const home = Number(el.dataset.home ?? (el.dataset.home = el.dataset.i)); el.dataset.i = String(flip ? (home + 7) % 14 : home); });
}
ol = online('mancala', {
  reset: () => newGame(),
  apply: (t) => { pending.push(Number(t)); drain(); },
  seatName: (s) => (s === 0 ? 'Gold (first)' : 'Ivory'),
  over: () => over,
  onlineChanged: (on) => {
    onlineOn = on && !L;
    document.body.classList.toggle('online', onlineOn);
    orient();
    render();
  }
});
window.addEventListener('pagehide', save);
if (roomInLink || !resume()) newGame();
