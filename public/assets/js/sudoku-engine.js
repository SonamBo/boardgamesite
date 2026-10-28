// Sudoku: makes puzzles with exactly one solution, and checks them. No page code.
// A grid is an array of 81 numbers, 0 for empty.

const ROW = (i) => Math.floor(i / 9);
const COL = (i) => i % 9;
const BOX = (i) => Math.floor(ROW(i) / 3) * 3 + Math.floor(COL(i) / 3);

// The 20 cells that share a row, column or box with each cell.
export const PEERS = Array.from({ length: 81 }, (_, i) => {
  const out = [];
  for (let j = 0; j < 81; j++) if (j !== i && (ROW(j) === ROW(i) || COL(j) === COL(i) || BOX(j) === BOX(i))) out.push(j);
  return out;
});
export { ROW, COL, BOX };

const bit = (n) => 1 << n;
const ALL = 0b1111111110; // bits 1..9

function masks(grid) {
  const r = new Array(9).fill(0), c = new Array(9).fill(0), b = new Array(9).fill(0);
  for (let i = 0; i < 81; i++) {
    const v = grid[i];
    if (v) { r[ROW(i)] |= bit(v); c[COL(i)] |= bit(v); b[BOX(i)] |= bit(v); }
  }
  return { r, c, b };
}
const popcount = (x) => { let n = 0; while (x) { x &= x - 1; n++; } return n; };

// Counts solutions up to `limit` (2 is enough to know a puzzle is unique). Fills `out` with the first one.
export function countSolutions(grid, limit = 2, out = null, rand = null) {
  const g = grid.slice();
  const { r, c, b } = masks(g);
  let count = 0;
  function search() {
    // the empty cell with the fewest options
    let best = -1, bestOpts = 0, bestN = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const opts = ALL & ~(r[ROW(i)] | c[COL(i)] | b[BOX(i)]);
      const n = popcount(opts);
      if (n < bestN) { best = i; bestOpts = opts; bestN = n; if (n <= 1) break; }
    }
    if (best < 0) { count++; if (out && count === 1) out.splice(0, 81, ...g); return count >= limit; }
    if (!bestN) return false;
    const digits = [];
    for (let v = 1; v <= 9; v++) if (bestOpts & bit(v)) digits.push(v);
    if (rand) for (let k = digits.length - 1; k > 0; k--) { const j = Math.floor(rand() * (k + 1)); [digits[k], digits[j]] = [digits[j], digits[k]]; }
    const R = ROW(best), C = COL(best), B = BOX(best);
    for (const v of digits) {
      g[best] = v; r[R] |= bit(v); c[C] |= bit(v); b[B] |= bit(v);
      if (search()) return true;
      g[best] = 0; r[R] &= ~bit(v); c[C] &= ~bit(v); b[B] &= ~bit(v);
    }
    return false;
  }
  search();
  return count;
}

// Givens left on the board for each level. Fewer givens is harder.
export const LEVELS = { easy: 40, medium: 32, hard: 26 };

export function generate(rand, level = 'medium') {
  const solution = new Array(81).fill(0);
  countSolutions(new Array(81).fill(0), 1, solution, rand);
  const puzzle = solution.slice();
  const target = LEVELS[level] || LEVELS.medium;
  // Remove cells in symmetric pairs while the puzzle keeps exactly one solution.
  const order = Array.from({ length: 41 }, (_, i) => i);
  for (let k = order.length - 1; k > 0; k--) { const j = Math.floor(rand() * (k + 1)); [order[k], order[j]] = [order[j], order[k]]; }
  let givens = 81;
  for (const i of order) {
    if (givens <= target) break;
    const j = 80 - i;
    const a = puzzle[i], bb = puzzle[j];
    puzzle[i] = 0; puzzle[j] = 0;
    if (countSolutions(puzzle, 2) !== 1) { puzzle[i] = a; puzzle[j] = bb; continue; }
    givens -= i === j ? 1 : 2;
  }
  // Then single cells, if the pairs ran out before the target.
  for (let i = 0; i < 81 && givens > target; i++) {
    const k = Math.floor(rand() * 81);
    if (!puzzle[k]) continue;
    const a = puzzle[k];
    puzzle[k] = 0;
    if (countSolutions(puzzle, 2) !== 1) puzzle[k] = a; else givens--;
  }
  return { puzzle, solution };
}

// Cells whose value clashes with a peer.
export function conflicts(grid) {
  const bad = new Set();
  for (let i = 0; i < 81; i++) {
    if (!grid[i]) continue;
    for (const j of PEERS[i]) if (grid[j] === grid[i]) { bad.add(i); bad.add(j); }
  }
  return bad;
}

export const isSolved = (grid, solution) => grid.every((v, i) => v === solution[i]);
