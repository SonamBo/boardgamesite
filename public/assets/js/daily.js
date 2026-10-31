// The daily challenge: 3 games a day, picked from every game with daily content. The same 3 for everyone.
// This module is small on purpose (every page uses it for the menu badge and home page): it only reads progress.
//   bgs-puzzles      { day: { chess|checkers|mancala: mistakes + 1 } }  board puzzles solved on /daily
//   bgs-daily-log    { day: { hub: challenges done that day } }         for the daily-challenge streak
// The other games keep their own daily records (four-in-a-row: bgs-daily, sudoku: bgs-sdk-daily,
// word-guess: bgs-wg-daily, letter-hive: bgs-hive-daily).
import { store } from './store.js';

export const dayKey = (d = new Date()) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

// inline: played on /daily itself (a puzzle from that game's learning path); otherwise a link to the game's daily mode.
export const DAILY_GAMES = [
  { game: 'chess', name: 'Chess', icon: '♟️', inline: true, task: 'A chess puzzle: find the winning move.' },
  { game: 'checkers', name: 'Checkers', icon: '⛀', inline: true, task: 'A checkers puzzle: find the jump, the shot or the trap.' },
  { game: 'mancala', name: 'Mancala', icon: '🫘', inline: true, task: 'A mancala puzzle: find the free turn or the capture.' },
  { game: 'four-in-a-row', name: 'Four in a Row', icon: '🔴', href: '/play/four-in-a-row?mode=daily', task: 'One move to win. You get one try, so look carefully.' },
  { game: 'sudoku', name: 'Sudoku', icon: '🔢', href: '/play/sudoku?mode=daily', task: 'Today’s Sudoku: the same grid for everyone.' },
  { game: 'word-guess', name: 'Word Guess', icon: '🔤', href: '/play/word-guess?mode=daily', task: 'Find the five-letter word in six guesses.' },
  { game: 'letter-hive', name: 'Letter Hive', icon: '🐝', href: '/play/letter-hive?mode=daily', task: 'Make words from seven letters. Reach Brilliant to complete it.' }
];
export const PER_DAY = 3;

// Seeded shuffle of the games for a day; the first three are that day's challenges.
export function todaysGames(d = new Date()) {
  let seed = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5) * 2654435761 >>> 0;
  const rand = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const list = DAILY_GAMES.slice();
  for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
  return list.slice(0, PER_DAY);
}

// { done, solved } for a game's challenge today. Four in a Row and Word Guess can be done without being solved.
export function statusOf(game) {
  const today = dayKey();
  const get = (k) => store.get(k, null) || {};
  switch (game) {
    case 'chess': case 'checkers': case 'mancala': {
      const s = !!(get('bgs-puzzles')[today] || {})[game];
      return { done: s, solved: s };
    }
    case 'four-in-a-row': { const d = get('bgs-daily'); return { done: d.date === today, solved: d.date === today && !!d.solved }; }
    case 'sudoku': { const s = get('bgs-sdk-daily').lastSolved === today; return { done: s, solved: s }; }
    case 'word-guess': { const d = get('bgs-wg-daily'); return { done: d.date === today && !!d.done, solved: d.date === today && !!d.won }; }
    case 'letter-hive': { const d = get('bgs-hive-daily'); const s = d.date === today && !!d.wonOnce; return { done: s, solved: s }; }
    default: return { done: false, solved: false };
  }
}

export function todayProgress() {
  const games = todaysGames();
  const st = games.map((g) => ({ ...g, ...statusOf(g.game) }));
  return { games: st, done: st.filter((g) => g.done).length, solved: st.filter((g) => g.solved).length, total: games.length };
}

// Keep the streak log up to date (called on every page load and after a challenge).
export function noteToday() {
  const n = todayProgress().done;
  if (!n) return;
  const log = store.get('bgs-daily-log', {}) || {};
  const k = dayKey();
  if ((log[k] && log[k].hub) >= n) return;
  log[k] = { hub: n };
  const keep = Object.keys(log).sort().slice(-60);
  store.set('bgs-daily-log', Object.fromEntries(keep.map((d) => [d, log[d]])));
}

// Days in a row (ending today or yesterday) with at least one daily challenge done.
export function dailyStreak() {
  const log = store.get('bgs-daily-log', {}) || {};
  const d = new Date();
  if (!log[dayKey(d)]) d.setDate(d.getDate() - 1);
  let n = 0;
  while (log[dayKey(d)] && log[dayKey(d)].hub) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
