// Mancala (Kalah) rules, shared by the game page and the lessons. No page code.
// pits[0..5] Player 1 (left to right along the bottom), [6] Player 1's store,
// [7..12] Player 2 (right to left along the top), [13] Player 2's store. Player index p: 0 or 1.
export const STORE = [6, 13];
export const own = (p, i) => (p === 0 ? i >= 0 && i <= 5 : i >= 7 && i <= 12);
export const start = (seeds = 4) => [seeds, seeds, seeds, seeds, seeds, seeds, 0, seeds, seeds, seeds, seeds, seeds, seeds, 0];

// Sow from pit i for player p. Returns { b, again, captured, last }.
export function sow(b0, p, i) {
  const b = b0.slice();
  let n = b[i]; b[i] = 0; let j = i;
  while (n) { j = (j + 1) % 14; if (j === STORE[1 - p]) continue; b[j]++; n--; }
  let captured = 0;
  if (own(p, j) && b[j] === 1 && b[12 - j] > 0) { captured = b[12 - j] + 1; b[STORE[p]] += captured; b[j] = 0; b[12 - j] = 0; }
  const again = j === STORE[p];
  // game end: one side empty, the other side's seeds go to its owner
  if (b.slice(0, 6).every((x) => !x) || b.slice(7, 13).every((x) => !x)) {
    for (let k = 0; k < 6; k++) { b[6] += b[k]; b[k] = 0; b[13] += b[7 + k]; b[7 + k] = 0; }
  }
  return { b, again, captured, last: j };
}
export const moves = (b, p) => [0, 1, 2, 3, 4, 5].map((k) => (p === 0 ? k : 7 + k)).filter((i) => b[i] > 0);
export const ended = (b) => b.slice(0, 6).every((x) => !x) && b.slice(7, 13).every((x) => !x);

export function minimax(b, p, depth, alpha, beta, me) {
  if (depth === 0 || ended(b)) return b[STORE[me]] - b[STORE[1 - me]];
  const ms = moves(b, p);
  let best = p === me ? -Infinity : Infinity;
  for (const i of ms) {
    const r = sow(b, p, i);
    const v = minimax(r.b, r.again && !ended(r.b) ? p : 1 - p, depth - 1, alpha, beta, me);
    if (p === me) { best = Math.max(best, v); alpha = Math.max(alpha, v); } else { best = Math.min(best, v); beta = Math.min(beta, v); }
    if (beta <= alpha) break;
  }
  return best;
}

// The computer's choice at a level: 'easy' | 'medium' | 'hard'.
export function pick(b, p, level = 'medium', rnd = Math.random) {
  const depth = { easy: 1, medium: 4, hard: 9 }[level] || 4;
  const ms = moves(b, p);
  if (level === 'easy' && rnd() < 0.4) return ms[Math.floor(rnd() * ms.length)];
  let best = ms[0], bv = -Infinity;
  for (const i of ms) {
    const r = sow(b, p, i);
    const v = minimax(r.b, r.again && !ended(r.b) ? p : 1 - p, depth - 1, -Infinity, Infinity, p) + rnd() * 0.1;
    if (v > bv) { bv = v; best = i; }
  }
  return best;
}
