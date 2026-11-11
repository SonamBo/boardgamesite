// Shared bits for game pages: status line, result panel, computer level switch, win/loss record.
import { store } from './site.js';
import { onProgressLoaded } from './store.js';

const $ = (id) => document.getElementById(id);

export const MASCOT = {
  win: '/assets/img/fox-trophy.webp',
  lose: '/assets/img/fox-shrug.webp',
  draw: '/assets/img/fox-three.webp'
};

export function setStatus(text, kind) {
  const el = $('status');
  el.textContent = text;
  el.className = 'status' + (kind ? ' ' + kind : '');
}

export function showResult(kind, text, sub) {
  // a game against the computer where hints were used says so (the record counts it as usual)
  if (hintsUsed) sub = (sub ? sub + ' ' : '') + (hintsUsed === 1 ? '1 hint used.' : hintsUsed + ' hints used.');
  $('result').hidden = false;
  $('result-img').src = MASCOT[kind];
  $('result-text').textContent = text;
  $('result-sub').textContent = sub || '';
  $('result-sub').hidden = !sub;
}
export function hideResult() { $('result').hidden = true; }

export function setTurn(who) {
  $('row-you')?.classList.toggle('turn-you', who === 'you');
  $('row-cpu')?.classList.toggle('turn-cpu', who === 'cpu');
}

// Easy / Medium / Hard switch, remembered per game.
export function levelSwitch(gameKey, onChange) {
  const key = 'bgs-' + gameKey + '-level';
  let level = store.get(key, 'medium');
  const buttons = [...document.querySelectorAll('[data-level]')];
  const paint = () => buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.level === level)));
  buttons.forEach((b) => b.addEventListener('click', async () => {
    if (b.dataset.level === level) return;
    // a level change that starts a new game asks first if a game is under way
    if (onChange && !(await confirmNewGame())) return;
    level = b.dataset.level;
    store.set(key, level);
    paint();
    if (onChange) onChange(level);
  }));
  paint();
  return () => level;
}

// Win / loss / draw record, remembered per game. { draws: false } for games that can't end in a draw (Go, Hex…).
export function record(gameKey, { draws = true } = {}) {
  const key = 'bgs-' + gameKey + '-score';
  const score = store.get(key, { w: 0, l: 0, d: 0 });
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const paint = () => {
    const el = $('record');
    if (el) el.textContent = plural(score.w, 'win', 'wins') + ' · ' + plural(score.l, 'loss', 'losses') + (draws ? ' · ' + plural(score.d, 'draw', 'draws') : '');
  };
  paint();
  // An account's saved record arrived after sign-in: show it.
  onProgressLoaded(() => { Object.assign(score, { w: 0, l: 0, d: 0 }, store.get(key, {})); paint(); });
  return {
    add(result) {
      if (result === 'win') score.w++;
      if (result === 'lose') score.l++;
      if (result === 'draw') score.d++;
      store.set(key, score);
      paint();
    }
  };
}

// ---------- Show hint (Easy, against the computer) ----------
// A button beside Undo. shown(): whether hints are on offer (Easy, against the computer, not online).
// find(): the elements to light up for a good move, a message to show instead, or null when it isn't
// your turn. Hints don't change the record, but the result says how many were used.
let hintsUsed = 0;
export const hintCount = () => hintsUsed;
const HINT_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.1V16h5v-.1c0-.8.4-1.6 1.1-2.1A6 6 0 0 0 12 3z"/></svg>';
export function hintButton({ shown, find }) {
  const undo = $('undo');
  if (!undo || $('hint')) return { reset() {}, paint() {} };
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'hint';
  btn.className = undo.className.replace(/\bonline-hide\b/, '').trim() + ' online-hide';
  btn.innerHTML = (undo.classList.contains('tool-btn') ? HINT_ICON : '') + 'Show hint';
  undo.after(btn);
  let lit = [], timer = 0;
  const unlight = () => { lit.forEach((el) => el.classList.remove('hinted')); lit = []; };
  const paint = () => { btn.hidden = !shown(); };
  document.addEventListener('click', (e) => { if (e.target.closest('[data-level], [data-opponent]')) setTimeout(paint); });
  btn.addEventListener('click', () => {
    const got = find();
    if (got == null) { setStatus('Hints are for your turn', 'neutral'); return; }
    hintsUsed++;
    unlight(); clearTimeout(timer);
    if (typeof got === 'string') { setStatus(got, 'neutral'); return; }
    lit = got.filter(Boolean);
    lit.forEach((el) => el.classList.add('hinted'));
    setStatus('Hint: try the highlighted move', 'neutral');
    timer = setTimeout(unlight, 3000);
  });
  setTimeout(paint);   // once the game script has set itself up
  return { reset() { hintsUsed = 0; unlight(); paint(); }, paint };
}

// ---------- Move list, and a replay once the game is over ----------
// A "Moves" box under the players card. set(names) shows the moves so far (call it after every move);
// end() offers the replay, stepping back and forward through the game: show(k) draws the position after
// k moves, and show(null) the game as it ended. reset() for a new game.
export function moveHistory({ show }) {
  const players = document.querySelector('[data-max-root] .panel .players');
  if (!players) return { set() {}, end() {}, reset() {}, replaying: () => false };
  const box = document.createElement('div');
  box.className = 'panel-box card mh';
  box.innerHTML = '<p class="seg-label" style="margin:0">Moves</p><ol class="cs-moves mh-list" aria-label="Moves so far"></ol>' +
    '<div class="mh-replay" hidden><p class="seg-label" style="margin:0">Replay</p><div class="mh-row">' +
    '<button type="button" class="tool-btn" data-mh="-1"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>Back</button>' +
    '<span class="mh-at" aria-live="polite"></span>' +
    '<button type="button" class="tool-btn" data-mh="1">Forward<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button></div></div>';
  players.after(box);
  const list = box.querySelector('ol'), bar = box.querySelector('.mh-replay'), atEl = box.querySelector('.mh-at');
  let names = [], at = null;   // at: the move being shown in the replay (null: not replaying)
  function paint() {
    let h = '';
    for (let k = 0; k < names.length; k += 2) {
      const cell = (j) => (names[j] == null ? '' : '<button type="button" class="mh-mv' + (at != null && j === at - 1 ? ' on' : '') + '" data-k="' + (j + 1) + '"' + (at == null ? ' tabindex="-1" disabled' : '') + '>' + names[j] + '</button>');
      h += '<li><span>' + (k / 2 + 1) + '.</span> ' + cell(k) + ' ' + cell(k + 1) + '</li>';
    }
    list.innerHTML = h;
    if (at == null) list.scrollTop = list.scrollHeight;
    else list.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
    bar.hidden = at == null;
    if (at != null) {
      atEl.textContent = at === 0 ? 'Start' : 'Move ' + at + ' of ' + names.length;
      bar.querySelector('[data-mh="-1"]').disabled = at === 0;
      bar.querySelector('[data-mh="1"]').disabled = at === names.length;
    }
  }
  const go = (k) => { at = Math.max(0, Math.min(names.length, k)); paint(); show(at === names.length ? null : at); };
  bar.addEventListener('click', (e) => { const b = e.target.closest('[data-mh]'); if (b) go(at + Number(b.dataset.mh)); });
  list.addEventListener('click', (e) => { const b = e.target.closest('.mh-mv'); if (b && at != null) go(Number(b.dataset.k)); });
  box.addEventListener('keydown', (e) => { if (at != null && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); go(at + (e.key === 'ArrowLeft' ? -1 : 1)); } });
  return {
    set(next) { if (at != null) return; if (next.length !== names.length || next.some((x, k) => x !== names[k])) { names = next.slice(); paint(); } },
    end() { if (names.length) { at = names.length; paint(); } },
    reset() { const was = at != null; at = null; names = []; paint(); if (was) show(null); },
    replaying: () => at != null && at !== names.length
  };
}

// ---------- Resume a saved game, or start a new one ----------
// A card over the board, which shows the saved game behind it: "Resume your game? Computer, Medium, you
// play black" with Resume game / New game. Resolves true to resume.
export const modeName = (friend, level, extra = '') => (friend ? '2 players' : 'Computer, ' + level[0].toUpperCase() + level.slice(1) + (extra ? ', ' + extra : ''));
// A question in a card over the board (the style of the Resume card). Resolves true for the first button.
function askCard({ title, text, detail = '', yes, no, focusNo = false, closeOn = null }) {
  return new Promise((done) => {
    const col = document.querySelector('[data-max-root] .board-col');
    if (!col) return done(true);
    if (getComputedStyle(col).position === 'static') col.style.position = 'relative';
    const card = document.createElement('div');
    card.className = 'resume-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-label', title);
    card.innerHTML = '<div class="card"><p class="big"></p><p class="text-2"><span></span>' + (detail ? '<br><b></b>' : '') + '</p>' +
      '<div class="resume-btns"><button type="button" class="btn btn-gold raised" data-r="1"></button><button type="button" class="btn btn-outline" data-r="0"></button></div></div>';
    card.querySelector('.big').textContent = title;
    card.querySelector('.text-2 span').textContent = text;
    if (detail) card.querySelector('b').textContent = detail;
    card.querySelector('[data-r="1"]').textContent = yes;
    card.querySelector('[data-r="0"]').textContent = no;
    col.appendChild(card);
    card.querySelector(focusNo ? '[data-r="0"]' : '[data-r="1"]').focus({ preventScroll: true });
    const close = (ok) => { card.remove(); document.removeEventListener('click', other, true); document.removeEventListener('keydown', esc); done(ok); };
    card.addEventListener('click', (e) => { const b = e.target.closest('[data-r]'); if (b) close(b.dataset.r === '1'); });
    const esc = (e) => { if (e.key === 'Escape') close(false); };
    document.addEventListener('keydown', esc);
    const other = (e) => { if (closeOn && e.target.closest(closeOn)) setTimeout(() => close(false)); };
    document.addEventListener('click', other, true);
  });
}
let resuming = false;
export function askResume(what) {
  resuming = true;
  // choosing another opponent, side or board, or New game, answers "New game"
  return askCard({ title: 'Welcome back', text: 'Resume your game?', detail: what, yes: 'Resume game', no: 'New game',
    closeOn: '[data-opponent], [data-side], [data-hsize], [data-dsize], [data-hswap], #new-game' })
    .then((ok) => { resuming = false; return ok; });
}

// ---------- Changing a setting mid-game ----------
// A game tells game-ui whether it's under way (a move made, not finished); a setting that would start a new
// game then asks first. Cancel keeps the game and the setting as they were.
let inProgress = () => false;
export function gameInProgress(fn) { inProgress = fn; }
export function confirmNewGame() {
  let busy = false;
  try { busy = !resuming && !!inProgress(); } catch (e) { busy = false; }
  if (!busy) return Promise.resolve(true);
  return askCard({ title: 'Start a new game?', text: 'Your current game will be lost.', yes: 'New game', no: 'Cancel', focusNo: true });
}

// ---------- Tap to confirm (boards with small points: Hex, Dots and Boxes, Five in a Row) ----------
// With it on, the first tap shows where your stone or line would go and the second tap on the same spot
// places it. Until you choose, it's on for touch screens when large() says the board is a big one (11×11 Hex,
// 6×6 Dots and Boxes, 15×15 Five in a Row) and off otherwise; your choice is remembered (bgs-tap-confirm).
const CONFIRM_KEY = 'bgs-tap-confirm';
export function tapConfirm({ large = () => true } = {}) {
  const panel = document.querySelector('[data-max-root] .panel');
  const chosen = () => store.get(CONFIRM_KEY, null);
  const isOn = () => (chosen() ? chosen() === 'on' : matchMedia('(pointer: coarse)').matches && large());
  let pending = null, shown = null;
  const clear = () => { if (shown) shown.classList.remove('preview', 'pv1', 'pv2'); pending = null; shown = null; };
  if (panel && !panel.querySelector('[data-confirm]')) {
    const segs = panel.querySelectorAll(':scope > .seg, :scope > div > .seg');
    const after = segs[segs.length - 1];
    const label = document.createElement('p');
    label.className = 'seg-label';
    label.textContent = 'Tap to confirm';
    const seg = document.createElement('div');
    seg.className = 'seg';
    seg.setAttribute('role', 'group');
    seg.setAttribute('aria-label', 'Tap to confirm: tap once to preview, again to place');
    seg.innerHTML = '<button type="button" data-confirm="off">Off</button><button type="button" data-confirm="on">On</button>';
    const paint = () => seg.querySelectorAll('[data-confirm]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.confirm === 'on') === isOn())));
    seg.addEventListener('click', (e) => { const b = e.target.closest('[data-confirm]'); if (!b) return; store.set(CONFIRM_KEY, b.dataset.confirm); clear(); paint(); });
    // a change of board size can change the default
    document.addEventListener('click', (e) => { if (e.target.closest('[data-hsize], [data-dsize]')) setTimeout(paint); });
    setTimeout(paint);   // once the game script has set up its board size
    if (after) { after.after(seg); after.after(label); }
  }
  return {
    // true: place now. false: this tap only showed the preview on `el`, for player `who` (1 or 2)
    ok(id, el, who) {
      if (!isOn() || pending === id) { clear(); return true; }
      clear();
      pending = id; shown = el;
      if (el) el.classList.add('preview', 'pv' + who);
      setStatus('Tap again to place it there', '');
      return false;
    },
    clear
  };
}

// ---------- Captured pieces, under each player (as on the Chess page) ----------
// el: <div class="pc-cap">; n pieces of the colour `cls` ('ck-gold', 'ck-black', 'nm-gold', 'nm-ivory').
export function showCaptures(el, n, cls, label) {
  if (!el) return;
  const html = ('<i class="' + cls + '"></i>').repeat(Math.max(0, n));
  if (el.innerHTML !== html) el.innerHTML = html;
  el.setAttribute('aria-label', label + ': ' + n);
}

// ---------- Opponent: the computer, or a friend on this device ----------
// Markup: <div class="seg" data-opponent-switch><button data-opponent="cpu">…</button><button data-opponent="friend">…</button></div>
// Elements with data-cpu-only are hidden in 2-player mode; [data-name="p1"] / [data-name="p2"] get the players' names.
export function opponentSwitch(gameKey, onChange, names = {}) {
  const key = 'bgs-' + gameKey + '-opp';
  let mode = store.get(key, 'cpu') === 'friend' ? 'friend' : 'cpu';
  const buttons = [...document.querySelectorAll('[data-opponent]')];
  const label = {
    cpu: { p1: names.you || 'You', p2: names.cpu || 'Computer' },
    friend: { p1: names.p1 || 'Player 1', p2: names.p2 || 'Player 2' }
  };
  const paint = () => {
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.opponent === mode)));
    document.body.classList.toggle('vs-friend', mode === 'friend');
    document.querySelectorAll('[data-cpu-only]').forEach((el) => { el.hidden = mode === 'friend'; });
    document.querySelectorAll('[data-friend-only]').forEach((el) => { el.hidden = mode !== 'friend'; });
    document.querySelectorAll('[data-name]').forEach((el) => { el.textContent = label[mode][el.dataset.name] || el.textContent; });
  };
  buttons.forEach((b) => b.addEventListener('click', async () => {
    if (b.dataset.opponent === mode) return;
    if (onChange && !(await confirmNewGame())) return;
    mode = b.dataset.opponent === 'friend' ? 'friend' : 'cpu';
    store.set(key, mode);
    paint();
    if (onChange) onChange(mode);
  }));
  paint();
  return () => mode;
}

// ---------- Your side, or who moves first, against the computer ----------
// Markup as on the Chess page: <div class="seg" data-cpu-only><button data-side="…">…</button>…</div>. Remembered
// per game; changing it calls onChange, which starts a new game. `values` are the buttons' data-side values.
// A page without the switch (the translated pages, until they get one) always plays the default.
export function sideSwitch(gameKey, values, onChange, def = values[0]) {
  const key = 'bgs-' + gameKey + '-side';
  const buttons = [...document.querySelectorAll('[data-side]')];
  if (!buttons.length) return () => def;
  let side = store.get(key, def);
  if (!values.includes(side)) side = def;
  const paint = () => buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.side === side)));
  buttons.forEach((b) => b.addEventListener('click', async () => {
    if (b.dataset.side === side) return;
    if (onChange && !(await confirmNewGame())) return;
    side = b.dataset.side;
    store.set(key, side);
    paint();
    if (onChange) onChange(side);
  }));
  paint();
  return () => side;
}
// For a First / Second / Random switch: does the person move first in this game?
export const movesFirst = (choice) => (choice === 'random' ? Math.random() < 0.5 : choice !== 'second');

// ---------- Move animations ----------
// Sitewide Animation speed (Off / Normal / Fast), remembered between visits. site.js copies it to <html data-anim>,
// which turns off the boards' CSS animations too. Off, or the system's reduced-motion setting, skips them.
const ANIM_KEY = 'bgs-anim';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
export const animSpeed = () => { const s = store.get(ANIM_KEY, 'normal'); return ['off', 'fast'].includes(s) ? s : 'normal'; };
// How long one animation step takes now, in ms (0: don't animate)
export function animMs(ms) {
  const s = animSpeed();
  if (s === 'off' || reducedMotion.matches) return 0;
  return s === 'fast' ? Math.round(ms * 0.5) : ms;
}
const running = new Set();
function follow(a) {
  running.add(a);
  return a.finished.catch(() => {}).then(() => { running.delete(a); });
}
// Stop every move animation at once (New game, Undo): elements jump to where they're drawn.
export function stopAnimations() { [...running].forEach((a) => a.cancel()); running.clear(); }
export const animating = () => running.size > 0;
const centre = (x) => {
  if (x && typeof x.getBoundingClientRect === 'function') { const r = x.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }
  return x;
};
// SVG shapes grow and shrink about their own centre
const prep = (el) => { if (el && el.ownerSVGElement) { el.style.transformBox = 'fill-box'; el.style.transformOrigin = 'center'; } return el; };
// screen pixels → the element's own units (SVG pieces are moved in the board's coordinates)
const unit = (el) => (el instanceof SVGElement && el.ownerSVGElement ? el.ownerSVGElement.getScreenCTM().a || 1 : 1);
// Slide `el` from where it is now through `points` (cells or {x, y} screen points), `step` ms per leg.
// `weights` (one per leg) makes some legs longer, e.g. a king flying several squares.
// The element stays at the last point (the caller then redraws the board with the move made).
export function slide(el, points, step = 220, weights = null) {
  const ms = animMs(step);
  if (!ms || !el || !points.length) return Promise.resolve();
  const c0 = centre(el), k = unit(el);
  const w = weights || points.map(() => 1), total = w.reduce((a, b) => a + b, 0);
  let done = 0;
  const frames = [{ transform: 'translate(0, 0)', offset: 0 }].concat(points.map((pt, n) => {
    const c = centre(pt);
    done += w[n];
    return { transform: 'translate(' + ((c.x - c0.x) / k).toFixed(2) + 'px, ' + ((c.y - c0.y) / k).toFixed(2) + 'px)', offset: done / total };
  }));
  // draw it above the rest of the board: inside an SVG board, move it to the end; otherwise raise it and its cell
  const raised = el.ownerSVGElement ? [] : [el, el.parentElement].filter(Boolean);
  if (el.ownerSVGElement) el.parentNode.appendChild(el);
  const prev = raised.map((x) => [x.style.zIndex, x.style.position]);
  raised.forEach((x) => { x.style.zIndex = '5'; if (getComputedStyle(x).position === 'static') x.style.position = 'relative'; });
  const a = el.animate(frames, { duration: ms * total, easing: points.length > 1 ? 'linear' : 'ease-in-out', fill: 'forwards' });
  return follow(a).then(() => raised.forEach((x, k) => { [x.style.zIndex, x.style.position] = prev[k]; }));
}
// Slide `el` (already drawn at its new place) in from `from` (a cell, or a list of cells it passed through):
// for boards that redraw first, like the lesson boards.
export function slideIn(el, from, step = 220) {
  const ms = animMs(step);
  const path = Array.isArray(from) ? from : [from];
  if (!ms || !el || !path.length || !path[0]) return Promise.resolve();
  const c0 = centre(el), k = unit(el);
  const at = (x) => { const c = centre(x); return { transform: 'translate(' + ((c.x - c0.x) / k).toFixed(2) + 'px, ' + ((c.y - c0.y) / k).toFixed(2) + 'px)' }; };
  const a = el.animate(path.map(at).concat({ transform: 'translate(0, 0)' }), { duration: ms * path.length, easing: path.length > 1 ? 'linear' : 'ease-in-out' });
  return follow(a);
}
// Fade an element out (a captured piece), leaving it invisible until the board is redrawn.
export function fadeOut(el, step = 200, after = 0) {
  const ms = animMs(step);
  if (!ms || !el) return Promise.resolve();
  prep(el);
  return follow(el.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.6)' }], { duration: ms, delay: animMs(after), easing: 'ease-in', fill: 'forwards' }));
}
// A piece or stone appearing where it was placed.
export function popIn(el, step = 200) {
  const ms = animMs(step);
  if (!ms || !el) return Promise.resolve();
  prep(el);
  return follow(el.animate([{ opacity: 0, transform: 'scale(.4)' }, { opacity: 1, transform: 'scale(1.08)', offset: 0.7 }, { opacity: 1, transform: 'scale(1)' }], { duration: ms, easing: 'ease-out' }));
}
// Light up `els` one after another (a winning line): each gets a short pulse, `step` ms apart.
export function lightUp(els, step = 90) {
  const ms = animMs(step);
  if (!ms) return Promise.resolve();
  return Promise.all(els.map((el, k) => el && follow(prep(el).animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25)', filter: 'brightness(1.35)' }, { transform: 'scale(1)' }], { duration: Math.max(ms * 3, 240), delay: k * ms, easing: 'ease-out' }))));
}
// Draw an SVG line in (Dots and Boxes) and fade a shape in (a claimed box).
export function drawIn(el, step = 200) {
  const ms = animMs(step);
  if (!ms || !el || !el.getTotalLength) return Promise.resolve();
  const len = el.getTotalLength();
  return follow(el.animate([{ strokeDasharray: len + ' ' + len, strokeDashoffset: len }, { strokeDasharray: len + ' ' + len, strokeDashoffset: 0 }], { duration: ms, easing: 'ease-out' }));
}
export function fadeIn(el, step = 220) {
  const ms = animMs(step);
  if (!ms || !el) return Promise.resolve();
  return follow(el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: ms, easing: 'ease-out' }));
}
export const pause = (ms) => new Promise((r) => setTimeout(r, animMs(ms)));
// Drop the animations on these elements (a board that reuses its cells, once the move is drawn)
export function settle(els) { els.forEach((el) => el && el.getAnimations().forEach((x) => x.cancel())); }
// Moves play one after another, so one that arrives mid-animation (an online move, the computer's reply)
// waits its turn. run(show, make): once earlier moves are done, show(live) animates the move on the board as
// drawn (return false to drop it), then make(result) makes it, with busy() already false so the board it
// draws lets the next player move. live() turns false when reset() is called (New game, Undo): a move cut
// short isn't made. reset() also stops the animations.
export function moveQueue() {
  let chain = Promise.resolve(), gen = 0, waiting = 0;
  return {
    run(show, make) {
      const g = gen, live = () => g === gen;
      waiting++;
      let counted = true;
      const done = () => { if (counted) { counted = false; waiting--; } };
      chain = chain.then(async () => {
        if (!live()) return done();
        const v = await show(live);
        done();
        if (live() && v !== false && make) make(v);
      }).catch((e) => { done(); console.error(e); });
      return chain;
    },
    reset() { gen++; stopAnimations(); },
    busy: () => waiting > 0
  };
}

// The Animation speed switch, added under the other controls on game pages that use these animations.
export function animationSwitch() {
  const panel = document.querySelector('[data-max-root] .panel');
  if (!panel || panel.querySelector('[data-anim]')) return;
  const segs = panel.querySelectorAll(':scope > .seg, :scope > div > .seg');
  const after = segs.length ? segs[segs.length - 1] : null;
  const label = document.createElement('p');
  label.className = 'seg-label';
  label.textContent = 'Animation speed';
  const seg = document.createElement('div');
  seg.className = 'seg';
  seg.setAttribute('role', 'group');
  seg.setAttribute('aria-label', 'Animation speed');
  seg.innerHTML = '<button type="button" data-anim="off">Off</button><button type="button" data-anim="normal">Normal</button><button type="button" data-anim="fast">Fast</button>';
  const paint = () => seg.querySelectorAll('[data-anim]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.anim === animSpeed())));
  seg.addEventListener('click', (e) => {
    const b = e.target.closest('[data-anim]');
    if (!b) return;
    store.set(ANIM_KEY, b.dataset.anim);
    document.documentElement.dataset.anim = b.dataset.anim;
    if (b.dataset.anim === 'off') stopAnimations();
    paint();
  });
  paint();
  if (after) { after.after(seg); after.after(label); } else { const ng = panel.querySelector('#new-game'); panel.insertBefore(label, ng); panel.insertBefore(seg, ng); }
}

// ---------- Maximise: the board fills the screen ----------
const MAX_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>';
const MIN_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>';

function setupMaximise() {
  const right = document.querySelector('[data-max-root] .head-right');
  if (!right || document.getElementById('max-btn')) return;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'max-btn';
  btn.className = 'icon-btn';
  const isOn = () => document.body.classList.contains('maxed');
  const paint = () => {
    btn.innerHTML = isOn() ? MIN_ICON : MAX_ICON;
    btn.setAttribute('aria-label', isOn() ? 'Exit full screen' : 'Full screen');
    btn.title = isOn() ? 'Exit full screen (Esc)' : 'Full screen';
  };
  // Boards that stretch with their width already fill the screen through CSS. Everything else (card tables,
  // dice felts, word games) has a natural size, so it is scaled up as a whole until it fills the height or
  // the width left beside the panel. Scaling uses CSS zoom, which keeps clicks and layout exact.
  const col = document.querySelector('[data-max-root] .board-col');
  const head = col && col.querySelector('.board-head');
  const clearFit = () => {
    if (!col) return;
    for (const k of ['zoom', 'width', 'flex']) col.style[k] = '';
    if (head) { head.style.zoom = ''; head.style.width = ''; }
  };
  const frame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 30)));
  let fitRun = 0;
  const fit = async () => {
    if (!col) return;
    const run = ++fitRun;
    clearFit();
    if (!isOn()) return;
    const root = col.closest('[data-max-root]');
    const cs = getComputedStyle(root);
    const pad = (k) => parseFloat(cs[k]) || 0;
    const panel = root.querySelector('.panel');
    const measure = () => {
      const r = col.getBoundingClientRect();
      const pr = panel && panel.getBoundingClientRect();
      const beside = pr && pr.width && pr.top < r.bottom - 40 && pr.left >= r.right - 4;
      const availW = root.clientWidth - pad('paddingLeft') - pad('paddingRight') - (beside ? pr.width + 24 : 0);
      const availH = root.clientHeight - pad('paddingTop') - pad('paddingBottom');
      const z = Math.min(availW / r.width, availH / r.height, 2.4);
      return { w: r.width, h: r.height, z, fill: (r.height * z) / availH, beside };
    };
    let best = measure();
    if (!best.w || !best.h) return;
    // A table that only got wider (cards and dice keep their size) fills more when scaled up from a narrower start.
    if (best.beside && best.fill < 0.8) {
      for (const w of [660, 560]) {
        if (w >= best.w - 20) continue;
        col.style.flex = '0 0 auto'; col.style.width = w + 'px';
        window.dispatchEvent(new Event('resize'));
        await frame();
        if (run !== fitRun) return;
        const m = measure();
        if (m.fill > best.fill + 0.04) best = m;
      }
      col.style.width = best.w + 'px';
      window.dispatchEvent(new Event('resize'));
      await frame();
      if (run !== fitRun) return;
      best = measure();
    }
    // Already fills its space, or is far too tall to shrink without becoming tiny (a long scorecard): leave it to scroll.
    if ((best.z > 0.985 && best.z < 1.06) || best.z < 0.86) { clearFit(); window.dispatchEvent(new Event('resize')); return; }
    col.style.flex = '0 0 auto';
    col.style.width = best.w + 'px';
    col.style.zoom = best.z;
    if (head) { head.style.zoom = 1 / best.z; head.style.width = (best.w * best.z) + 'px'; } // the title bar keeps its normal size
  };
  let fitTimer = 0;
  const refit = () => { clearTimeout(fitTimer); fitTimer = setTimeout(fit, 60); };
  const set = (on) => {
    clearFit();
    document.body.classList.toggle('maxed', on);
    paint();
    window.dispatchEvent(new Event('resize')); // games that size themselves to their space re-measure
    refit();
  };
  window.addEventListener('resize', (e) => { if (isOn() && e.isTrusted) { clearFit(); refit(); } });
  btn.addEventListener('click', async () => {
    const on = !isOn();
    set(on);
    try {
      const root = document.documentElement;
      if (on && root.requestFullscreen && !document.fullscreenElement) await root.requestFullscreen({ navigationUI: 'hide' });
      else if (!on && document.fullscreenElement) await document.exitFullscreen();
    } catch (e) { /* full screen not allowed here (e.g. iPhone): the page still fills the window */ }
  });
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && isOn()) set(false); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && isOn() && !document.fullscreenElement) set(false); });
  paint();
  right.insertBefore(btn, right.querySelector('[data-sound-toggle]'));
}
setupMaximise();

// ---------- Boards that fit the screen height (pages with data-fit-height, see site.css) ----------
// Works out how much height is left for the board under the header and status line (and above the phone tab bar),
// so the board never runs off the bottom of the screen and the status and the computer's reply stay in view.
function setupFitHeight() {
  const root = document.querySelector('[data-fit-height]');
  const el = root && root.querySelector('.board-col > .board-head + *');
  if (!el) return;
  const fit = () => {
    if (document.body.classList.contains('maxed')) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const bar = document.querySelector('.tabbar');
    const below = bar && getComputedStyle(bar).display !== 'none' ? bar.getBoundingClientRect().height : 0;
    root.style.setProperty('--fit-h', Math.max(0, Math.floor(window.innerHeight - top - below - 12)) + 'px');
  };
  fit();
  window.addEventListener('resize', fit);
  window.addEventListener('load', fit);
}
setupFitHeight();
