// Go (9×9): place stones to surround territory and capture. Two passes in a row end the game.
import * as G from './go-engine.js';
import { store } from './site.js';
import { setStatus, levelSwitch, opponentSwitch, record, showResult, sideSwitch, animationSwitch, moveQueue, popIn, fadeOut, settle, hintButton, moveHistory, askResume, modeName } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { shake, rng, seedFrom } from './solo.js';
import { online, roomInLink } from './online.js';

const $ = (id) => document.getElementById(id);
const N = G.N, SAVE = 'bgs-go-game';
const score = record('go', { draws: false });
const getLevel = levelSwitch('go', () => {});
const getOpp = opponentSwitch('go', () => newGame(), { you: 'You', cpu: 'Computer', p1: 'Black', p2: 'White' });
const vsCpu = () => getOpp() === 'cpu';
// Against the computer you play black (moves first) or white.
const getSide = sideSwitch('go', ['black', 'white'], () => newGame());
let me = 1;   // your colour against the computer in this game: 1 black, 2 white
const cpuTurnNow = () => vsCpu() && !onlineOn && turn !== me;
animationSwitch();
const Q = moveQueue();   // moves animate one at a time
// Show hint: Easy, against the computer
const hint = hintButton({
  shown: () => vsCpu() && !onlineOn && getLevel() === 'easy',
  find: () => {
    if (over || busy || Q.busy() || cpuTurnNow()) return null;
    const m = G.bestMove(B, me, prev, 'easy');
    return m.pass || m.winrate < 0.02 ? 'Nothing useful is left to play: pass' : [pts[m.i]];
  }
});
const boardEl = $('go-board');

let B, prev, turn, caps, passes, over, busy, started, last, history, final, onlineOn = roomInLink, ol = null;
const pts = [];
for (let i = 0; i < N * N; i++) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'gp';
  const r = Math.floor(i / N), c = i % N;
  if ([2, 4, 6].includes(r) && [2, 4, 6].includes(c) && (r === 4) === (c === 4)) b.classList.add('star');
  b.addEventListener('click', () => tap(i));
  boardEl.appendChild(b);
  pts.push(b);
}
const name = (c) => (vsCpu() ? (c === me ? 'You' : 'The computer') : c === 1 ? 'Black' : 'White');
const colour = (c) => (c === 1 ? 'Black' : 'White');
const pointName = (i) => String.fromCharCode(65 + (i % N) + (i % N >= 8 ? 1 : 0)) + (N - Math.floor(i / N));
// Moves so far, and a replay at the end: history holds the position before each move (or pass), so the
// position after k moves is history[k] (or the board itself). view: the position being replayed (null: the game).
let view = null;
const hist = moveHistory({ show: (k) => { view = k == null ? null : { B: history[k].B, last: history[k].last }; render(); } });
// the players card: the black row and the white row, named for this game
function paintSides() {
  if (!vsCpu() || onlineOn) return;
  document.querySelector('[data-name="p1"]').textContent = me === 1 ? 'You' : 'Computer';
  document.querySelector('[data-name="p2"]').textContent = me === 2 ? 'You' : 'Computer';
}

function render() {
  const shown = view ? view.B : B, shownLast = view ? view.last : last;
  pts.forEach((b, i) => {
    const v = shown[i];
    let cls = 'gp' + (b.classList.contains('star') ? ' star' : '');
    if (v) cls += v === 1 ? ' bk' : ' wh';
    if (i === shownLast) cls += ' last';
    if (final && !view) { if (final.dead.includes(i)) cls += ' dead'; else if (!v && final.owner[i]) cls += final.owner[i] === 1 ? ' tb' : ' tw'; }
    b.className = cls;
    b.disabled = over || !!v;
    b.setAttribute('aria-label', pointName(i) + (v ? (v === 1 ? ', black' : ', white') : ', empty'));
  });
  hist.set(history.map((h, k) => { const at = k + 1 < history.length ? history[k + 1].last : last; return at < 0 ? 'pass' : pointName(at); }));
  $('caps-b').textContent = 'Captures ' + caps[1];
  $('caps-w').textContent = 'Captures ' + caps[2] + ' · komi 6.5';
  $('row-you').classList.toggle('turn-you', turn === 1 && !over);
  $('row-cpu').classList.toggle('turn-cpu', turn === 2 && !over);
  $('pass').disabled = over || busy || (onlineOn ? !ol.myTurn() : cpuTurnNow());
  $('resign').disabled = over || busy;
  $('undo').disabled = over || busy || !(vsCpu() ? history.some((h) => h.turn === me) : history.length);
}

function tap(i) {
  if (over || busy || Q.busy() || (onlineOn ? !ol.myTurn() : cpuTurnNow())) return;
  const r = G.play(B, i, turn, prev);
  if (!r) { shake(pts[i], play); setStatus(B[i] ? 'That point is taken' : 'Not allowed there: it would be suicide or repeat the position (ko)', 'neutral'); return; }
  move(i, r);
}
// Show the stone arriving, then any stones it captures fading away; then make the move.
function move(i, r, remote = false) {
  Q.run(async (live) => {
    const col = turn;
    r = r || G.play(B, i, col, prev);   // an online move is checked against the board as it is by now
    if (!r) return false;
    const gone = [];
    B.forEach((v, k) => { if (v && !r.b[k]) gone.push(k); });
    const keep = B;
    B = B.slice(); B[i] = col;   // drawn with the new stone, before the captures come off
    render();
    B = keep;
    await popIn(pts[i], 200);
    if (gone.length && live()) await Promise.all(gone.map((k) => fadeOut(pts[k], 240)));
    return gone;
  }, (gone) => { settle(gone.map((k) => pts[k])); makeMove(i, r, remote); });
}
function makeMove(i, r, remote) {
  if (!started) { started = true; track('game_start', { game: 'go', opponent: getOpp() }); }
  history.push({ B, prev, turn, caps: caps.slice(), last, passes });
  prev = B; B = r.b; caps[turn] += r.captured; last = i; passes = 0;
  play(r.captured ? 'capture' : 'place');
  turn = 3 - turn;
  if (onlineOn && !remote) ol.send(String(i), turn - 1, false);
  render(); save();
  if (onlineOn) { setStatus(r.captured ? name(3 - turn) + ' captured ' + r.captured : ol.myTurn() ? 'Your turn' : 'Waiting for your friend', ol.myTurn() ? '' : 'cpu'); return; }
  if (r.captured) setStatus(name(3 - turn) + ' captured ' + r.captured + (r.captured === 1 ? ' stone' : ' stones'), '');
  else setStatus(turnText(), cpuTurnNow() ? 'cpu' : '');
  if (cpuTurnNow()) cpuTurn();
}
function pass(remote = false) {
  history.push({ B, prev, turn, caps: caps.slice(), last, passes });
  passes++;
  setStatus(name(turn) + (turn === me && vsCpu() ? ' pass' : ' passes'), 'neutral');
  play('flip');
  prev = B; last = -1;
  turn = 3 - turn;
  if (onlineOn && !remote) ol.send('p', turn - 1, passes >= 2);
  if (passes >= 2) return finish();
  render(); save();
  if (cpuTurnNow()) cpuTurn();
}
const turnText = () => (vsCpu() ? (turn === me ? 'Your turn (' + colour(me) + ')' : 'Computer is thinking…') : name(turn) + '’s turn');

let cpuTimer = 0;
function cpuTurn() {
  busy = true; render();
  setStatus('Computer is thinking…', 'cpu');
  // a short pause before the move, so it isn't missed (the search itself runs at full speed)
  cpuTimer = setTimeout(() => {
    const cpu = 3 - me;
    const m = G.bestMove(B, cpu, prev, getLevel());
    busy = false;
    if (over) return;
    // pass when nothing useful is left, or when you passed and the computer is clearly ahead
    const ahead = cpu === 2 ? G.score(B).diff < 0 : G.score(B).diff > 0;
    if (m.pass || m.winrate < 0.02 || (passes === 1 && ahead && m.winrate > 0.9)) return pass();
    move(m.i, G.play(B, m.i, cpu, prev));
  }, 450);
}

function finish() {
  over = true;
  setStatus('Counting the score…', 'neutral');
  render();
  setTimeout(() => {
    // online, both boards must agree on dead stones, so they use the same random numbers
    const dead = onlineOn ? G.deadStones(B, turn, 120, rng(seedFrom(B.join('')))) : G.deadStones(B, turn);
    const sc = G.score(B, dead);
    final = { dead, owner: sc.owner };
    render(); hist.end();
    const blackWins = sc.diff > 0;
    const margin = Math.abs(sc.diff);
    const sub = 'Black ' + sc.black + ', White ' + sc.white + ' (with komi). Faded stones were counted as captured.';
    store.set(SAVE, null);
    if (onlineOn) {
      const won = (blackWins ? 0 : 1) === ol.mySeat();
      showResult(won ? 'win' : 'lose', won ? 'You won by ' + margin : 'Your friend won by ' + margin, sub);
      play(won ? 'win' : 'lose', 0.1);
    } else if (vsCpu()) {
      const won = blackWins === (me === 1);
      score.add(won ? 'win' : 'lose');
      showResult(won ? 'win' : 'lose', won ? 'You won by ' + margin : 'The computer won by ' + margin, sub);
      play(won ? 'win' : 'lose', 0.1);
    } else { showResult('win', (blackWins ? 'Black' : 'White') + ' wins by ' + margin, sub); play('win', 0.1); }
    setStatus((blackWins ? 'Black' : 'White') + ' wins by ' + margin, !vsCpu() || blackWins === (me === 1) ? '' : 'cpu');
    track('game_end', { game: 'go', result: blackWins ? 'win' : 'lose', margin });
  }, 50);
}

function save() { if (started && !over && !onlineOn) store.set(SAVE, { opp: getOpp(), me, B, prev, turn, caps, last, passes }); }
function resume() {
  Q.reset();
  const g = store.get(SAVE, null);
  if (!g || g.opp !== getOpp() || !Array.isArray(g.B) || g.B.length !== N * N) return false;
  // a game against the computer reopens only with the colour it was played with
  if (vsCpu() && (g.me === 2 ? 'white' : 'black') !== getSide()) return false;
  me = g.me === 2 ? 2 : 1;
  ({ B, prev, turn, caps, last, passes } = g); history = []; view = null; hist.reset(); over = false; busy = false; started = true; final = null;
  paintSides();
  busy = true; render();   // the saved game shows behind the question
  askResume(modeName(!vsCpu(), getLevel(), vsCpu() ? 'you play ' + colour(me).toLowerCase() : '')).then((ok) => {
    busy = false;
    if (!ok) return newGame();
    render(); setStatus(turnText(), '');
    if (cpuTurnNow()) cpuTurn();
  });
  return true;
}
function newGame() {
  clearTimeout(cpuTimer);
  Q.reset();
  hint.reset();
  B = new Array(N * N).fill(0); prev = null; turn = 1; caps = [0, 0, 0]; passes = 0; over = false; busy = false; started = false; last = -1; history = []; final = null;
  view = null; hist.reset();
  me = getSide() === 'white' ? 2 : 1;
  $('result').hidden = true;
  store.set(SAVE, null);
  paintSides();
  render();
  if (cpuTurnNow()) return cpuTurn();
  setStatus(turnText() + ': place a stone on any point', '');
}
$('pass').addEventListener('click', () => { if (!over && !busy && !Q.busy() && (onlineOn ? ol.myTurn() : !cpuTurnNow())) pass(); });
$('undo').addEventListener('click', () => {
  if (!history.length || busy || over || Q.busy()) return;
  // vs the computer, take back your move and its reply
  let h = history.pop();
  while (vsCpu() && h.turn !== me && history.length) h = history.pop();
  if (vsCpu() && h.turn !== me) { history.push(h); return; }
  ({ B, prev, turn, caps, last, passes } = h);
  play('card'); render(); save(); setStatus(turnText(), '');
});
$('resign').addEventListener('click', () => {
  if (over || busy) return;
  Q.reset();
  over = true; store.set(SAVE, null); render(); hist.end();
  if (vsCpu()) { score.add('lose'); showResult('lose', 'You resigned', 'The computer wins this one.'); }
  else showResult('win', (turn === 1 ? 'White' : 'Black') + ' wins', name(turn) + ' resigned.');
  setStatus(name(turn) + (turn === me && vsCpu() ? ' resigned' : ' resigns'), 'neutral');
});
$('new-game').addEventListener('click', () => { if (!busy && !onlineOn) newGame(); });
['new-game', 'undo', 'resign'].forEach((id) => $(id).classList.add('online-hide'));
ol = online('go', {
  reset: () => newGame(),
  apply: (t) => {
    if (t === 'p') return Q.run(() => true, () => pass(true));
    move(Number(t), null, true);
  },
  seatName: (s) => (s === 0 ? 'Black (first)' : 'White'),
  over: () => over,
  onlineChanged: (on) => { onlineOn = on; document.body.classList.toggle('online', on); render(); }
});
$('again').addEventListener('click', newGame);
window.addEventListener('pagehide', save);
if (roomInLink || !resume()) newGame();
