// Shared bits for game pages: status line, result panel, computer level switch, win/loss record.
import { store } from './site.js';
import { onProgressLoaded } from './store.js';

const $ = (id) => document.getElementById(id);

export const MASCOT = {
  win: '/assets/img/mascot-trophy.webp',
  lose: '/assets/img/mascot-confused.webp',
  draw: '/assets/img/mascot-wave.webp'
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
