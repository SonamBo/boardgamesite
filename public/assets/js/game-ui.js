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
