// Nine Men's Morris: place your nine pieces, then move them along the lines. Three in a row (a mill)
// lets you remove an opponent's piece. Reduce them to two pieces, or leave them no move, to win.
import { store } from './site.js';
import { setStatus, levelSwitch, opponentSwitch, record, showResult } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { shake } from './solo.js';
import { wait } from './dice-ui.js';

const $ = (id) => document.getElementById(id);
const score = record('morris');
const getLevel = levelSwitch('morris', () => {});
const getOpp = opponentSwitch('morris', () => newGame(), { you: 'You', cpu: 'Computer', p1: 'Gold', p2: 'Ivory' });
const vsCpu = () => getOpp() === 'cpu';
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
function cpuMove(s, p) {
  const lvl = getLevel(), depth = { easy: 1, medium: 2, hard: 4 }[lvl];
  const ms = fullMoves(s, p);
  if (lvl === 'easy' && Math.random() < 0.35) return ms[Math.floor(Math.random() * ms.length)];
  let best = ms[0], bv = -Infinity;
  for (const m of ms) { const v = search(apply(s, p, m), 3 - p, depth - 1, -Infinity, Infinity, p) + Math.random(); if (v > bv) { bv = v; best = m; } }
  return best;
}

// ---------- Page ----------
let S, turn, sel, removing, over, busy, started, last;
function render() {
  let h = '<rect x="0" y="0" width="6" height="6" class="sq"/><rect x="1" y="1" width="4" height="4" class="sq"/><rect x="2" y="2" width="2" height="2" class="sq"/>';
  h += '<path d="M3 0V2M3 4V6M0 3H2M4 3H6" class="sq"/>';
  const canTake = removing ? removable(S.b, turn) : [];
  const ms = !removing && !over && !busy && !(vsCpu() && turn === 2) ? moves(S, turn) : [];
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
  $('row-you').classList.toggle('turn-you', turn === 1 && !over);
  $('row-cpu').classList.toggle('turn-cpu', turn === 2 && !over);
}
const name = (p) => (vsCpu() ? (p === 1 ? 'You' : 'The computer') : p === 1 ? 'Gold' : 'Ivory');
function prompt() {
  if (removing) return setStatus((vsCpu() && turn === 1 ? 'Mill! ' : '') + 'Pick a piece to remove', '');
  const ph = phase(S, turn);
  const who = vsCpu() ? (turn === 1 ? 'Your turn' : 'Computer’s turn') : name(turn) + '’s turn';
  setStatus(who + ': ' + (ph === 'place' ? 'place a piece' : ph === 'fly' ? 'three left, fly anywhere' : 'move a piece along a line'), turn === 2 ? 'cpu' : '');
}

async function after(p, m) {
  last = m.to;
  const millMade = MILLS.some((ml) => ml.includes(m.to) && ml.every((j) => S.b[j] === p));
  if (millMade && m.take == null) { removing = true; render(); prompt(); play('king'); return; }
  if (m.take != null) play('capture'); else play('place');
  removing = false;
  turn = 3 - p; sel = null;
  if (lost(S, turn)) return finish(p);
  render(); prompt();
  if (vsCpu() && turn === 2) {
    busy = true; render(); await wait(600); busy = false;
    const cm = cpuMove(S, 2);
    S = apply(S, 2, cm);
    after(2, cm);
  }
}

function tap(i) {
  if (over || busy || (vsCpu() && turn === 2)) return;
  if (!started) { started = true; track('game_start', { game: 'nine-mens-morris', opponent: getOpp() }); }
  if (removing) {
    if (!removable(S.b, turn).includes(i)) { setStatus('You can’t take a piece in a mill unless they’re all in mills', 'neutral'); return; }
    S.b[i] = 0;
    return after(turn, { to: last, take: i });
  }
  const ms = moves(S, turn);
  if (phase(S, turn) === 'place') {
    if (S.b[i]) return;
    S = apply(S, turn, { to: i });
    return after(turn, { to: i });
  }
  if (S.b[i] === turn) { sel = ms.some((m) => m.from === i) ? i : null; if (sel == null) shake(svg, play); else play('select'); return render(); }
  if (sel != null && ms.some((m) => m.from === sel && m.to === i)) { const m = { from: sel, to: i }; S = apply(S, turn, m); sel = null; return after(turn, m); }
}

function finish(w) {
  over = true; render();
  const why = onBoard(S, 3 - w) < 3 ? 'is down to two pieces' : 'has no moves left';
  if (vsCpu()) {
    const won = w === 1;
    score.add(won ? 'win' : 'lose');
    showResult(won ? 'win' : 'lose', won ? 'You won!' : 'The computer won', (won ? 'The computer ' : 'You ') + (won ? why : why.replace('is', 'are').replace('has', 'have')) + '.');
    play(won ? 'win' : 'lose', 0.1);
  } else { showResult('win', name(w) + ' wins!', name(3 - w) + ' ' + why + '.'); play('win', 0.1); }
  setStatus(name(w) + (w === 1 && vsCpu() ? ' win!' : ' wins!'), w === 2 && vsCpu() ? 'cpu' : '');
  track('game_end', { game: 'nine-mens-morris', result: w === 1 ? 'win' : 'lose' });
}

function newGame() {
  S = { b: new Array(24).fill(0), hand: [0, 9, 9] }; turn = 1; sel = null; removing = false; over = false; busy = false; started = false; last = -1;
  $('result').hidden = true;
  render(); prompt();
}
svg.addEventListener('click', (e) => { const g = e.target.closest('.pt'); if (g) tap(Number(g.dataset.i)); });
svg.addEventListener('keydown', (e) => { const g = e.target.closest('.pt'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tap(Number(g.dataset.i)); } });
$('new-game').addEventListener('click', () => { if (!busy) newGame(); });
$('again').addEventListener('click', newGame);
newGame();
void store;
