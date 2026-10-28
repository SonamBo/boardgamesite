// FreeCell: every card face up. Move cards between eight columns using four free cells,
// and build each suit up from Ace to King on the foundations. Deals are numbered like the classic game.
import { store } from './site.js';
import { setStatus } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { clock, fmt, soloRecord, shake } from './solo.js';
import { Table, slotEl, placeSlot, suit, rank, isRed, suitIcon } from './cards.js';

const $ = (id) => document.getElementById(id);
const SAVE = 'bgs-fc-game';
const area = $('area');
const T = new Table(area);
const cellSlots = [0, 1, 2, 3].map(() => slotEl(area, 'click'));
const foundSlots = [0, 1, 2, 3].map((s) => slotEl(area, 'click', suitIcon(s)));
const colSlots = [0, 1, 2, 3, 4, 5, 6, 7].map(() => slotEl(area, 'click'));
const timer = clock($('time'));
const rec = soloRecord('bgs-fc-stats', { onPaint: paintRecord });

let S, history, moves, sel, started, done, dealNo, L = {};

// The classic numbered deals (1 to 32000).
function dealCards(n) {
  let seed = n;
  const d = Array.from({ length: 52 }, (_, i) => i);
  const order = [];
  for (let i = 52; i > 0; i--) {
    seed = (seed * 214013 + 2531011) % 2147483648;
    const j = (seed >> 16) % i;
    order.push(d[j]);
    d[j] = d[i - 1];
  }
  // classic card k: rank k/4, suit k%4 in the order clubs, diamonds, hearts, spades
  const SUIT = [3, 2, 1, 0];
  const cols = [[], [], [], [], [], [], [], []];
  order.forEach((k, i) => cols[i % 8].push(SUIT[k % 4] * 13 + Math.floor(k / 4)));
  return { cols, cells: [null, null, null, null], found: [0, 0, 0, 0] };
}
const clone = (s) => ({ cols: s.cols.map((c) => c.slice()), cells: s.cells.slice(), found: s.found.slice() });
const top = (col) => col[col.length - 1];
const fits = (c, onto) => onto == null || (rank(onto) === rank(c) + 1 && isRed(onto) !== isRed(c));
const toFound = (c) => S.found[suit(c)] === rank(c) - 1;
// How many cards can move at once, given free cells and empty columns (not counting the target column).
function maxMove(targetEmpty) {
  const free = S.cells.filter((x) => x == null).length;
  const empty = S.cols.filter((c) => !c.length).length - (targetEmpty ? 1 : 0);
  return (free + 1) * 2 ** Math.max(0, empty);
}
// Length of the ordered run at the bottom of a column, starting from index i.
const runFrom = (col, i) => { for (let k = i; k < col.length - 1; k++) if (!fits(col[k + 1], col[k])) return false; return true; };

// ---------- Moves: src = {type:'col'|'cell', i, k} ----------
function cardsOf(src) { return src.type === 'cell' ? [S.cells[src.i]] : S.cols[src.i].slice(src.k); }
function legalTo(src, dst) {
  const cs = cardsOf(src), c = cs[0];
  if (dst.type === 'found') return cs.length === 1 && suit(c) === dst.i && toFound(c);
  if (dst.type === 'cell') return cs.length === 1 && S.cells[dst.i] == null;
  if (dst.type === 'col') {
    if (src.type === 'col' && src.i === dst.i) return false;
    const col = S.cols[dst.i];
    if (!fits(c, top(col))) return false;
    return cs.length <= maxMove(!col.length);
  }
  return false;
}
function doMove(src, dst, quiet) {
  history.push(clone(S));
  const cs = cardsOf(src);
  if (src.type === 'cell') S.cells[src.i] = null; else S.cols[src.i].splice(src.k);
  if (dst.type === 'found') S.found[dst.i]++;
  else if (dst.type === 'cell') S.cells[dst.i] = cs[0];
  else S.cols[dst.i].push(...cs);
  moves++;
  if (!started) { started = true; timer.start(0); rec.played(); track('game_start', { game: 'freecell', deal: dealNo }); }
  if (!quiet) play(dst.type === 'found' ? 'found' : 'card');
}
// The best place for a card: foundation, then a column it builds on, then a free cell, then an empty column.
function bestDest(src) {
  const cs = cardsOf(src);
  const opts = [];
  if (cs.length === 1) opts.push({ type: 'found', i: suit(cs[0]) });
  S.cols.forEach((col, i) => { if (col.length) opts.push({ type: 'col', i }); });
  if (cs.length === 1 && src.type !== 'cell') S.cells.forEach((x, i) => { if (x == null) opts.push({ type: 'cell', i }); });
  S.cols.forEach((col, i) => { if (!col.length) opts.push({ type: 'col', i }); });
  return opts.filter((d) => legalTo(src, d));
}

// Cards that are safe to send up automatically: no lower card of the other colour still needs them.
function autoPlay() {
  let movedAny = false;
  for (let guard = 0; guard < 60; guard++) {
    let moved = false;
    const safe = (c) => {
      if (!toFound(c)) return false;
      const r = rank(c);
      if (r <= 2) return true;
      const opp = isRed(c) ? [0, 3] : [1, 2];
      return opp.every((s) => S.found[s] >= r - 1);
    };
    for (let i = 0; i < 4 && !moved; i++) { const c = S.cells[i]; if (c != null && safe(c)) { doMove({ type: 'cell', i }, { type: 'found', i: suit(c) }, true); moved = true; } }
    for (let i = 0; i < 8 && !moved; i++) { const c = top(S.cols[i]); if (c != null && safe(c)) { doMove({ type: 'col', i, k: S.cols[i].length - 1 }, { type: 'found', i: suit(c) }, true); moved = true; } }
    if (!moved) break;
    movedAny = true;
    history.pop(); // auto moves join the move before them for undo
  }
  if (movedAny) play('found');
}

// ---------- Layout ----------
function measure() {
  const W = area.clientWidth;
  L.gap = Math.max(4, Math.round(W * 0.014));
  L.cw = Math.floor(Math.min(104, (W - 7 * L.gap) / 8));
  L.ch = Math.round(L.cw * 1.4);
  L.left = Math.floor((W - (8 * L.cw + 7 * L.gap)) / 2);
  L.colY = L.ch + L.gap * 3;
  T.size(L.cw);
}
const colX = (i) => L.left + i * (L.cw + L.gap);
function render() {
  const destSet = sel ? bestDest(sel) : [];
  const isDest = (t, i) => destSet.some((d) => d.type === t && d.i === i);
  S.cells.forEach((c, i) => {
    placeSlot(cellSlots[i], colX(i), 0, L.cw, L.ch);
    cellSlots[i].classList.toggle('drop', isDest('cell', i));
    if (c != null) T.place(c, colX(i), 0, { up: true, z: 2, tab: true, sel: sel && sel.type === 'cell' && sel.i === i, label: ', free cell' });
  });
  S.found.forEach((n, s) => {
    placeSlot(foundSlots[s], colX(4 + s), 0, L.cw, L.ch);
    foundSlots[s].classList.toggle('drop', isDest('found', s));
    for (let r = 1; r <= 13; r++) {
      const c = s * 13 + r - 1;
      if (r <= n) T.place(c, colX(4 + s), 0, { up: true, z: r + 1 });
    }
  });
  let tallest = 0;
  S.cols.forEach((col, i) => {
    placeSlot(colSlots[i], colX(i), L.colY, L.cw, L.ch);
    colSlots[i].classList.toggle('drop', !col.length && isDest('col', i));
    const step = Math.min(Math.round(L.ch * 0.27), col.length > 1 ? Math.floor((Math.max(L.ch * 3.2, window.innerHeight * 0.62) - L.ch) / (col.length - 1)) : 99);
    col.forEach((c, k) => {
      const isSel = sel && sel.type === 'col' && sel.i === i && k >= sel.k;
      T.place(c, colX(i), L.colY + k * step, { up: true, z: 10 + k, sel: isSel, lit: k === col.length - 1 && col.length && isDest('col', i), tab: runFrom(col, k) });
    });
    tallest = Math.max(tallest, L.colY + (col.length ? (col.length - 1) * step : 0) + L.ch);
  });
  area.style.height = Math.max(tallest, L.colY + L.ch * 3) + 'px';
  $('moves').textContent = String(moves);
  $('undo').disabled = !history.length || done;
  $('deal').textContent = '#' + dealNo;
}

// ---------- Input ----------
function locate(id) {
  for (let i = 0; i < 4; i++) if (S.cells[i] === id) return { type: 'cell', i };
  for (let i = 0; i < 8; i++) { const k = S.cols[i].indexOf(id); if (k >= 0) return { type: 'col', i, k }; }
  return null;
}
function tryMove(src, dst) {
  if (!legalTo(src, dst)) {
    const cs = cardsOf(src);
    if (dst.type === 'col' && cs.length > maxMove(!S.cols[dst.i].length)) setStatus('Not enough free cells to move ' + cs.length + ' cards at once', 'neutral');
    return false;
  }
  doMove(src, dst);
  sel = null;
  autoPlay();
  after();
  return true;
}
area.addEventListener('click', (e) => {
  if (done) return;
  const id = T.idFrom(e);
  const slotHit = e.target.closest('.slot');
  // a destination?
  if (sel) {
    let dst = null;
    if (id != null) { const at = locate(id); if (at && at.type === 'col' && at.k === S.cols[at.i].length - 1) dst = { type: 'col', i: at.i }; if (at && at.type === 'cell') dst = null; if (S.found.some((n, s) => id === s * 13 + n - 1)) dst = { type: 'found', i: suit(id) }; }
    if (slotHit) {
      const ci = cellSlots.indexOf(slotHit), fi = foundSlots.indexOf(slotHit), ki = colSlots.indexOf(slotHit);
      if (ci >= 0) dst = { type: 'cell', i: ci }; if (fi >= 0) dst = { type: 'found', i: fi }; if (ki >= 0) dst = { type: 'col', i: ki };
    }
    const tappedSame = id != null && cardsOf(sel)[0] === id;
    if (dst && !tappedSame && !(dst.type === sel.type && dst.i === sel.i)) { if (tryMove(sel, dst)) return; }
    if (tappedSame) {
      const opts = bestDest(sel);
      if (opts.length) { tryMove(sel, opts[0]); return; }
      shake(T.els.get(id), play); sel = null; render(); return;
    }
  }
  if (id == null) { sel = null; render(); return; }
  const at = locate(id);
  if (!at) return;
  if (at.type === 'col' && !runFrom(S.cols[at.i], at.k)) { shake(T.els.get(id), play); setStatus('Only an ordered run of cards can move together', 'neutral'); return; }
  const src = at.type === 'col' ? { type: 'col', i: at.i, k: at.k } : { type: 'cell', i: at.i };
  const opts = bestDest(src);
  if (!opts.length) { shake(T.els.get(id), play); setStatus('That card has nowhere to go', 'neutral'); sel = null; render(); return; }
  // one place to go, or the foundation: just do it
  if (opts.length === 1 || opts[0].type === 'found') { tryMove(src, opts[0]); return; }
  sel = src;
  play('select');
  setStatus('Tap where it should go, or tap it again for the best spot', 'neutral');
  render();
});
area.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.pc')) { e.preventDefault(); e.target.click(); } });

function after() {
  render();
  if (S.found.every((n) => n === 13)) return win();
  setStatus('Deal #' + dealNo + ': build each suit from Ace to King', 'neutral');
  save();
}
function win() {
  done = true;
  timer.stop();
  const t = timer.elapsed();
  const record = rec.won('all', t);
  store.set(SAVE, null);
  render();
  setStatus('Solved!');
  $('result-text').textContent = 'Deal #' + dealNo + ' solved!';
  $('result-sub').textContent = moves + ' moves in ' + fmt(t) + '.' + (record ? ' A new best time!' : '');
  $('result').hidden = false;
  play('win', 0.1);
  track('game_end', { game: 'freecell', result: 'win', deal: dealNo, moves });
}
function paintRecord(stats, best) {
  $('record').textContent = (stats.won || 0) + ' of ' + (stats.played || 0) + ' deals solved' + (best.all ? ' · best time ' + fmt(best.all) : '');
}

function newGame(n) {
  dealNo = n || 1 + Math.floor(Math.random() * 32000);
  S = dealCards(dealNo); history = []; moves = 0; sel = null; started = false; done = false;
  timer.reset();
  $('result').hidden = true;
  T.hideAll();
  store.set(SAVE, null);
  render();
  setStatus('Deal #' + dealNo + ': build each suit from Ace to King', 'neutral');
}
function save() { if (started && !done) store.set(SAVE, { dealNo, S, moves, elapsed: timer.elapsed() }); }
function resume() {
  const g = store.get(SAVE, null);
  if (!g || !g.S || !Array.isArray(g.S.cols)) return false;
  dealNo = g.dealNo; S = g.S; moves = g.moves | 0; history = []; sel = null; started = true; done = false;
  timer.start(Number(g.elapsed) || 0);
  render();
  setStatus('Welcome back to deal #' + dealNo, 'neutral');
  return true;
}
window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { save(); if (timer.running) timer.stop(); }
  else if (started && !done && !timer.running) timer.start(timer.elapsed());
});

$('undo').addEventListener('click', () => { if (!history.length || done) return; S = history.pop(); moves++; sel = null; play('card'); T.hideAll(); render(); save(); });
$('new-game').addEventListener('click', () => { play('shuffle'); newGame(); });
$('again').addEventListener('click', () => { play('shuffle'); newGame(); });
$('pick-deal').addEventListener('click', () => {
  const v = prompt('Deal number (1 to 32000)', String(dealNo));
  const n = Math.floor(Number(v));
  if (n >= 1 && n <= 32000) { play('shuffle'); newGame(n); }
});
let raf = 0;
window.addEventListener('resize', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { measure(); render(); }); });
measure();
if (!resume()) newGame();
