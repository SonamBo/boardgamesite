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
  buttons.forEach((b) => b.addEventListener('click', () => {
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
  buttons.forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.opponent === mode) return;
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
  buttons.forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.side === side) return;
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
  const set = (on) => {
    document.body.classList.toggle('maxed', on);
    paint();
    window.dispatchEvent(new Event('resize')); // games that size themselves to their space re-measure
  };
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
