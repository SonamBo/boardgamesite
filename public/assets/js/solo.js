// Shared bits for single-player games: a clock, games played and won (synced to the player's
// account), best time per level (kept in this browser), and a seeded random number generator for
// daily puzzles, so everyone gets the same one.
import { store } from './site.js';
import { onProgressLoaded } from './store.js';

export const fmt = (ms) => {
  const t = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
};

// A clock that keeps going across page reloads (via elapsed()) and can be paused.
export function clock(el) {
  let start = 0, base = 0, id = 0, running = false;
  const paint = () => { if (el) el.textContent = fmt(elapsed()); };
  function elapsed() { return base + (running ? Date.now() - start : 0); }
  return {
    start(from = 0) { this.stop(); base = from; start = Date.now(); running = true; paint(); id = setInterval(paint, 1000); },
    stop() { if (running) base += Date.now() - start; running = false; clearInterval(id); paint(); },
    reset() { this.stop(); base = 0; paint(); },
    elapsed,
    get running() { return running; }
  };
}

// played / won are synced with the account; best[level] (ms, lower is better) or top[level]
// (higher is better) stay in this browser.
export function soloRecord(key, { onPaint } = {}) {
  const stats = store.get(key, { played: 0, won: 0, best: null });
  const bestKey = key + '-best';
  const best = store.get(bestKey, {});
  const paint = () => onPaint && onPaint(stats, best);
  onProgressLoaded(() => { Object.assign(stats, { played: 0, won: 0, best: null }, store.get(key, {})); paint(); });
  paint();
  return {
    stats, best,
    played() { stats.played = (stats.played || 0) + 1; store.set(key, stats); paint(); },
    won(level, ms, { higherIsBetter = false } = {}) {
      stats.won = (stats.won || 0) + 1;
      let record = false;
      if (level && typeof ms === 'number') {
        const old = best[level];
        if (old == null || (higherIsBetter ? ms > old : ms < old)) { best[level] = ms; record = old != null; store.set(bestKey, best); }
      }
      if (higherIsBetter && typeof ms === 'number') stats.top = Math.max(stats.top || 0, ms);
      store.set(key, stats);
      paint();
      return record;
    },
    lost() { store.set(key, stats); paint(); },
    // A finished game's score, for games where higher is better (keeps the best ever as `top`).
    score(n, level) {
      stats.top = Math.max(stats.top || 0, n);
      let record = false;
      if (level) { const old = best[level]; if (old == null || n > old) { best[level] = n; record = old != null; store.set(bestKey, best); } }
      store.set(key, stats);
      paint();
      return record;
    }
  };
}

// Mulberry32: small, fast, seeded. seedFrom('2026-10-28') gives everyone the same daily game.
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function seedFrom(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
// Today's date in the player's own time zone, as YYYY-MM-DD (a new daily game at their midnight).
export function today() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
// Day number since 1 Jan 2026, for "Daily #123".
export function dayNumber(date = today()) {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2026, 0, 1)) / 86400000) + 1;
}

export function shake(el, play) {
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
  if (play) play('error');
  setTimeout(() => el.classList.remove('shake'), 320);
}
