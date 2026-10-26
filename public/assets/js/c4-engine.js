// Four in a Row rules, computer player and daily puzzle generator. No DOM here.
export const ROWS = 6;
export const COLS = 7;
export const YOU = 1;
export const CPU = 2;

export const emptyBoard = () => new Array(ROWS * COLS).fill(0);

export function lowestRow(b, c) {
  for (let r = ROWS - 1; r >= 0; r--) if (!b[r * COLS + c]) return r;
  return -1;
}

export function place(b, c, p) {
  const r = lowestRow(b, c);
  const nb = b.slice();
  nb[r * COLS + c] = p;
  return nb;
}

export const validCols = (b) => [0, 1, 2, 3, 4, 5, 6].filter((c) => lowestRow(b, c) >= 0);
export const isFull = (b) => b.every(Boolean);

// Returns the 4 winning cell indexes for player p, or null.
export function findLine(b, p) {
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      for (const [dr, dc] of dirs) {
        const cells = [];
        for (let k = 0; k < 4; k++) {
          const rr = r + dr * k, cc = c + dc * k;
          if (rr < 0 || rr >= ROWS || cc < 0 || cc >= COLS || b[rr * COLS + cc] !== p) break;
          cells.push(rr * COLS + cc);
        }
        if (cells.length === 4) return cells;
      }
    }
  }
  return null;
}

export const winningCols = (b, p) => validCols(b).filter((c) => findLine(place(b, c, p), p));

// Computer: win if it can, block if it must, avoid handing over a win, prefer the centre.
export function pickComputerMove(b, rnd = Math.random) {
  const v = validCols(b);
  const win = winningCols(b, CPU);
  if (win.length) return win[0];
  const block = winningCols(b, YOU);
  if (block.length) return block[0];
  const order = [3, 2, 4, 1, 5, 0, 6].filter((c) => v.includes(c));
  const safe = order.filter((c) => winningCols(place(b, c, CPU), YOU).length === 0);
  const pool = safe.length ? safe : order;
  return pool[Math.floor(rnd() * Math.min(pool.length, 2))];
}

// ---- Daily puzzle: same position for everyone on a given date ----
function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A position where gold (you) has exactly one winning move, and blue is also threatening,
// so the obvious "block" is the wrong answer.
export function dailyPuzzle(key) {
  let fallback = null;
  for (let attempt = 0; attempt < 2000; attempt++) {
    const rnd = mulberry32(hashStr(key + ':' + attempt));
    let b = emptyBoard();
    let p = YOU;
    const moves = 12 + 2 * Math.floor(rnd() * 5); // 12–20, even → gold to move
    let ok = true;
    for (let i = 0; i < moves; i++) {
      const opts = validCols(b).filter((c) => !findLine(place(b, c, p), p));
      if (!opts.length) { ok = false; break; }
      b = place(b, opts[Math.floor(rnd() * opts.length)], p);
      p = p === YOU ? CPU : YOU;
    }
    if (!ok) continue;
    const wins = winningCols(b, YOU);
    if (wins.length !== 1) continue;
    const threats = winningCols(b, CPU).filter((c) => c !== wins[0]);
    if (threats.length >= 1) return { board: b, answer: wins[0] };
    if (!fallback) fallback = { board: b, answer: wins[0] };
  }
  return fallback;
}
