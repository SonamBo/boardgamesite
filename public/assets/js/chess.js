// Chess page: tap a piece, then where it goes. Play the computer at three levels or a friend.
import * as C from './chess-engine.js';
import { pieceSvg, PIECE_NAME } from './chess-pieces.js';
import { store } from './site.js';
import { setStatus, levelSwitch, opponentSwitch, record, showResult } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { shake } from './solo.js';
import { online, roomInLink } from './online.js';
import { ladder } from './ladder.js';

const $ = (id) => document.getElementById(id);
const SAVE = 'bgs-chess-game';
const SIDE_KEY = 'bgs-chess-side';
const score = record('chess');
// Rated practice-ladder game (?bot=…): fixed level, no take-backs. Null for an ordinary game.
const L = ladder('chess', { resign: () => resign(), again: () => newGame() });
const getLevel = L ? () => L.level : levelSwitch('chess', () => {});
const getOpp = L ? () => 'cpu' : opponentSwitch('chess', () => newGame(), { you: 'You', cpu: 'Computer', p1: 'White', p2: 'Black' });
const cpuName = L ? L.bot.name : 'Computer';
const vsCpu = () => getOpp() === 'cpu';
const boardEl = $('chess-board');

let mySide = L ? L.side : store.get(SIDE_KEY, 'w') === 'b' ? 'b' : 'w';
let S, sel, legalNow, last, sans, keys, history, over, busy, started, promo, onlineOn = roomInLink && !L, ol = null;

const sqEls = [];
for (let i = 0; i < 64; i++) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'cs ' + ((Math.floor(i / 8) + i) % 2 ? 'dk' : 'lt');
  b.addEventListener('click', () => tap(viewToSq(i)));
  boardEl.appendChild(b);
  sqEls.push(b);
}
const flipped = () => (onlineOn ? ol.mySeat() === 1 : vsCpu() && mySide === 'b');
const viewToSq = (v) => (flipped() ? 63 - v : v);
const sqToView = (s) => (flipped() ? 63 - s : s);
const myTurn = () => !over && !busy && (onlineOn ? ol.myTurn() : (!vsCpu() || S.turn === mySide));

function render() {
  const dests = sel != null ? legalNow.filter((m) => m.from === sel).map((m) => m.to) : [];
  const check = C.inCheck(S) ? S.board.indexOf(S.turn === 'w' ? 'K' : 'k') : -1;
  for (let v = 0; v < 64; v++) {
    const i = viewToSq(v), b = sqEls[v], p = S.board[i];
    b.innerHTML = (p ? pieceSvg(p) : '') + (dests.includes(i) ? '<i class="' + (p || (S.ep === i && S.board[sel]?.toLowerCase() === 'p') ? 'cap' : 'dot') + '"></i>' : '');
    b.classList.toggle('sel', i === sel);
    b.classList.toggle('last', !!last && (i === last.from || i === last.to));
    b.classList.toggle('chk', i === check);
    const f = v % 8, r = Math.floor(v / 8);
    b.dataset.file = r === 7 ? 'abcdefgh'[flipped() ? 7 - f : f] : '';
    b.dataset.rank = f === 0 ? String(flipped() ? r + 1 : 8 - r) : '';
    b.setAttribute('aria-label', C.sqName(i) + (p ? ', ' + (p === p.toUpperCase() ? 'white ' : 'black ') + PIECE_NAME[p.toLowerCase()] : '') + (dests.includes(i) ? ', move here' : ''));
  }
  // move list
  const ml = $('moves');
  let h = '';
  for (let k = 0; k < sans.length; k += 2) h += '<li><span>' + (k / 2 + 1) + '.</span> ' + sans[k] + (sans[k + 1] ? ' ' + sans[k + 1] : '') + '</li>';
  ml.innerHTML = h;
  ml.scrollTop = ml.scrollHeight;
  $('undo').disabled = !history.length || busy || over || onlineOn;
  const names = onlineOn ? (ol.mySeat() === 1 ? ['Friend', 'You'] : ['You', 'Friend']) : vsCpu() ? (mySide === 'w' ? ['You', cpuName] : [cpuName, 'You']) : ['White', 'Black'];
  $('name-w').textContent = names[0] + ' (White)';
  $('name-b').textContent = names[1] + ' (Black)';
  $('row-w').classList.toggle('turn-you', S.turn === 'w' && !over);
  $('row-b').classList.toggle('turn-cpu', S.turn === 'b' && !over);
  $('cap-w').innerHTML = captured('b').map(pieceSvg).join('');
  $('cap-b').innerHTML = captured('w').map(pieceSvg).join('');
  $('promo').hidden = !promo;
}
// pieces of `side` that have been taken
function captured(side) {
  const full = side === 'w' ? 'PPPPPPPPNNBBRRQ' : 'ppppppppnnbbrrq';
  const left = S.board.filter((p) => p && p.toLowerCase() !== 'k' && (p === p.toUpperCase()) === (side === 'w')).join('');
  const out = [];
  for (const t of 'qrbnp') {
    const ch = side === 'w' ? t.toUpperCase() : t;
    const n = [...full].filter((x) => x === ch).length - [...left].filter((x) => x === ch).length;
    for (let k = 0; k < Math.max(0, n); k++) out.push(ch);
  }
  return out;
}

function tap(i) {
  if (!myTurn() || promo) return;
  const p = S.board[i];
  if (sel != null) {
    const ms = legalNow.filter((m) => m.from === sel && m.to === i);
    if (ms.length) {
      if (ms.length > 1) { promo = ms; render(); return; } // promotion: choose a piece
      return doMove(ms[0]);
    }
  }
  if (p && (p === p.toUpperCase()) === (S.turn === 'w') && legalNow.some((m) => m.from === i)) { sel = i; play('select'); }
  else if (p && (p === p.toUpperCase()) === (S.turn === 'w')) { shake(sqEls[sqToView(i)], play); setStatus('That piece can’t move', 'neutral'); sel = null; }
  else sel = null;
  render();
}

function doMove(m, remote = false) {
  if (!started) { started = true; track('game_start', { game: 'chess', opponent: onlineOn ? 'online' : getOpp(), level: getLevel() }); L?.start(); }
  history.push({ S, last, sans: sans.slice(), keys: keys.slice() });
  sans.push(C.san(S, m));
  S = C.make(S, m);
  keys.push(C.key(S));
  last = m; sel = null; promo = null;
  legalNow = C.legal(S);
  play(m.captured ? 'capture' : m.castle ? 'king' : 'move');
  const st = C.status(S, keys);
  if (onlineOn && !remote) ol.send(C.sqName(m.from) + C.sqName(m.to) + (m.promo ? m.promo.toLowerCase() : ''), S.turn === 'w' ? 0 : 1, st.over);
  render();
  if (st.over) return finish(st);
  if (onlineOn) { if (C.inCheck(S)) { setStatus('Check!', 'neutral'); play('error'); } return; }
  if (C.inCheck(S)) { setStatus('Check!', 'neutral'); play('error'); }
  else setStatus(turnText(), S.turn === mySide || !vsCpu() ? '' : 'cpu');
  save();
  if (vsCpu() && S.turn !== mySide) cpuMove();
}
const turnText = () => (vsCpu() ? (S.turn === mySide ? 'Your move' : cpuName + ' is thinking') : (S.turn === 'w' ? 'White' : 'Black') + ' to move');

function cpuMove() {
  busy = true;
  render();
  setStatus(cpuName + ' is thinking', 'cpu');
  setTimeout(() => {
    const m = C.bestMove(S, getLevel());
    busy = false;
    if (m && !over) doMove(m);
  }, 250);
}

function finish(st) {
  over = true;
  render();
  store.set(SAVE, null);
  if (onlineOn) {
    const mine = ol.mySeat() === 0 ? 'w' : 'b';
    const kind = st.result === 'draw' ? 'draw' : st.result === mine ? 'win' : 'lose';
    showResult(kind, kind === 'draw' ? 'Draw' : kind === 'win' ? 'Checkmate! You won' : 'Checkmate. You lost', kind === 'draw' ? 'By ' + st.reason + '.' : sans.length + ' moves played.');
    setStatus(kind === 'draw' ? 'Draw by ' + st.reason : kind === 'win' ? 'You won!' : 'Checkmate', kind === 'lose' ? 'cpu' : '');
    play(kind === 'win' ? 'win' : 'lose', 0.1);
    return;
  }
  if (st.result === 'draw') {
    if (vsCpu()) score.add('draw');
    L?.finish('draw');
    showResult('draw', 'Draw', 'By ' + st.reason + '.');
    setStatus('Draw by ' + st.reason, 'neutral');
    play('lose', 0.1);
  } else if (vsCpu()) {
    const won = st.result === mySide;
    score.add(won ? 'win' : 'lose');
    L?.finish(won ? 'win' : 'lose');
    const resigned = st.reason === 'resignation';
    showResult(won ? 'win' : 'lose', resigned ? 'You resigned' : won ? 'Checkmate! You won' : 'Checkmate. ' + (L ? cpuName : 'The computer') + ' won', sans.length + ' moves played.');
    setStatus(resigned ? 'You resigned' : won ? 'Checkmate! You won' : 'Checkmate', won ? '' : 'cpu');
    play(won ? 'win' : 'lose', 0.1);
  } else {
    showResult('win', (st.result === 'w' ? 'White' : 'Black') + ' wins by checkmate!', sans.length + ' moves played.');
    setStatus('Checkmate!');
    play('win', 0.1);
  }
  track('game_end', { game: 'chess', result: st.result, reason: st.reason });
}

function resign() { if (!over && started) finish({ over: true, result: mySide === 'w' ? 'b' : 'w', reason: 'resignation' }); }
function save() { if (started && !over && !onlineOn && !L) store.set(SAVE, { opp: getOpp(), side: mySide, fen: C.toFen(S), sans, keys, last }); }
function resume() {
  const g = store.get(SAVE, null);
  if (L || !g || g.opp !== getOpp() || (vsCpu() && g.side !== mySide) || typeof g.fen !== 'string') return false;
  S = C.fromFen(g.fen); sans = g.sans || []; keys = g.keys || []; last = g.last || null; history = []; sel = null; over = false; busy = false; started = true; promo = null;
  legalNow = C.legal(S);
  render();
  setStatus('Welcome back. ' + turnText(), '');
  if (vsCpu() && S.turn !== mySide) cpuMove();
  return true;
}
function newGame() {
  if (L) { L.newGame(); mySide = L.side; }
  S = C.fromFen(C.START); sel = null; last = null; sans = []; keys = [C.key(S)]; history = []; over = false; busy = false; started = false; promo = null;
  legalNow = C.legal(S);
  $('result').hidden = true;
  store.set(SAVE, null);
  render();
  setStatus(turnText(), '');
  if (vsCpu() && mySide === 'b' && !onlineOn) cpuMove();
}

document.querySelectorAll('[data-promo]').forEach((b) => b.addEventListener('click', () => {
  if (!promo) return;
  const m = promo.find((x) => x.promo.toLowerCase() === b.dataset.promo);
  if (m) doMove(m);
}));
$('undo').addEventListener('click', () => {
  if (!history.length || busy || over || L) return;
  // vs the computer, take back your move and its reply
  let h = history.pop();
  if (vsCpu() && h.S.turn !== mySide && history.length) h = history.pop();
  ({ S, last, sans, keys } = h);
  sel = null; promo = null;
  legalNow = C.legal(S);
  play('card');
  render(); save();
  setStatus(turnText(), '');
});
document.querySelectorAll('[data-side]').forEach((b) => {
  b.setAttribute('aria-pressed', String(b.dataset.side === mySide));
  b.addEventListener('click', () => {
    if (busy) return;
    mySide = b.dataset.side; store.set(SIDE_KEY, mySide);
    document.querySelectorAll('[data-side]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.side === mySide)));
    newGame();
  });
});
$('new-game').addEventListener('click', () => { if (!busy && !onlineOn) newGame(); });
$('new-game').classList.add('online-hide');
ol = online('chess', {
  reset: () => { newGame(); },
  apply: (t) => {
    const m = legalNow.find((x) => C.sqName(x.from) + C.sqName(x.to) + (x.promo ? x.promo.toLowerCase() : '') === t);
    if (m) doMove(m, true);
  },
  seatName: (s) => (s === 0 ? 'White' : 'Black'),
  over: () => over,
  onlineChanged: (on) => { onlineOn = on; document.body.classList.toggle('online', on); render(); }
});
$('again').addEventListener('click', newGame);
window.addEventListener('pagehide', save);
if (roomInLink || !resume()) newGame();
