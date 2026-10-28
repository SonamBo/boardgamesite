// Letter Tiles: build crossing words on the board from your rack of seven letters.
// Play the computer at three levels, or a friend on one device.
import * as E from './letter-tiles-engine.js';
import { store } from './site.js';
import { setStatus, levelSwitch, opponentSwitch, record, showResult } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { shake } from './solo.js';
import { shuffled } from './word-lib.js';

const $ = (id) => document.getElementById(id);
const N = E.N;
const SAVE = 'bgs-tiles-word-game';
const score = record('lettertiles');
const getLevel = levelSwitch('lettertiles', () => newGame());
const getOpp = opponentSwitch('lettertiles', () => newGame(), { you: 'You', cpu: 'Computer', p1: 'Player 1', p2: 'Player 2' });
const vsCpu = () => getOpp() === 'cpu';
const names = () => (vsCpu() ? ['You', 'Computer'] : ['Player 1', 'Player 2']);

let board, bagT, racks, scores, turn, pending, sel, swapMode, swapPick, scoreless, over, busy, last, hidden, started;

// ---------- Board ----------
const boardEl = $('lt-board');
const cellEls = [];
const LABEL = { dl: '2L', tl: '3L', dw: '2W', tw: '3W' };
for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'lt-cell ' + (E.BONUSES[r][c] || '') + (r === E.CENTRE && c === E.CENTRE ? ' star' : '');
  b.dataset.r = String(r); b.dataset.c = String(c);
  b.addEventListener('click', () => tapCell(r, c));
  boardEl.appendChild(b);
  cellEls.push(b);
}
const tileHtml = (ch) => '<span class="lt-tile"><b>' + ch + '</b><small>' + E.VALUES[ch] + '</small></span>';

function render() {
  const pendAt = new Map(pending.map((p) => [p.r * N + p.c, p]));
  cellEls.forEach((b, i) => {
    const r = Math.floor(i / N), c = i % N;
    const ch = board[r][c], p = pendAt.get(i);
    const bon = E.BONUSES[r][c];
    b.innerHTML = ch ? tileHtml(ch) : p ? tileHtml(p.ch) : (r === E.CENTRE && c === E.CENTRE ? '<i>★</i>' : bon ? '<i>' + LABEL[bon] + '</i>' : '');
    b.classList.toggle('filled', !!ch);
    b.classList.toggle('pend', !!p);
    b.classList.toggle('last', !!ch && last.has(i));
    b.setAttribute('aria-label', 'Row ' + (r + 1) + ', column ' + (c + 1) + ': ' + (ch || (p && p.ch) ? (ch || p.ch).toUpperCase() : bon ? { dl: 'double letter', tl: 'triple letter', dw: 'double word', tw: 'triple word' }[bon] : 'empty'));
  });
  // rack
  const rackEl = $('lt-rack');
  rackEl.textContent = '';
  const me = myRack();
  me.forEach((ch, k) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lt-rtile' + (k === sel ? ' sel' : '') + (swapMode && swapPick.has(k) ? ' pick' : '');
    b.innerHTML = '<b>' + ch + '</b><small>' + E.VALUES[ch] + '</small>';
    b.setAttribute('aria-label', ch.toUpperCase() + ', ' + E.VALUES[ch] + ' points' + (k === sel ? ', selected' : ''));
    b.disabled = over || busy || !myTurn() || hidden;
    b.addEventListener('click', () => tapRack(k));
    rackEl.appendChild(b);
  });
  rackEl.classList.toggle('hidden', hidden);
  $('lt-cover').hidden = !hidden;
  // buttons and scores
  const ev = pending.length ? E.evaluate(board, pending) : null;
  const playBtn = $('lt-play');
  playBtn.textContent = swapMode ? (swapPick.size ? 'Swap ' + swapPick.size + (swapPick.size === 1 ? ' tile' : ' tiles') : 'Pick tiles to swap') : ev && ev.ok ? 'Play for ' + ev.score : 'Play';
  playBtn.disabled = over || busy || !myTurn() || hidden || (swapMode ? !swapPick.size : !pending.length);
  $('lt-recall').disabled = !pending.length || busy;
  $('lt-swap').disabled = over || busy || !myTurn() || hidden || bagT.length < E.RACK;
  $('lt-swap').textContent = swapMode ? 'Cancel' : 'Swap';
  $('lt-pass').disabled = over || busy || !myTurn() || hidden;
  $('score-you').textContent = String(scores[0]);
  $('score-cpu').textContent = String(scores[1]);
  $('lt-bag').textContent = String(bagT.length);
  $('row-you').classList.toggle('turn-you', turn === 0 && !over);
  $('row-cpu').classList.toggle('turn-cpu', turn === 1 && !over);
}
const myTurn = () => !(vsCpu() && turn === 1);
const myRack = () => {
  const r = racks[vsCpu() ? 0 : turn].slice();
  // tiles on the board this turn aren't in the rack
  for (const p of pending) r.splice(r.indexOf(p.ch), 1);
  return r;
};

function tapRack(k) {
  if (over || busy || !myTurn()) return;
  if (swapMode) { swapPick.has(k) ? swapPick.delete(k) : swapPick.add(k); play('select'); return render(); }
  sel = sel === k ? null : k;
  play('select');
  render();
}
function tapCell(r, c) {
  if (over || busy || !myTurn() || hidden || swapMode) return;
  const i = pending.findIndex((p) => p.r === r && p.c === c);
  if (i >= 0) { pending.splice(i, 1); sel = null; play('flip'); return render(); }
  if (board[r][c] || sel == null) return;
  const ch = myRack()[sel];
  pending.push({ r, c, ch });
  sel = null;
  if (!started) { started = true; track('game_start', { game: 'letter-tiles', opponent: getOpp() }); }
  play('place');
  render();
}

// ---------- Turns ----------
function draw(p) { while (racks[p].length < E.RACK && bagT.length) racks[p].push(bagT.pop()); }
function commit(p, placed, pts, words) {
  for (const t of placed) { board[t.r][t.c] = t.ch; racks[p].splice(racks[p].indexOf(t.ch), 1); }
  last = new Set(placed.map((t) => t.r * N + t.c));
  scores[p] += pts;
  scoreless = 0;
  draw(p);
  const who = p === 0 && vsCpu() ? 'You' : names()[p];
  setStatus(who + ' played ' + words[0].toUpperCase() + ' for ' + pts + (placed.length === E.RACK ? ', with the +' + E.BONUS + ' all-tiles bonus!' : ''), p ? 'cpu' : '');
  play(placed.length === E.RACK ? 'king' : 'capture');
  if (!racks[p].length && !bagT.length) return endGame(p);
  nextTurn();
}
function playPending() {
  if (swapMode) return doSwap();
  const ev = E.evaluate(board, pending);
  if (!ev.ok) { shake(boardEl, play); setStatus(ev.error, 'neutral'); return; }
  const placed = pending.slice();
  pending = []; sel = null;
  commit(vsCpu() ? 0 : turn, placed, ev.score, ev.words);
}
function doSwap() {
  const p = vsCpu() ? 0 : turn;
  const out = [...swapPick].sort((a, b) => b - a).map((k) => racks[p].splice(k, 1)[0]);
  draw(p);
  bagT.push(...out);
  bagT = shuffled(bagT);
  swapMode = false; swapPick = new Set();
  setStatus((vsCpu() ? 'You' : names()[p]) + ' swapped ' + out.length + (out.length === 1 ? ' tile' : ' tiles'), 'neutral');
  play('shuffle');
  scoreless++;
  nextTurn();
}
function pass() {
  pending = []; sel = null; swapMode = false;
  setStatus((turn === 0 && vsCpu() ? 'You' : names()[turn]) + ' passed', 'neutral');
  scoreless++;
  play('flip');
  nextTurn();
}
function nextTurn() {
  if (scoreless >= 6) return endGame(-1);
  turn = 1 - turn;
  pending = []; sel = null;
  if (!vsCpu()) hidden = true; // pass the device without showing the rack
  render();
  save();
  if (vsCpu() && turn === 1) cpuTurn();
  else if (!vsCpu()) setStatus(names()[turn] + ': tap Show my tiles', 'neutral');
}

function cpuTurn() {
  busy = true;
  render();
  setTimeout(() => {
    const moves = E.allMoves(board, racks[1]);
    busy = false;
    if (over) return;
    if (!moves.length) {
      if (bagT.length >= E.RACK) {
        const out = racks[1].splice(0, racks[1].length);
        draw(1); bagT.push(...out); bagT = shuffled(bagT);
        setStatus('The computer swapped its tiles', 'cpu');
        scoreless++;
        return nextTurn();
      }
      setStatus('The computer passed', 'cpu');
      scoreless++;
      return nextTurn();
    }
    const lvl = getLevel();
    let m;
    if (lvl === 'hard') m = moves[0];
    else if (lvl === 'medium') m = moves[Math.floor(Math.random() * Math.min(moves.length, Math.max(3, Math.ceil(moves.length * 0.15))))];
    else {
      // easy: a modest move, usually short
      const lo = moves.slice(Math.floor(moves.length * 0.4));
      const pool = lo.filter((x) => x.placed.length <= 3);
      m = (pool.length ? pool : moves)[Math.floor(Math.random() * (pool.length || moves.length))];
    }
    commit(1, m.placed, m.score, m.words);
  }, 700);
}

function endGame(out) {
  over = true;
  // leftover tiles count against their owner; the player who went out gains them
  const left = racks.map((r) => r.reduce((a, ch) => a + E.VALUES[ch], 0));
  scores[0] -= left[0]; scores[1] -= left[1];
  if (out >= 0) scores[out] += left[1 - out];
  hidden = false;
  render();
  store.set(SAVE, null);
  const [a, b] = scores;
  if (vsCpu()) {
    const res = a > b ? 'win' : a < b ? 'lose' : 'draw';
    score.add(res);
    showResult(res, res === 'win' ? 'You won!' : res === 'lose' ? 'The computer won' : 'It’s a draw', 'You ' + a + ', computer ' + b + '.');
    setStatus('Game over: ' + a + ' to ' + b, res === 'lose' ? 'cpu' : '');
    play(res === 'lose' ? 'lose' : 'win', 0.1);
    track('game_end', { game: 'letter-tiles', result: res, you: a, cpu: b });
  } else {
    showResult(a === b ? 'draw' : 'win', a === b ? 'It’s a draw' : (a > b ? 'Player 1' : 'Player 2') + ' wins!', 'Player 1 ' + a + ', Player 2 ' + b + '.');
    setStatus('Game over: ' + a + ' to ' + b);
    play('win', 0.1);
  }
}

// ---------- New game, save and resume ----------
function newGame() {
  board = E.empty(); bagT = E.bag(); racks = [[], []]; draw(0); draw(1);
  scores = [0, 0]; turn = 0; pending = []; sel = null; swapMode = false; swapPick = new Set(); scoreless = 0;
  over = false; busy = false; last = new Set(); hidden = !vsCpu(); started = false;
  $('result').hidden = true;
  store.set(SAVE, null);
  setStatus(vsCpu() ? 'Your turn: make a word through the star' : 'Player 1: tap Show my tiles', 'neutral');
  render();
}
function save() {
  if (over) return;
  store.set(SAVE, { opp: getOpp(), board, bag: bagT, racks, scores, turn, scoreless });
}
function resume() {
  const g = store.get(SAVE, null);
  if (!g || g.opp !== getOpp() || !Array.isArray(g.board) || g.board.length !== N || !Array.isArray(g.racks)) return false;
  ({ board, scores, turn, scoreless } = g); bagT = g.bag; racks = g.racks;
  pending = []; sel = null; swapMode = false; swapPick = new Set(); over = false; busy = false; last = new Set(); hidden = !vsCpu(); started = true;
  setStatus('Welcome back. Your game is where you left it', 'neutral');
  render();
  if (vsCpu() && turn === 1) cpuTurn();
  return true;
}
window.addEventListener('pagehide', save);

$('lt-play').addEventListener('click', playPending);
$('lt-recall').addEventListener('click', () => { pending = []; sel = null; play('flip'); render(); });
$('lt-shuffle').addEventListener('click', () => {
  const p = vsCpu() ? 0 : turn;
  if (pending.length) return;
  racks[p] = shuffled(racks[p]); sel = null; play('shuffle'); render();
});
$('lt-swap').addEventListener('click', () => { pending = []; sel = null; swapMode = !swapMode; swapPick = new Set(); render(); });
$('lt-pass').addEventListener('click', () => { if (!over && !busy && myTurn()) pass(); });
$('lt-show').addEventListener('click', () => { hidden = false; setStatus(names()[turn] + '’s turn', turn ? 'cpu' : ''); render(); });
$('new-game').addEventListener('click', () => { play('shuffle'); newGame(); });
$('again').addEventListener('click', () => { play('shuffle'); newGame(); });
// Keyboard: type a letter to select it in the rack, Enter to play, Escape to recall.
document.addEventListener('keydown', (e) => {
  if (over || busy || !myTurn() || hidden || e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea')) return;
  const k = e.key.toLowerCase();
  if (/^[a-z]$/.test(k)) { const i = myRack().indexOf(k); if (i >= 0) { sel = i; render(); } }
  else if (e.key === 'Enter' && pending.length && !e.target.closest?.('button')) { e.preventDefault(); playPending(); }
  else if (e.key === 'Escape') { pending = []; sel = null; render(); }
});
if (!resume()) newGame();
