// BGS Rating: one rating per game, Glicko-2, starting at 800.
//   bgs-rating-<game>    { r, rd, vol, n, w, l, d, best, last, hist: [[time, rating], …] }
//   bgs-rated-pending    a rated game in progress { game, bot, t }: if it's never finished, it counts as a loss
// Ratings live in this browser and sync to the player's account (accounts.js). The practice-ladder bots have fixed ratings.
import { store } from './store.js';
import { logActivity } from './learn-progress.js';

export const START = 800;
const START_RD = 150, MAX_RD = 250, MIN_RD = 45, START_VOL = 0.06, TAU = 0.5, SCALE = 173.7178;
export const PROVISIONAL = 5;            // games before a rating stops being provisional
export const BOT_RD = 50;

export const BOTS = [
  { id: 'penny', name: 'Penny', rating: 600, level: 'easy' },
  { id: 'mira', name: 'Mira', rating: 900, level: 'medium' },
  { id: 'monocle', name: 'The Monocle', rating: 1200, level: 'hard' }
];
export const botById = (id) => BOTS.find((b) => b.id === id) || null;
export const RATED_GAMES = ['chess', 'checkers', 'mancala'];

const KEY = (game) => 'bgs-rating-' + game;
const PENDING = 'bgs-rated-pending';

export function ratingOf(game) {
  const v = store.get(KEY(game), null);
  const base = { r: START, rd: START_RD, vol: START_VOL, n: 0, w: 0, l: 0, d: 0, best: START, last: 0, hist: [] };
  const p = v && typeof v.r === 'number' ? { ...base, ...v } : base;
  // RD grows back slowly while a player is away (one Glicko period per week)
  if (p.last) {
    const weeks = (Date.now() - p.last) / 6048e5;
    if (weeks > 1) p.rd = Math.min(MAX_RD, Math.sqrt(p.rd * p.rd + (p.vol * SCALE) ** 2 * weeks));
  }
  return p;
}
export const isProvisional = (p) => p.n < PROVISIONAL;
export const show = (p) => Math.round(p.r) + (isProvisional(p) ? '?' : '');

// One Glicko-2 update for a single game. s: 1 win, 0.5 draw, 0 loss.
export function glicko(p, oppR, oppRd, s) {
  const mu = (p.r - 1500) / SCALE, phi = p.rd / SCALE, muj = (oppR - 1500) / SCALE, phij = oppRd / SCALE;
  const g = 1 / Math.sqrt(1 + (3 * phij * phij) / (Math.PI * Math.PI));
  const E = 1 / (1 + Math.exp(-g * (mu - muj)));
  const v = 1 / (g * g * E * (1 - E));
  const delta = v * g * (s - E);
  // new volatility (Illinois method)
  const a = Math.log(p.vol * p.vol);
  const f = (x) => {
    const ex = Math.exp(x);
    return (ex * (delta * delta - phi * phi - v - ex)) / (2 * (phi * phi + v + ex) ** 2) - (x - a) / (TAU * TAU);
  };
  let A = a, B;
  if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
  else { let k = 1; while (f(a - k * TAU) < 0) k++; B = a - k * TAU; }
  let fA = f(A), fB = f(B);
  for (let i = 0; i < 60 && Math.abs(B - A) > 1e-6; i++) {
    const C = A + ((A - B) * fA) / (fB - fA), fC = f(C);
    if (fC * fB <= 0) { A = B; fA = fB; } else fA /= 2;
    B = C; fB = fC;
  }
  const vol = Math.exp(A / 2);
  const phiStar = Math.sqrt(phi * phi + vol * vol);
  const phiNew = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muNew = mu + phiNew * phiNew * g * (s - E);
  return { r: muNew * SCALE + 1500, rd: Math.max(MIN_RD, Math.min(MAX_RD, phiNew * SCALE)), vol };
}

// Record a finished rated game. Returns { before, after, delta, player }.
export function recordResult(game, bot, result) {
  const p = ratingOf(game);
  const s = result === 'win' ? 1 : result === 'draw' ? 0.5 : 0;
  const before = p.r;
  Object.assign(p, glicko(p, bot.rating, BOT_RD, s));
  p.r = Math.max(100, p.r);
  p.n++;
  p[result === 'win' ? 'w' : result === 'draw' ? 'd' : 'l']++;
  p.best = Math.max(p.best, p.r);
  p.last = Date.now();
  p.hist = (p.hist || []).concat([[p.last, Math.round(p.r)]]).slice(-60);
  store.set(KEY(game), p);
  store.set(PENDING, null);
  logActivity(game, 2);
  return { before: Math.round(before), after: Math.round(p.r), delta: Math.round(p.r) - Math.round(before), player: p };
}

export function markPending(game, bot) { store.set(PENDING, { game, bot: bot.id, t: Date.now() }); }
export function clearPending() { store.set(PENDING, null); }

// A rated game that was left unfinished counts as a loss. Returns what was settled (or null).
export function settlePending() {
  const p = store.get(PENDING, null);
  if (!p || !RATED_GAMES.includes(p.game)) return null;
  const bot = botById(p.bot);
  store.set(PENDING, null);
  if (!bot) return null;
  return { game: p.game, bot, ...recordResult(p.game, bot, 'lose') };
}

// Where a player should be on the ladder: the first bot they haven't beaten yet.
export function nextBot(game) {
  const beaten = store.get('bgs-ladder-' + game, {}) || {};
  return BOTS.find((b) => !beaten[b.id]) || BOTS[BOTS.length - 1];
}
export function markBeaten(game, bot) {
  const beaten = store.get('bgs-ladder-' + game, {}) || {};
  if (!beaten[bot.id]) { beaten[bot.id] = Date.now(); store.set('bgs-ladder-' + game, beaten); }
}
export const beatenBots = (game) => store.get('bgs-ladder-' + game, {}) || {};
