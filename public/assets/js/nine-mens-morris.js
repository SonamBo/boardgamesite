// Nine Men's Morris: place your nine pieces, then move them along the lines. Three in a row (a mill)
// lets you remove an opponent's piece. Reduce them to two pieces, or leave them no move, to win.
// Draws: the same position three times with the same player to move, or 50 moves each with no piece removed.
import { store } from './site.js';
import { setStatus, levelSwitch, opponentSwitch, record, showResult, sideSwitch, movesFirst, animationSwitch, moveQueue, slide, fadeOut, popIn, showCaptures, hintButton } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { shake } from './solo.js';
import { wait } from './dice-ui.js';
import { online, roomInLink } from './online.js';

const $ = (id) => document.getElementById(id);
const score = record('morris');
const getLevel = levelSwitch('morris', () => {});
const getOpp = opponentSwitch('morris', () => newGame(), { you: 'You', cpu: 'Computer', p1: 'Gold', p2: 'Ivory' });
let onlineOn = roomInLink, ol = null;
const vsCpu = () => !onlineOn && getOpp() === 'cpu';
// Against the computer you move first (gold), second (ivory) or either at random.
const getSide = sideSwitch('morris', ['first', 'second', 'random'], () => newGame());
let me = 1;   // your colour against the computer in this game
let gameNo = 0;   // a computer move still waiting when a new game starts is dropped
const cpuTurnNow = () => vsCpu() && turn !== me;
animationSwitch();
const Q = moveQueue();   // moves animate one at a time
// Show hint: Easy, against the computer
const hint = hintButton({
  shown: () => vsCpu() && getLevel() === 'easy',
  find: () => {
    if (!humanTurn()) return null;
    const at = (i) => svg.querySelector('.pt[data-i="' + i + '"]');
    if (removing) {
      // the piece whose removal leaves you best placed
      let best = null, bv = -Infinity;
      removable(S.b, turn).forEach((t) => { const b = S.b.slice(); b[t] = 0; const v = evaluate({ b, hand: S.hand }, turn); if (v > bv) { bv = v; best = t; } });
      return [at(best)];
    }
    const m = cpuMove(S, me, 'medium');
    return [m.from != null ? at(m.from) : null, at(m.to)];
  }
});
const humanTurn = () => !over && !busy && !Q.busy() && (onlineOn ? ol.myTurn() : !cpuTurnNow());
function paintSides() {
  if (!vsCpu()) return;
  document.querySelector('[data-name="p1"]').textContent = me === 1 ? 'You' : 'Computer';
  document.querySelector('[data-name="p2"]').textContent = me === 2 ? 'You' : 'Computer';
}
const svg = $('nm-board');

const XY = [[0,0],[3,0],[6,0],[1,1],[3,1],[5,1],[2,2],[3,2],[4,2],[0,3],[1,3],[2,3],[4,3],[5,3],[6,3],[2,4],[3,4],[4,4],[1,5],[3,5],[5,5],[0,6],[3,6],[6,6]];
const MILLS = [[0,1,2],[3,4,5],[6,7,8],[9,10,11],[12,13,14],[15,16,17],[18,19,20],[21,22,23],[0,9,21],[3,10,18],[6,11,15],[1,4,7],[16,19,22],[8,12,17],[5,13,20],[2,14,23]];
const ADJ = XY.map(() => []);
MILLS.forEach(([a, b, c]) => { ADJ[a].push(b); ADJ[b].push(a, c); ADJ[c].push(b); });

// state: { b: [0|1|2 ×24], hand: [_, n1, n2], turn, removing }
const onBoard = (s, p) => s.b.filter((x) => x === p).length;
const inMill = (b, i) => MILLS.some((m) => m.includes(i) && m.every((j) => b[j] === b[i] && b[i]));
const phase = (s, p) => (s.hand[p] > 0 ? 'place' : onBoard(s, p) === 3 ? 'fly' : 'move');
function moves(s, p) {
  const out = [], ph = phase(s, p);
  if (ph === 'place') { s.b.forEach((x, i) => { if (!x) out.push({ to: i }); }); return out; }
  s.b.forEach((x, i) => {
    if (x !== p) return;
    const targets = ph === 'fly' ? s.b.map((y, j) => (y ? -1 : j)).filter((j) => j >= 0) : ADJ[i].filter((j) => !s.b[j]);
    targets.forEach((j) => out.push({ from: i, to: j }));
  });
  return out;
}
function removable(b, p) { // opponent pieces p can remove
  const o = 3 - p;
  const all = b.map((x, i) => (x === o ? i : -1)).filter((i) => i >= 0);
  const free = all.filter((i) => !inMill(b, i));
  return free.length ? free : all;
}
function apply(s, p, m) {
  const b = s.b.slice(), hand = s.hand.slice();
  if (m.from != null) b[m.from] = 0; else hand[p]--;
  b[m.to] = p;
  const mill = MILLS.some((ml) => ml.includes(m.to) && ml.every((j) => b[j] === p));
  if (mill && m.take != null) b[m.take] = 0;
  return { b, hand };
}
const lost = (s, p) => (s.hand[p] === 0 && onBoard(s, p) < 3) || (onBoard(s, p) + s.hand[p] >= 3 && !moves(s, p).length);

// ---------- The computer ----------
function fullMoves(s, p) { // moves with the capture chosen
  const out = [];
  for (const m of moves(s, p)) {
    const b = s.b.slice(); if (m.from != null) b[m.from] = 0; b[m.to] = p;
    if (MILLS.some((ml) => ml.includes(m.to) && ml.every((j) => b[j] === p))) removable(b, p).forEach((t) => out.push({ ...m, take: t }));
    else out.push(m);
  }
  return out;
}
function evaluate(s, p) {
  const o = 3 - p;
  if (lost(s, o)) return 10000;
  if (lost(s, p)) return -10000;
  let v = (onBoard(s, p) + s.hand[p] - onBoard(s, o) - s.hand[o]) * 100;
  v += (moves(s, p).length - moves(s, o).length) * 2;
  MILLS.forEach((m) => { const c = m.map((j) => s.b[j]); const mine = c.filter((x) => x === p).length, theirs = c.filter((x) => x === o).length; if (mine === 2 && !theirs) v += 12; if (theirs === 2 && !mine) v -= 12; });
  return v;
}
function search(s, p, depth, alpha, beta, me) {
  if (depth === 0 || lost(s, 1) || lost(s, 2)) return evaluate(s, me);
  const ms = fullMoves(s, p);
  if (!ms.length) return p === me ? -10000 : 10000;
  let best = p === me ? -Infinity : Infinity;
  for (const m of ms) {
    const v = search(apply(s, p, m), 3 - p, depth - 1, alpha, beta, me);
    if (p === me) { best = Math.max(best, v); alpha = Math.max(alpha, v); } else { best = Math.min(best, v); beta = Math.min(beta, v); }
    if (beta <= alpha) break;
  }
  return best;
}
function cpuMove(s, p, lvl = getLevel()) {
  const depth = { easy: 1, medium: 2, hard: 4 }[lvl];
  const ms = fullMoves(s, p);
  if (lvl === 'easy' && Math.random() < 0.35) return ms[Math.floor(Math.random() * ms.length)];
  let best = ms[0], bv = -Infinity;
  for (const m of ms) { const v = search(apply(s, p, m), 3 - p, depth - 1, -Infinity, Infinity, p) + Math.random(); if (v > bv) { bv = v; best = m; } }
  return best;
}

// ---------- Page ----------
const DRAW_AFTER = 100;   // half-moves with no piece removed (50 moves each)
const REPEATS = 3;
let S, turn, sel, removing, over, busy, started, last;
// quiet: half-moves since a piece was last removed; seen: how often each position has come up since then
let quiet, seen;
const posKey = () => S.b.join('') + S.hand.join(',') + turn;
// positions before each move, for Undo (vs the computer it takes back your move and its reply)
let history = [];
const snapshot = () => history.push({ b: S.b.slice(), hand: S.hand.slice(), turn, last, quiet, seen: { ...seen } });
// the move being made (online it's sent once any piece to remove has been picked): 'from-to', 'to' or with 'x<taken>'
let cur = null;
const token = (m, take) => (m.from != null ? m.from + '-' : '') + m.to + (take != null ? 'x' + take : '');
const undoBtn = $('undo');
function render() {
  let h = '<rect x="0" y="0" width="6" height="6" class="sq"/><rect x="1" y="1" width="4" height="4" class="sq"/><rect x="2" y="2" width="2" height="2" class="sq"/>';
  h += '<path d="M3 0V2M3 4V6M0 3H2M4 3H6" class="sq"/>';
  const canTake = removing ? removable(S.b, turn) : [];
  const ms = !removing && humanTurn() ? moves(S, turn) : [];
  XY.forEach(([x, y], i) => {
    const p = S.b[i];
    const target = sel != null ? ms.some((m) => m.from === sel && m.to === i) : phase(S, turn) === 'place' && ms.some((m) => m.to === i);
    h += '<g class="pt' + (target ? ' tgt' : '') + (canTake.includes(i) ? ' take' : '') + (sel === i ? ' sel' : '') + (last === i ? ' last' : '') + '" data-i="' + i + '" role="button" tabindex="0" aria-label="Point ' + (i + 1) + (p ? (p === 1 ? ', gold' : ', ivory') : ', empty') + '">' +
      '<circle cx="' + x + '" cy="' + y + '" r=".42" class="hitc"/><circle cx="' + x + '" cy="' + y + '" r=".12" class="spot"/>' +
      (p ? '<circle cx="' + x + '" cy="' + y + '" r=".32" class="pc' + p + '"/>' : '') + '</g>';
  });
  svg.innerHTML = h;
  $('hand1').textContent = S.hand[1] ? S.hand[1] + ' to place' : onBoard(S, 1) + ' on board';
  $('hand2').textContent = S.hand[2] ? S.hand[2] + ' to place' : onBoard(S, 2) + ' on board';
  // what each side has removed (both start with nine)
  showCaptures($('cap-you'), 9 - onBoard(S, 2) - S.hand[2], 'nm-ivory', 'Pieces gold has removed');
  showCaptures($('cap-cpu'), 9 - onBoard(S, 1) - S.hand[1], 'nm-gold', 'Pieces ivory has removed');
  $('row-you').classList.toggle('turn-you', turn === 1 && !over);
  $('row-cpu').classList.toggle('turn-cpu', turn === 2 && !over);
  undoBtn.disabled = busy || over || onlineOn || !(vsCpu() ? history.some((h) => h.turn === me) : history.length);
}
// ---------- Showing moves ----------
const pieceAt = (i) => svg.querySelector('.pt[data-i="' + i + '"] .pc1, .pt[data-i="' + i + '"] .pc2');
const spotAt = (i) => svg.querySelector('.pt[data-i="' + i + '"] .spot');
// Show a whole move by player p on the board as drawn: slide a moving or flying piece (further takes
// longer), or pop in a placed one, then fade the piece it removes. S is the same afterwards.
async function showMove(m, p, live) {
  if (m.from != null) {
    const [x1, y1] = XY[m.from], [x2, y2] = XY[m.to];
    await slide(pieceAt(m.from), [spotAt(m.to)], 150 + 45 * Math.hypot(x2 - x1, y2 - y1));
  }
  if (m.take == null || !live()) return;
  const keep = S;
  S = apply(S, p, m.from != null ? { from: m.from, to: m.to } : { to: m.to });
  render();
  if (m.from == null) popIn(pieceAt(m.to), 220);
  await fadeOut(pieceAt(m.take), 230, 160);
  S = keep;
}
const name = (p) => (onlineOn ? (p === ol.mySeat() + 1 ? 'You' : 'Your friend') : vsCpu() ? (p === me ? 'You' : 'The computer') : p === 1 ? 'Gold' : 'Ivory');
function prompt() {
  if (removing) return setStatus((vsCpu() && turn === me ? 'Mill! ' : '') + 'Pick a piece to remove', '');
  const ph = phase(S, turn);
  if (onlineOn && !ol.myTurn()) return setStatus('Waiting for your friend', 'cpu');
  const who = onlineOn ? 'Your turn' : vsCpu() ? (turn === me ? 'Your turn' : 'Computer’s turn') : name(turn) + '’s turn';
  setStatus(who + ': ' + (ph === 'place' ? 'place a piece' : ph === 'fly' ? 'three left, fly anywhere' : 'move a piece along a line'), (vsCpu() ? turn !== me : turn === 2) ? 'cpu' : '');
}

async function after(p, m, remote = false) {
  last = m.to;
  const millMade = MILLS.some((ml) => ml.includes(m.to) && ml.every((j) => S.b[j] === p));
  if (millMade && m.take == null) { removing = true; render(); prompt(); play('king'); return; }
  if (m.take != null) play('capture'); else play('place');
  removing = false;
  turn = 3 - p; sel = null;
  if (m.take != null) { quiet = 0; seen = {}; } else quiet++;
  const k = posKey();
  seen[k] = (seen[k] || 0) + 1;
  const end = lost(S, turn) ? 'won' : seen[k] >= REPEATS ? 'repeat' : quiet >= DRAW_AFTER ? 'quiet' : null;
  if (onlineOn && !remote && cur) ol.send(token(cur, m.take), turn - 1, !!end);
  if (end === 'won') return finish(p);
  if (end === 'repeat') return finishDraw('The same position came up three times.');
  if (end === 'quiet') return finishDraw('50 moves each with no piece removed.');
  render(); prompt();
  if (cpuTurnNow()) cpuTurn();
}
async function cpuTurn() {
  const g = gameNo;
  busy = true; render(); setStatus('Computer is thinking…', 'cpu'); await wait(550);
  if (g !== gameNo) return;
  const cpu = 3 - me;
  const cm = cpuMove(S, cpu);
  Q.run((live) => showMove(cm, cpu, live), () => {
    busy = false;
    snapshot(); cur = cm;
    S = apply(S, cpu, cm);
    after(cpu, cm);
    if (cm.from == null && cm.take == null) popIn(pieceAt(cm.to), 220);
  });
}

function tap(i) {
  if (!humanTurn()) return;
  if (!started) { started = true; track('game_start', { game: 'nine-mens-morris', opponent: getOpp() }); }
  if (removing) {
    if (!removable(S.b, turn).includes(i)) { setStatus('You can’t take a piece in a mill unless they’re all in mills', 'neutral'); return; }
    return Q.run(() => fadeOut(pieceAt(i), 230), () => {
      S.b[i] = 0;
      after(turn, { to: last, take: i });
    });
  }
  const ms = moves(S, turn);
  if (phase(S, turn) === 'place') {
    if (S.b[i]) return;
    snapshot(); cur = { to: i };
    S = apply(S, turn, { to: i });
    after(turn, { to: i });
    popIn(pieceAt(i), 220);
    return;
  }
  if (S.b[i] === turn) { sel = ms.some((m) => m.from === i) ? i : null; if (sel == null) shake(svg, play); else play('select'); return render(); }
  if (sel != null && ms.some((m) => m.from === sel && m.to === i)) {
    const m = { from: sel, to: i }, p = turn;
    sel = null;
    Q.run((live) => showMove(m, p, live), () => {
      snapshot(); cur = m; S = apply(S, p, m);
      after(p, m);
    });
  }
}

function finish(w) {
  over = true; render();
  const why = onBoard(S, 3 - w) < 3 ? 'is down to two pieces' : 'has no moves left';
  if (onlineOn) {
    const won = w === ol.mySeat() + 1;
    showResult(won ? 'win' : 'lose', won ? 'You win!' : 'Your friend wins', (won ? 'Your friend ' + why : 'You ' + why.replace('is', 'are').replace('has', 'have')) + '.');
    setStatus(won ? 'You win!' : 'Your friend wins', won ? '' : 'cpu');
    play(won ? 'win' : 'lose', 0.1);
    track('game_end', { game: 'nine-mens-morris', result: won ? 'win' : 'lose', mode: 'online' });
    return;
  }
  if (vsCpu()) {
    const won = w === me;
    score.add(won ? 'win' : 'lose');
    showResult(won ? 'win' : 'lose', won ? 'You won!' : 'The computer won', (won ? 'The computer ' : 'You ') + (won ? why : why.replace('is', 'are').replace('has', 'have')) + '.');
    play(won ? 'win' : 'lose', 0.1);
  } else { showResult('win', name(w) + ' wins!', name(3 - w) + ' ' + why + '.'); play('win', 0.1); }
  setStatus(name(w) + (w === me && vsCpu() ? ' win!' : ' wins!'), w !== me && vsCpu() ? 'cpu' : '');
  track('game_end', { game: 'nine-mens-morris', result: w === (vsCpu() ? me : 1) ? 'win' : 'lose' });
}

function finishDraw(why) {
  over = true; render();
  if (vsCpu()) score.add('draw');
  showResult('draw', 'It’s a draw', why);
  setStatus('It’s a draw', 'neutral');
  play('draw', 0.1);
  track('game_end', { game: 'nine-mens-morris', result: 'draw' });
}

function newGame() {
  S = { b: new Array(24).fill(0), hand: [0, 9, 9] }; turn = 1; sel = null; removing = false; over = false; busy = false; started = false; last = -1;
  quiet = 0; seen = {}; history = []; cur = null;
  gameNo++;
  Q.reset();
  hint.reset();
  me = movesFirst(getSide()) ? 1 : 2;
  $('result').hidden = true;
  paintSides();
  render(); prompt();
  if (cpuTurnNow()) cpuTurn();
}
svg.addEventListener('click', (e) => { const g = e.target.closest('.pt'); if (g) tap(Number(g.dataset.i)); });
svg.addEventListener('keydown', (e) => { const g = e.target.closest('.pt'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tap(Number(g.dataset.i)); } });
$('new-game').addEventListener('click', () => { if (!busy && !onlineOn) newGame(); });
$('again').addEventListener('click', () => { if (!onlineOn) newGame(); });
$('new-game').classList.add('online-hide');
$('again').classList.add('online-hide');
undoBtn.addEventListener('click', () => {
  if (busy || over || onlineOn || !history.length || Q.busy()) return;
  Q.reset();
  // vs the computer, take back your move and its reply
  let h = history.pop();
  while (vsCpu() && h.turn !== me && history.length) h = history.pop();
  if (vsCpu() && h.turn !== me) { history.push(h); return; }
  S = { b: h.b, hand: h.hand }; turn = h.turn; last = h.last; quiet = h.quiet; seen = h.seen;
  sel = null; removing = false; cur = null;
  play('card');
  render(); prompt();
});
undoBtn.classList.add('online-hide');
// Online with a friend: moves travel as 'from-to' (or just 'to' while placing), plus 'x<point>' for a removed piece
ol = online('nine-mens-morris', {
  reset: () => newGame(),
  apply: (t) => {
    const m = /^(?:(\d+)-)?(\d+)(?:x(\d+))?$/.exec(t);
    if (!m || over) return;
    const mv = { from: m[1] != null ? Number(m[1]) : null, to: Number(m[2]), take: m[3] != null ? Number(m[3]) : null };
    if (mv.from == null) delete mv.from;
    if (mv.take == null) delete mv.take;
    // it waits for any move still animating
    let p;
    Q.run((live) => { p = turn; return showMove(mv, p, live); }, () => {
      snapshot(); cur = mv;
      S = apply(S, p, mv);
      after(p, mv, true);
      if (mv.from == null && mv.take == null) popIn(pieceAt(mv.to), 220);
    });
  },
  seatName: (s) => (s === 0 ? 'Gold (first)' : 'Ivory'),
  over: () => over,
  onlineChanged: (on) => { onlineOn = on; document.body.classList.toggle('online', on); render(); prompt(); }
});
newGame();
void store;
