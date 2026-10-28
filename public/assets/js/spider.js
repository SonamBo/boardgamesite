// Spider Solitaire: build runs from King down to Ace in the same suit to clear them away. Two decks, ten columns.
import { store } from './site.js';
import { setStatus, levelSwitch } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { clock, fmt, soloRecord, shake } from './solo.js';
import { Table, slotEl, placeSlot, suit, rank, shuffle } from './cards.js';

const $ = (id) => document.getElementById(id);
const SAVE = 'bgs-spider-game';
const LEVEL_NAME = { easy: '1 suit', medium: '2 suits', hard: '4 suits' };
const area = $('area');
const T = new Table(area, { ids: Array.from({ length: 104 }, (_, i) => i) });
const colSlots = Array.from({ length: 10 }, () => slotEl(area, 'click'));
const stockSlot = slotEl(area, 'click stock');
const timer = clock($('time'));
const rec = soloRecord('bgs-spider-stats', { onPaint: paintRecord });

let S, history, moves, sel, started, done, level, L = {};
// card id → its face: with fewer suits, the 104 cards are spades (and hearts) only
const face = (id) => {
  const r = id % 13;
  const n = level === 'easy' ? 1 : level === 'medium' ? 2 : 4;
  const s = [0, 1, 2, 3][Math.floor(id / 13) % n];
  return s * 13 + r;
};

function deal() {
  const ids = shuffle(Array.from({ length: 104 }, (_, i) => i));
  const cols = Array.from({ length: 10 }, () => []);
  let k = 0;
  for (let i = 0; i < 54; i++) cols[i % 10].push({ id: ids[k++], up: false });
  cols.forEach((c) => { c[c.length - 1].up = true; });
  return { cols, stock: ids.slice(54), done: 0 };
}
const clone = (s) => ({ cols: s.cols.map((c) => c.map((x) => ({ ...x }))), stock: s.stock.slice(), done: s.done });
// A movable run: face up, descending, same suit, from index k to the end.
function movable(col, k) {
  if (!col[k] || !col[k].up) return false;
  for (let j = k; j < col.length - 1; j++) {
    const a = face(col[j].id), b = face(col[j + 1].id);
    if (suit(a) !== suit(b) || rank(a) !== rank(b) + 1) return false;
  }
  return true;
}
const canDrop = (cardId, col) => !col.length || rank(face(col[col.length - 1].id)) === rank(face(cardId)) + 1;

function move(from, k, to) {
  history.push(clone(S));
  const run = S.cols[from].splice(k);
  S.cols[to].push(...run);
  moves++;
  if (!started) { started = true; timer.start(0); rec.played(); track('game_start', { game: 'spider', level }); }
  play('card');
  settle();
}
// flip new top cards and clear any complete King-to-Ace runs
function settle() {
  S.cols.forEach((col) => {
    if (col.length >= 13) {
      const k = col.length - 13;
      if (rank(face(col[k].id)) === 13 && movable(col, k)) { col.splice(k); S.done++; play('king'); }
    }
    if (col.length && !col[col.length - 1].up) col[col.length - 1].up = true;
  });
}
function dealRow() {
  if (!S.stock.length || done) return;
  if (S.cols.some((c) => !c.length)) { setStatus('Fill every column before dealing more cards', 'neutral'); shake(stockSlot, play); return; }
  history.push(clone(S));
  S.cols.forEach((c) => c.push({ id: S.stock.pop(), up: true }));
  moves++;
  if (!started) { started = true; timer.start(0); rec.played(); }
  play('shuffle');
  settle();
  after();
}

// best place for a run: a same-suit card one higher, then any card one higher, then an empty column
function bestDest(from, k) {
  const id = S.cols[from][k].id;
  const opts = [];
  S.cols.forEach((col, i) => {
    if (i === from || !col.length || !canDrop(id, col)) return;
    opts.push({ i, w: suit(face(col[col.length - 1].id)) === suit(face(id)) ? 3 : 2 });
  });
  if (k > 0) S.cols.forEach((col, i) => { if (i !== from && !col.length) opts.push({ i, w: 1 }); });
  return opts.sort((a, b) => b.w - a.w).map((o) => o.i);
}

// ---------- Layout ----------
function measure() {
  const W = area.clientWidth;
  L.gap = Math.max(3, Math.round(W * 0.01));
  L.cw = Math.floor(Math.min(96, (W - 9 * L.gap) / 10));
  L.ch = Math.round(L.cw * 1.4);
  L.left = Math.floor((W - (10 * L.cw + 9 * L.gap)) / 2);
  L.top = L.ch + L.gap * 3;
  T.size(L.cw);
}
const colX = (i) => L.left + i * (L.cw + L.gap);
function render() {
  T.hideAll();
  // stock (top left) and completed runs (top right)
  placeSlot(stockSlot, colX(0), 0, L.cw, L.ch);
  stockSlot.innerHTML = S.stock.length ? '' : '';
  const piles = Math.ceil(S.stock.length / 10);
  for (let p = 0; p < piles; p++) T.place(S.stock[p * 10], colX(0) + p * Math.round(L.cw * 0.12), 0, { up: false, z: 2 + p });
  stockSlot.setAttribute('aria-label', 'Deal ' + Math.min(10, S.stock.length) + ' more cards (' + piles + ' deals left)');
  $('runs').textContent = S.done + ' / 8';
  const dests = sel ? bestDest(sel.i, sel.k) : [];
  let tallest = 0;
  S.cols.forEach((col, i) => {
    placeSlot(colSlots[i], colX(i), L.top, L.cw, L.ch);
    colSlots[i].classList.toggle('drop', !col.length && dests.includes(i));
    const down = col.filter((x) => !x.up).length, up = col.length - down;
    const room = Math.max(L.ch * 3.4, window.innerHeight * 0.66) - L.ch;
    const fd = Math.round(L.ch * 0.08);
    const fu = up > 1 ? Math.min(Math.round(L.ch * 0.25), Math.floor((room - down * fd) / (up - 1))) : 0;
    let y = L.top;
    col.forEach((x, k) => {
      const f = face(x.id);
      T.els.get(x.id).className = 'pc' + ((suit(f) === 1 || suit(f) === 2) ? ' red' : '');
      setFace(x.id, f);
      T.place(x.id, colX(i), y, { up: x.up, z: 10 + k, sel: sel && sel.i === i && k >= sel.k, lit: k === col.length - 1 && dests.includes(i), tab: x.up && movable(col, k) });
      y += x.up ? fu : fd;
    });
    tallest = Math.max(tallest, y - (col.length ? (col[col.length - 1].up ? fu : fd) : 0) + L.ch);
  });
  area.style.height = Math.max(tallest, L.top + L.ch * 3) + 'px';
  $('moves').textContent = String(moves);
  $('undo').disabled = !history.length || done;
}
// cards change face depending on the number of suits, so draw the face when needed
const drawn = new Map();
function setFace(id, f) {
  if (drawn.get(id) === f) return;
  drawn.set(id, f);
  const el = T.els.get(id);
  const r = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'][rank(f) - 1], s = suit(f);
  const ix = '<span class="ix%"><span>' + r + '</span><svg><use href="#suit-' + s + '"/></svg></span>';
  el.innerHTML = ix.replace('%', '') + '<svg class="pip"><use href="#suit-' + s + '"/></svg>' + ix.replace('%', ' br');
}

// ---------- Input ----------
function locate(id) { for (let i = 0; i < 10; i++) { const k = S.cols[i].findIndex((x) => x.id === id); if (k >= 0) return { i, k }; } return null; }
area.addEventListener('click', (e) => {
  if (done) return;
  if (e.target.closest('.stock') || (T.idFrom(e) != null && S.stock.includes(T.idFrom(e)))) { sel = null; dealRow(); return; }
  const id = T.idFrom(e);
  const slotI = colSlots.indexOf(e.target.closest('.slot'));
  if (sel) {
    let to = slotI >= 0 ? slotI : null;
    if (id != null) { const at = locate(id); if (at && at.k === S.cols[at.i].length - 1 && at.i !== sel.i) to = at.i; }
    if (to != null && to !== sel.i && canDrop(S.cols[sel.i][sel.k].id, S.cols[to]) && !(S.cols[to].length === 0 && sel.k === 0)) { const s0 = sel; sel = null; move(s0.i, s0.k, to); return after(); }
    if (id != null && locate(id) && locate(id).i === sel.i && locate(id).k === sel.k) {
      const d = bestDest(sel.i, sel.k);
      const s0 = sel; sel = null;
      if (d.length) { move(s0.i, s0.k, d[0]); return after(); }
      shake(T.els.get(id), play); return render();
    }
  }
  if (id == null) { sel = null; return render(); }
  const at = locate(id);
  if (!at || !S.cols[at.i][at.k].up) return;
  if (!movable(S.cols[at.i], at.k)) { shake(T.els.get(id), play); setStatus('Only a same-suit run in order can move together', 'neutral'); return; }
  const d = bestDest(at.i, at.k);
  if (!d.length) { shake(T.els.get(id), play); setStatus('No place to put that', 'neutral'); sel = null; return render(); }
  // one obvious place: move it
  const strong = d.filter((i) => S.cols[i].length);
  if (d.length === 1 || strong.length === 1) { move(at.i, at.k, d.length === 1 ? d[0] : strong[0]); return after(); }
  sel = at;
  play('select');
  setStatus('Tap where it should go, or tap it again for the best spot', 'neutral');
  render();
});
area.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.pc')) { e.preventDefault(); e.target.click(); } });

function after() {
  render();
  if (S.done === 8) return win();
  setStatus(LEVEL_NAME[level] + ': build King to Ace in one suit', 'neutral');
  save();
}
function win() {
  done = true;
  timer.stop();
  const t = timer.elapsed();
  const record = rec.won(level, t);
  store.set(SAVE, null);
  setStatus('All eight runs cleared!');
  $('result-text').textContent = 'You won!';
  $('result-sub').textContent = LEVEL_NAME[level] + ', ' + moves + ' moves in ' + fmt(t) + '.' + (record ? ' A new best time!' : '');
  $('result').hidden = false;
  play('win', 0.1);
  track('game_end', { game: 'spider', result: 'win', level, moves });
}
function paintRecord(stats, best) {
  const parts = [(stats.won || 0) + ' of ' + (stats.played || 0) + ' games won'];
  Object.keys(LEVEL_NAME).forEach((l) => { if (best[l]) parts.push(LEVEL_NAME[l] + ' best ' + fmt(best[l])); });
  $('record').textContent = parts.join(' · ');
}
function newGame() {
  S = deal(); history = []; moves = 0; sel = null; started = false; done = false;
  timer.reset();
  $('result').hidden = true;
  store.set(SAVE, null);
  render();
  setStatus(LEVEL_NAME[level] + ': build King to Ace in one suit', 'neutral');
}
function save() { if (started && !done) store.set(SAVE, { level, S, moves, elapsed: timer.elapsed() }); }
function resume() {
  const g = store.get(SAVE, null);
  if (!g || g.level !== level || !g.S) return false;
  S = g.S; moves = g.moves | 0; history = []; sel = null; started = true; done = false;
  timer.start(Number(g.elapsed) || 0);
  render();
  setStatus('Welcome back. Your game is where you left it', 'neutral');
  return true;
}
window.addEventListener('pagehide', save);
$('undo').addEventListener('click', () => { if (!history.length || done) return; S = history.pop(); moves++; sel = null; play('card'); render(); save(); });
$('new-game').addEventListener('click', () => { play('shuffle'); newGame(); });
$('again').addEventListener('click', () => { play('shuffle'); newGame(); });
let raf = 0;
window.addEventListener('resize', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { measure(); render(); }); });
const getLevel = levelSwitch('spider', (l) => { level = l; newGame(); });
level = getLevel();
measure();
if (!resume()) newGame();
