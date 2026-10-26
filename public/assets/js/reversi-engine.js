// Reversi rules and computer player. No DOM here.
// Board: 64 cells, index r*8+c. 1 = you (gold, moves first), -1 = computer.
export const YOU = 1;
export const CPU = -1;
const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

export function startBoard() {
  const b = new Array(64).fill(0);
  b[27] = CPU; b[36] = CPU;   // d4, e5
  b[28] = YOU; b[35] = YOU;   // e4, d5
  return b;
}

// Discs flipped if `side` plays at i (empty array = not a legal move).
export function flipsFor(b, i, side) {
  if (b[i] !== 0) return [];
  const r0 = i >> 3, c0 = i & 7, out = [];
  for (const [dr, dc] of DIRS) {
    const line = [];
    let r = r0 + dr, c = c0 + dc;
    while (r >= 0 && r < 8 && c >= 0 && c < 8 && b[r * 8 + c] === -side) {
      line.push(r * 8 + c); r += dr; c += dc;
    }
    if (line.length && r >= 0 && r < 8 && c >= 0 && c < 8 && b[r * 8 + c] === side) out.push(...line);
  }
  return out;
}

export function legalMoves(b, side) {
  const out = [];
  for (let i = 0; i < 64; i++) if (b[i] === 0 && flipsFor(b, i, side).length) out.push(i);
  return out;
}

export function play(b, i, side) {
  const flips = flipsFor(b, i, side);
  const nb = b.slice();
  nb[i] = side;
  for (const f of flips) nb[f] = side;
  return { board: nb, flips };
}

export function count(b) {
  let you = 0, cpu = 0;
  for (const v of b) { if (v === YOU) you++; else if (v === CPU) cpu++; }
  return { you, cpu, empty: 64 - you - cpu };
}

export const isOver = (b) => !legalMoves(b, YOU).length && !legalMoves(b, CPU).length;

const W = [
  100, -20, 10, 5, 5, 10, -20, 100,
  -20, -50, -2, -2, -2, -2, -50, -20,
  10, -2, 1, 1, 1, 1, -2, 10,
  5, -2, 1, 0, 0, 1, -2, 5,
  5, -2, 1, 0, 0, 1, -2, 5,
  10, -2, 1, 1, 1, 1, -2, 10,
  -20, -50, -2, -2, -2, -2, -50, -20,
  100, -20, 10, 5, 5, 10, -20, 100
];
const CORNERS = [[0, 1, 8, 9], [7, 6, 15, 14], [56, 57, 48, 49], [63, 62, 55, 54]];

// Score for `side`.
function evaluate(b, side) {
  let pos = 0;
  for (let i = 0; i < 64; i++) pos += W[i] * b[i];
  // squares next to a corner stop being risky once the corner is taken
  for (const [corner, ...near] of CORNERS) {
    if (b[corner] !== 0) for (const n of near) pos -= W[n] * b[n];
  }
  const mob = legalMoves(b, YOU).length - legalMoves(b, CPU).length;
  return (pos + mob * 6) * side;
}

function negamax(b, side, depth, alpha, beta, exact) {
  const moves = legalMoves(b, side);
  if (!moves.length) {
    if (!legalMoves(b, -side).length) {
      const { you, cpu } = count(b);
      return (you - cpu) * side * 1000;      // game over: disc difference decides
    }
    return -negamax(b, -side, depth, -beta, -alpha, exact);   // pass
  }
  if (depth === 0 && !exact) return evaluate(b, side);
  let best = -Infinity;
  moves.sort((a, z) => W[z] - W[a]);
  for (const m of moves) {
    const v = -negamax(play(b, m, side).board, -side, depth - 1, -beta, -alpha, exact);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

export const LEVELS = { easy: { depth: 1, noise: 40 }, medium: { depth: 3, noise: 6 }, hard: { depth: 5, noise: 0 } };

export function pickComputerMove(b, level = 'medium', rnd = Math.random) {
  const { depth, noise } = LEVELS[level] || LEVELS.medium;
  const moves = legalMoves(b, CPU);
  if (moves.length <= 1) return moves.length ? moves[0] : -1;
  const exact = level === 'hard' && count(b).empty <= 10;   // play the ending perfectly
  let best = moves[0], bestScore = -Infinity;
  for (const m of moves) {
    const v = -negamax(play(b, m, CPU).board, YOU, exact ? 64 : depth - 1, -Infinity, Infinity, exact) +
      (noise ? (rnd() - 0.5) * noise * 2 : 0);
    if (v > bestScore) { bestScore = v; best = m; }
  }
  return best;
}
