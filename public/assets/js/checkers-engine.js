// Checkers (American / English draughts) rules and computer player. No DOM here.
// Board: 64 cells, index r*8+c, only dark squares ((r+c) odd) are used.
// Pieces: 1 = your man, 2 = your king, -1 = computer man, -2 = computer king.
// You start at the bottom (rows 5–7) and move up; the computer starts at the top.
export const YOU = 1;
export const CPU = -1;

export const isDark = (i) => ((i >> 3) + (i & 7)) % 2 === 1;

export function startBoard() {
  const b = new Array(64).fill(0);
  for (let i = 0; i < 64; i++) {
    if (!isDark(i)) continue;
    const r = i >> 3;
    if (r <= 2) b[i] = CPU;
    if (r >= 5) b[i] = YOU;
  }
  return b;
}

const sideOf = (p) => (p > 0 ? YOU : p < 0 ? CPU : 0);
const isKing = (p) => p === 2 || p === -2;
function dirsFor(p) {
  if (isKing(p)) return [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  return p > 0 ? [[-1, -1], [-1, 1]] : [[1, -1], [1, 1]];
}
const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const promotes = (p, r) => (p === YOU && r === 0) || (p === CPU && r === 7);

// Every jump sequence for one piece. Captured pieces stay on the board until the move ends
// (they can't be jumped twice); a man that reaches the far row is crowned and stops.
function jumpsFrom(b, from, piece) {
  const out = [];
  (function dfs(pos, path, caps) {
    let extended = false;
    const r = pos >> 3, c = pos & 7;
    for (const [dr, dc] of dirsFor(piece)) {
      const mr = r + dr, mc = c + dc, lr = r + 2 * dr, lc = c + 2 * dc;
      if (!inside(lr, lc)) continue;
      const mid = mr * 8 + mc, land = lr * 8 + lc;
      if (sideOf(b[mid]) !== -sideOf(piece) || caps.includes(mid)) continue;
      if (b[land] !== 0 && land !== from) continue;
      extended = true;
      const p2 = path.concat(land), c2 = caps.concat(mid);
      if (!isKing(piece) && promotes(piece, lr)) out.push({ path: p2, caps: c2 });
      else dfs(land, p2, c2);
    }
    if (!extended && caps.length) out.push({ path, caps });
  })(from, [from], []);
  return out;
}

// All legal moves for a side. Captures are compulsory.
export function legalMoves(b, side) {
  const jumps = [];
  const steps = [];
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (sideOf(p) !== side) continue;
    jumps.push(...jumpsFrom(b, i, p));
    if (jumps.length) continue;
    const r = i >> 3, c = i & 7;
    for (const [dr, dc] of dirsFor(p)) {
      const nr = r + dr, nc = c + dc;
      if (inside(nr, nc) && b[nr * 8 + nc] === 0) steps.push({ path: [i, nr * 8 + nc], caps: [] });
    }
  }
  return jumps.length ? jumps : steps;
}

export function applyMove(b, m) {
  const nb = b.slice();
  const from = m.path[0], to = m.path[m.path.length - 1];
  let p = nb[from];
  nb[from] = 0;
  for (const x of m.caps) nb[x] = 0;
  if (!isKing(p) && promotes(p, to >> 3)) p *= 2;
  nb[to] = p;
  return nb;
}

export function countPieces(b) {
  let you = 0, cpu = 0;
  for (const p of b) { if (p > 0) you++; else if (p < 0) cpu++; }
  return { you, cpu };
}

// Score from the computer's point of view.
function evaluate(b) {
  let s = 0;
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!p) continue;
    const r = i >> 3, c = i & 7;
    const centre = (c >= 2 && c <= 5 && r >= 2 && r <= 5) ? 6 : 0;
    let v;
    if (isKing(p)) v = 175 + centre;
    else {
      const adv = p > 0 ? 7 - r : r;          // rows advanced
      const backGuard = (p > 0 && r === 7) || (p < 0 && r === 0) ? 8 : 0;
      v = 100 + adv * 5 + centre + backGuard;
    }
    s += p < 0 ? v : -v;
  }
  // Endgame: the side that is ahead brings its kings towards the enemy; the side behind keeps away.
  if (Math.abs(s) >= 60) {
    const leader = s > 0 ? CPU : YOU;
    let pull = 0;
    for (let i = 0; i < 64; i++) {
      if (b[i] !== 2 * leader) continue;
      let nearest = 99;
      for (let j = 0; j < 64; j++) {
        if (sideOf(b[j]) !== -leader) continue;
        const d = Math.max(Math.abs((i >> 3) - (j >> 3)), Math.abs((i & 7) - (j & 7)));
        if (d < nearest) nearest = d;
      }
      if (nearest < 99) pull += nearest;
    }
    s += (leader === CPU ? -1 : 1) * pull * 4;
    // ...and is happy to trade pieces, since every even swap makes its lead bigger.
    let total = 0;
    for (const p of b) if (p) total++;
    s += (leader === CPU ? 1 : -1) * (24 - total) * 6;
  }
  return s;
}

function negamax(b, side, depth, alpha, beta) {
  const moves = legalMoves(b, side);
  if (!moves.length) return -100000 - depth;   // side to move has lost
  if (depth === 0) return side === CPU ? evaluate(b) : -evaluate(b);
  // captures first helps pruning
  moves.sort((a, z) => z.caps.length - a.caps.length);
  let best = -Infinity;
  for (const m of moves) {
    // a capture at the horizon gets one extra ply so the AI doesn't walk into obvious trades
    const d = depth === 1 && m.caps.length ? 1 : depth - 1;
    const v = -negamax(applyMove(b, m), -side, d, -beta, -alpha);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

export const LEVELS = { easy: { depth: 2, noise: 60 }, medium: { depth: 4, noise: 12 }, hard: { depth: 7, noise: 0 } };

export function pickComputerMove(b, level = 'medium', rnd = Math.random) {
  const { depth, noise } = LEVELS[level] || LEVELS.medium;
  const moves = legalMoves(b, CPU);
  if (moves.length <= 1) return moves[0] || null;
  let best = null, bestScore = -Infinity;
  for (const m of moves) {
    const v = -negamax(applyMove(b, m), YOU, depth - 1, -Infinity, Infinity) + (noise ? (rnd() - 0.5) * noise * 2 : 0);
    if (v > bestScore) { bestScore = v; best = m; }
  }
  return best;
}
