// Learning progress, kept in this browser (and synced to the player's account by accounts.js).
//   bgs-learn-<game>   { done: { <lesson slug>: <time finished> }, xp }
//   bgs-activity       { 'YYYY-MM-DD': { <game>: steps done that day } } (last 60 days)
import { store } from './store.js';

const LEARN = (game) => 'bgs-learn-' + game;
export const ACTIVITY = 'bgs-activity';

export function dayKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

export function progress(game) {
  const v = store.get(LEARN(game), null);
  return { done: (v && v.done) || {}, xp: (v && v.xp) || 0 };
}

export const isDone = (game, slug) => !!progress(game).done[slug];

export function complete(game, slug, xp = 20) {
  const p = progress(game);
  const first = !p.done[slug];
  if (first) { p.done[slug] = Date.now(); p.xp += xp; }
  store.set(LEARN(game), p);
  logActivity(game, 3);
  return first;
}

// Count something the player did today (lessons, puzzles, rated games), for streaks and the dashboard chart.
export function logActivity(game, n = 1) {
  const a = store.get(ACTIVITY, {}) || {};
  const k = dayKey();
  a[k] = a[k] || {};
  a[k][game] = (a[k][game] || 0) + n;
  // keep two months
  const keys = Object.keys(a).sort();
  while (keys.length > 60) delete a[keys.shift()];
  store.set(ACTIVITY, a);
}

// Days in a row (ending today or yesterday) with any activity.
export function streak() {
  const a = store.get(ACTIVITY, {}) || {};
  const d = new Date();
  if (!a[dayKey(d)]) d.setDate(d.getDate() - 1);
  let n = 0;
  while (a[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
