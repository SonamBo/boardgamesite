// Go (9×9): place stones to surround territory and capture. Two passes in a row end the game.
import * as G from './go-engine.js';
import { store } from './site.js';
import { setStatus, levelSwitch, opponentSwitch, record, showResult } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { shake } from './solo.js';

const $ = (id) => document.getElementById(id);
const N = G.N, SAVE = 'bgs-go-game';
const score = record('go');
const getLevel = levelSwitch('go', () => {});
const getOpp = opponentSwitch('go', () => newGame(), { you: 'You', cpu: 'Computer', p1: 'Black', p2: 'White' });
const vsCpu = () => getOpp() === 'cpu';
const boardEl = $('go-board');

let B, prev, turn, caps, passes, over, busy, started, last, history, final;
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
const name = (c) => (vsCpu() ? (c === 1 ? 'You' : 'The computer') : c === 1 ? 'Black' : 'White');

function render() {
  pts.forEach((b, i) => {
    const v = B[i];
    let cls = 'gp' + (b.classList.contains('star') ? ' star' : '');
    if (v) cls += v === 1 ? ' bk' : ' wh';
    if (i === last) cls += ' last';
    if (final) { if (final.dead.includes(i)) cls += ' dead'; else if (!v && final.owner[i]) cls += final.owner[i] === 1 ? ' tb' : ' tw'; }
    b.className = cls;
    b.disabled = over || !!v;
    b.setAttribute('aria-label', String.fromCharCode(65 + (i % N) + (i % N >= 8 ? 1 : 0)) + (N - Math.floor(i / N)) + (v ? (v === 1 ? ', black' : ', white') : ', empty'));
  });
  $('caps-b').textContent = 'Captures ' + caps[1];
  $('caps-w').textContent = 'Captures ' + caps[2] + ' · komi 6.5';
  $('row-you').classList.toggle('turn-you', turn === 1 && !over);
  $('row-cpu').classList.toggle('turn-cpu', turn === 2 && !over);
  $('pass').disabled = over || busy || (vsCpu() && turn === 2);
  $('resign').disabled = over || busy;
  $('undo').disabled = over || busy || !history.length;
}

function tap(i) {
  if (over || busy || (vsCpu() && turn === 2)) return;
  const r = G.play(B, i, turn, prev);
  if (!r) { shake(pts[i], play); setStatus(B[i] ? 'That point is taken' : 'Not allowed there: it would be suicide or repeat the position (ko)', 'neutral'); return; }
  move(i, r);
}
function move(i, r) {
  if (!started) { started = true; track('game_start', { game: 'go', opponent: getOpp() }); }
  history.push({ B, prev, turn, caps: caps.slice(), last, passes });
  prev = B; B = r.b; caps[turn] += r.captured; last = i; passes = 0;
  play(r.captured ? 'capture' : 'place');
  turn = 3 - turn;
  render(); save();
  if (r.captured) setStatus(name(3 - turn) + ' captured ' + r.captured + (r.captured === 1 ? ' stone' : ' stones'), '');
  else setStatus(turnText(), turn === 2 ? 'cpu' : '');
  if (vsCpu() && turn === 2) cpuTurn();
}
function pass() {
  history.push({ B, prev, turn, caps: caps.slice(), last, passes });
  passes++;
  setStatus(name(turn) + (turn === 1 && vsCpu() ? ' pass' : ' passes'), 'neutral');
  play('flip');
  prev = B; last = -1;
  turn = 3 - turn;
  if (passes >= 2) return finish();
  render(); save();
  if (vsCpu() && turn === 2) cpuTurn();
}
const turnText = () => (vsCpu() ? (turn === 1 ? 'Your turn (Black)' : 'Computer’s turn') : name(turn) + '’s turn');

function cpuTurn() {
  busy = true; render();
  setStatus('Computer is thinking', 'cpu');
  setTimeout(() => {
    const m = G.bestMove(B, 2, prev, getLevel());
    busy = false;
    if (over) return;
    // pass when nothing useful is left, or when you passed and the computer is clearly ahead
    if (m.pass || m.winrate < 0.02 || (passes === 1 && G.score(B).diff < 0 && m.winrate > 0.9)) return pass();
    move(m.i, G.play(B, m.i, 2, prev));
  }, 60);
}

function finish() {
  over = true;
  setStatus('Counting the score…', 'neutral');
  render();
  setTimeout(() => {
    const dead = G.deadStones(B, turn);
    const sc = G.score(B, dead);
    final = { dead, owner: sc.owner };
    render();
    const blackWins = sc.diff > 0;
    const margin = Math.abs(sc.diff);
    const sub = 'Black ' + sc.black + ', White ' + sc.white + ' (with komi). Faded stones were counted as captured.';
    store.set(SAVE, null);
    if (vsCpu()) {
      score.add(blackWins ? 'win' : 'lose');
      showResult(blackWins ? 'win' : 'lose', blackWins ? 'You won by ' + margin : 'The computer won by ' + margin, sub);
      play(blackWins ? 'win' : 'lose', 0.1);
    } else { showResult('win', (blackWins ? 'Black' : 'White') + ' wins by ' + margin, sub); play('win', 0.1); }
    setStatus((blackWins ? 'Black' : 'White') + ' wins by ' + margin, blackWins || !vsCpu() ? '' : 'cpu');
    track('game_end', { game: 'go', result: blackWins ? 'win' : 'lose', margin });
  }, 50);
}

function save() { if (started && !over) store.set(SAVE, { opp: getOpp(), B, prev, turn, caps, last, passes }); }
function resume() {
  const g = store.get(SAVE, null);
  if (!g || g.opp !== getOpp() || !Array.isArray(g.B) || g.B.length !== N * N) return false;
  ({ B, prev, turn, caps, last, passes } = g); history = []; over = false; busy = false; started = true; final = null;
  render(); setStatus('Welcome back. ' + turnText(), '');
  if (vsCpu() && turn === 2) cpuTurn();
  return true;
}
function newGame() {
  B = new Array(N * N).fill(0); prev = null; turn = 1; caps = [0, 0, 0]; passes = 0; over = false; busy = false; started = false; last = -1; history = []; final = null;
  $('result').hidden = true;
  store.set(SAVE, null);
  render();
  setStatus(turnText() + ': place a stone on any point', '');
}
$('pass').addEventListener('click', () => { if (!over && !busy && !(vsCpu() && turn === 2)) pass(); });
$('undo').addEventListener('click', () => {
  if (!history.length || busy || over) return;
  let h = history.pop();
  if (vsCpu() && h.turn === 2 && history.length) h = history.pop();
  ({ B, prev, turn, caps, last, passes } = h);
  play('card'); render(); save(); setStatus(turnText(), '');
});
$('resign').addEventListener('click', () => {
  if (over || busy) return;
  over = true; store.set(SAVE, null); render();
  if (vsCpu()) { score.add('lose'); showResult('lose', 'You resigned', 'The computer wins this one.'); }
  else showResult('win', (turn === 1 ? 'White' : 'Black') + ' wins', name(turn) + ' resigned.');
  setStatus(name(turn) + (turn === 1 && vsCpu() ? ' resigned' : ' resigns'), 'neutral');
});
$('new-game').addEventListener('click', () => { if (!busy) newGame(); });
$('again').addEventListener('click', newGame);
window.addEventListener('pagehide', save);
if (!resume()) newGame();
