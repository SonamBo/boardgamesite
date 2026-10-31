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

// Win / loss / draw record, remembered per game.
export function record(gameKey) {
  const key = 'bgs-' + gameKey + '-score';
  const score = store.get(key, { w: 0, l: 0, d: 0 });
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
  const paint = () => {
    const el = $('record');
    if (el) el.textContent = plural(score.w, 'win', 'wins') + ' · ' + plural(score.l, 'loss', 'losses') + ' · ' + plural(score.d, 'draw', 'draws');
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
