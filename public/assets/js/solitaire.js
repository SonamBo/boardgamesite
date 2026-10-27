// Klondike Solitaire page: tap a card to auto-move it, or drag it.
import * as S from './solitaire-engine.js';
import { store } from './site.js';
import { onProgressLoaded } from './store.js';
import { setStatus } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';

const SAVE = 'bgs-sol-game';
const DEFAULT_STATUS = 'Build each suit from Ace to King';

const $ = (id) => document.getElementById(id);
const area = $('area');
const table = $('table');
const statusEl = $('status');

let state, history, moves, started, won, startTime, timerId, finishing;
let drawMode = store.get('bgs-sol-draw', 1) === 3 ? 3 : 1;
const stats = store.get('bgs-sol-stats', { played: 0, won: 0, best: null });
const L = {};                 // layout numbers
const locOf = new Map();      // card → where it is right now

// ---------- Elements ----------
const cardEls = [];
for (let c = 0; c < 52; c++) {
  const el = document.createElement('div');
  const r = S.RANKS[S.rank(c) - 1], s = S.suit(c);
  const ix = '<span class="ix' + '%"><span>' + r + '</span><svg><use href="#suit-' + s + '"/></svg></span>';
  el.className = 'pc' + (S.isRed(c) ? ' red' : '');
  el.dataset.c = String(c);
  el.innerHTML = ix.replace('%', '') + '<svg class="pip"><use href="#suit-' + s + '"/></svg>' + ix.replace('%', ' br');
  area.appendChild(el);
  cardEls.push(el);
}
function slot(cls, html, tag = 'div') {
  const el = document.createElement(tag);
  el.className = 'slot ' + cls;
  el.innerHTML = html || '';
  area.appendChild(el);
  return el;
}
const RECYCLE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>';
const stockSlot = slot('stock', RECYCLE, 'button');
stockSlot.type = 'button';
stockSlot.setAttribute('aria-label', 'Draw from the deck');
const wasteSlot = slot('waste');
const foundSlots = [0, 1, 2, 3].map((s) => slot('found', '<svg viewBox="0 0 24 24" aria-hidden="true"><use href="#suit-' + s + '"/></svg>'));
const tabSlots = [0, 1, 2, 3, 4, 5, 6].map(() => slot('tab'));

// ---------- Layout ----------
function measure() {
  const W = area.clientWidth;
  L.gap = Math.max(4, Math.round(W * 0.014));
  L.cw = Math.floor(Math.min(110, (W - 6 * L.gap) / 7));
  L.ch = Math.round(L.cw * 1.4);
  L.left0 = Math.max(0, Math.floor((W - (7 * L.cw + 6 * L.gap)) / 2));
  L.fd = Math.round(L.ch * 0.11);
  L.fu = Math.round(L.ch * 0.27);
  L.tabY = L.ch + Math.round(L.gap * 2.5);
  L.fan = Math.round(L.cw * 0.24);
  table.style.setProperty('--cw', L.cw + 'px');
  const size = (el) => { el.style.width = L.cw + 'px'; el.style.height = L.ch + 'px'; };
  cardEls.forEach(size);
  [stockSlot, wasteSlot, ...foundSlots, ...tabSlots].forEach(size);
  const put = (el, col, y) => { el.style.left = x(col) + 'px'; el.style.top = y + 'px'; };
  put(stockSlot, 0, 0); put(wasteSlot, 1, 0);
  foundSlots.forEach((el, s) => put(el, 3 + s, 0));
  tabSlots.forEach((el, col) => put(el, col, L.tabY));
}
const x = (col) => L.left0 + col * (L.cw + L.gap);

// ---------- Render ----------
function place(c, left, top, z, up, loc) {
  const el = cardEls[c];
  el.style.left = left + 'px';
  el.style.top = top + 'px';
  el.style.zIndex = String(z);
  el.classList.toggle('back', !up);
  el.classList.toggle('face', up);
  locOf.set(c, loc);
  const movable = up && (loc.from === 'tab' || loc.top);
  el.tabIndex = movable ? 0 : -1;
  el.setAttribute('role', movable ? 'button' : 'img');
  el.setAttribute('aria-label', up ? S.cardName(c) : 'Face-down card');
}

function render() {
  locOf.clear();
  state.stock.forEach((c, i) => place(c, x(0), 0, 5 + i, false, { from: 'stock' }));
  const w = state.waste;
  const fanN = state.draw === 3 ? Math.min(3, w.length) : 1;
  w.forEach((c, i) => {
    const k = i - (w.length - fanN);
    place(c, x(1) + (k > 0 ? k * L.fan : 0), 0, 10 + i, true, { from: 'waste', top: i === w.length - 1 });
  });
  state.found.forEach((f, s) => f.forEach((c, i) => place(c, x(3 + s), 0, 10 + i, true, { from: 'found', suit: s, top: i === f.length - 1 })));
  let bottom = L.tabY + L.ch;
  state.tab.forEach((pile, col) => {
    let y = L.tabY;
    pile.forEach((card, idx) => {
      place(card.c, x(col), y, 10 + idx, card.up, { from: 'tab', col, idx });
      if (idx < pile.length - 1) y += card.up ? L.fu : L.fd;
    });
    bottom = Math.max(bottom, y + L.ch);
  });
  area.style.height = Math.max(bottom, L.tabY + L.ch * 2.6) + 'px';
  stockSlot.classList.toggle('empty', !state.stock.length);
  stockSlot.style.visibility = state.stock.length || state.waste.length ? 'visible' : 'hidden';
  $('moves').textContent = String(moves);
  $('undo').disabled = !history.length || won || finishing;
  $('finish').hidden = !S.canAutoFinish(state) || finishing || won;
}

// ---------- Moves ----------
function commit(next, sound) {
  history.push(state);
  state = next;
  moves++;
  if (sound) play(sound);
  if (statusEl.textContent !== DEFAULT_STATUS && !won) setStatus(DEFAULT_STATUS);
  if (!started) {
    started = true;
    startTime = Date.now();
    stats.played++;
    store.set('bgs-sol-stats', stats);
    timerId = setInterval(tick, 1000);
    track('game_start', { game: 'solitaire', draw: state.draw });
  }
  render();
  if (S.isWon(state)) onWin();
  else saveGame();
}

function draw() {
  if (won || finishing || !S.canDraw(state)) return;
  commit(S.drawCards(state), state.stock.length ? 'card' : 'shuffle');
}

function srcFor(loc) {
  if (loc.from === 'waste') return loc.top ? { from: 'waste' } : null;
  if (loc.from === 'found') return loc.top ? { from: 'found', suit: loc.suit } : null;
  if (loc.from === 'tab') return { from: 'tab', col: loc.col, idx: loc.idx };
  return null;
}

function shake(el) {
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
  play('error');
  setTimeout(() => el.classList.remove('shake'), 320);
}

function tapCard(c) {
  const loc = locOf.get(c);
  if (!loc) return;
  if (loc.from === 'stock') return draw();
  const src = srcFor(loc);
  if (!src || !S.cardsAt(state, src)) return;
  const dest = S.autoDest(state, src);
  if (dest) commit(S.move(state, src, dest), dest.to === 'found' ? 'found' : 'card');
  else shake(cardEls[c]);
}

// ---------- Pointer: tap or drag ----------
let drag = null;
area.addEventListener('pointerdown', (e) => {
  if (e.button > 0 || won || finishing) return;
  if (e.target.closest('.slot.stock')) { draw(); return; }
  const el = e.target.closest('.pc');
  if (!el) return;
  const c = Number(el.dataset.c);
  const loc = locOf.get(c);
  if (loc.from === 'stock') { draw(); return; }
  const src = srcFor(loc);
  const cards = src && el.classList.contains('face') ? S.cardsAt(state, src) : null;
  if (!cards) return;
  e.preventDefault();
  const els = cards.map((n) => cardEls[n]);
  drag = {
    c, src, els, moved: false, x0: e.clientX, y0: e.clientY,
    starts: els.map((n) => [parseFloat(n.style.left), parseFloat(n.style.top)])
  };
  try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
});
area.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
  if (!drag.moved && Math.hypot(dx, dy) < 6) return;
  drag.moved = true;
  drag.els.forEach((el, k) => {
    el.classList.add('dragging');
    el.style.left = drag.starts[k][0] + dx + 'px';
    el.style.top = drag.starts[k][1] + dy + 'px';
    el.style.zIndex = String(1000 + k);
  });
});
function endDrag(e, cancelled) {
  if (!drag) return;
  const d = drag;
  drag = null;
  d.els.forEach((el) => el.classList.remove('dragging'));
  if (cancelled) return render();
  if (!d.moved) return tapCard(d.c);
  const cx = d.starts[0][0] + (e.clientX - d.x0) + L.cw / 2;
  const cy = d.starts[0][1] + (e.clientY - d.y0) + L.ch / 2;
  const col = Math.max(0, Math.min(6, Math.floor((cx - L.left0 + L.gap / 2) / (L.cw + L.gap))));
  const dest = cy < L.tabY - L.gap ? (col >= 3 ? { to: 'found' } : null) : { to: 'tab', col };
  if (dest && S.canMove(state, d.src, dest)) commit(S.move(state, d.src, dest), dest.to === 'found' ? 'found' : 'card');
  else render();
}
area.addEventListener('pointerup', (e) => endDrag(e, false));
area.addEventListener('pointercancel', (e) => endDrag(e, true));

// Keyboard: Enter or Space on a card does the same as a tap.
area.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const el = e.target.closest('.pc');
  if (!el) return;
  e.preventDefault();
  tapCard(Number(el.dataset.c));
});
stockSlot.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); draw(); } });

// ---------- Timer, win, stats ----------
const fmt = (ms) => { const t = Math.floor(ms / 1000); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
function tick() { $('time').textContent = fmt(Date.now() - startTime); }
function paintRecord() {
  $('record').textContent = stats.won + ' of ' + stats.played + (stats.played === 1 ? ' game' : ' games') + ' won' +
    (stats.best ? ' · best time ' + fmt(stats.best) : '');
}
// An account's saved stats arrived after sign-in: show them.
onProgressLoaded(() => { Object.assign(stats, { played: 0, won: 0, best: null }, store.get('bgs-sol-stats', {})); paintRecord(); });
function onWin() {
  won = true;
  clearInterval(timerId);
  const t = Date.now() - startTime;
  tick();
  stats.won++;
  if (!stats.best || t < stats.best) stats.best = t;
  store.set('bgs-sol-stats', stats);
  paintRecord();
  setStatus('You won in ' + fmt(t) + '!');
  $('result-sub').textContent = moves + ' moves in ' + fmt(t) + '.';
  $('sol-result').hidden = false;
  store.set(SAVE, null);
  play('win', 0.15);
  track('game_end', { game: 'solitaire', result: 'win', draw: state.draw, seconds: Math.round(t / 1000) });
  render();
}

function autoFinish() {
  if (finishing) return;
  finishing = true;
  render();
  (function step() {
    const m = S.nextFinishMove(state);
    if (!m) { finishing = false; render(); return; }
    history.push(state);
    state = S.move(state, m.src, m.dest);
    moves++;
    play('found');
    render();
    if (S.isWon(state)) { finishing = false; onWin(); return; }
    setTimeout(step, 70);
  })();
}

function newGame() {
  clearInterval(timerId);
  state = S.deal(Math.random, drawMode);
  history = []; moves = 0; started = false; won = false; finishing = false;
  store.set(SAVE, null);
  $('time').textContent = '0:00';
  $('sol-result').hidden = true;
  setStatus(DEFAULT_STATUS);
  render();
}

// ---------- Save and resume ----------
function saveGame() {
  if (won || !started) return;
  store.set(SAVE, { state, history: history.slice(-150), moves, elapsed: Date.now() - startTime });
}
function validState(s) {
  if (!s || !Array.isArray(s.stock) || !Array.isArray(s.waste) || !Array.isArray(s.found) || !Array.isArray(s.tab)) return false;
  if (s.found.length !== 4 || s.tab.length !== 7) return false;
  const cards = [...s.stock, ...s.waste, ...s.found.flat(), ...s.tab.flat().map((x) => x && x.c)];
  return cards.length === 52 && new Set(cards).size === 52 && cards.every((c) => Number.isInteger(c) && c >= 0 && c < 52);
}
function resume() {
  const g = store.get(SAVE, null);
  if (!g || !validState(g.state) || S.isWon(g.state)) return false;
  state = g.state;
  history = Array.isArray(g.history) ? g.history.filter(validState) : [];
  moves = g.moves | 0;
  started = true; won = false; finishing = false;
  drawMode = state.draw === 3 ? 3 : 1;
  paintDraw();
  startTime = Date.now() - (Number(g.elapsed) || 0);
  tick();
  timerId = setInterval(tick, 1000);
  $('sol-result').hidden = true;
  setStatus('Welcome back. Your game is where you left it');
  render();
  return true;
}
// Keep the clock right if the page is closed or hidden.
window.addEventListener('pagehide', saveGame);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveGame(); });

function paintDraw() {
  document.querySelectorAll('[data-draw]').forEach((o) => o.setAttribute('aria-pressed', String(Number(o.dataset.draw) === drawMode)));
}

paintDraw();
document.querySelectorAll('[data-draw]').forEach((b) => {
  b.addEventListener('click', () => {
    const n = Number(b.dataset.draw);
    if (n === drawMode) return;
    drawMode = n;
    store.set('bgs-sol-draw', n);
    paintDraw();
    newGame();
  });
});
$('new-game').addEventListener('click', newGame);
$('again').addEventListener('click', newGame);
$('undo').addEventListener('click', () => {
  if (!history.length || won || finishing) return;
  state = history.pop();
  moves++;
  play('card');
  render();
  saveGame();
});
$('finish').addEventListener('click', autoFinish);

let resizeRaf = 0;
window.addEventListener('resize', () => {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => { measure(); render(); });
});

measure();
paintRecord();
if (!resume()) newGame();
