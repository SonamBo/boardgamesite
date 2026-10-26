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

// ---- Computer players ----
// easy:   takes a win when it sees one, blocks only half the time, otherwise plays loosely
// medium: wins, blocks, avoids handing over a win, prefers the centre
// hard:   looks 8 moves ahead
export function pickComputerMove(b, level = 'medium', rnd = Math.random) {
  if (level === 'easy') return easyMove(b, rnd);
  if (level === 'hard') return hardMove(b);
  return mediumMove(b, rnd);
}

function easyMove(b, rnd) {
  const win = winningCols(b, CPU);
  if (win.length) return win[0];
  const block = winningCols(b, YOU);
  if (block.length && rnd() < 0.5) return block[0];
  const v = validCols(b);
  const weights = v.map((c) => 4 - Math.abs(3 - c));
  let r = rnd() * weights.reduce((a, w) => a + w, 0);
  for (let i = 0; i < v.length; i++) { r -= weights[i]; if (r <= 0) return v[i]; }
  return v[v.length - 1];
}

function mediumMove(b, rnd) {
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

// ---- Hard: negamax search with alpha-beta pruning ----
const ORDER = [3, 2, 4, 1, 5, 0, 6];
const HARD_DEPTH = 8;
const WIN_SCORE = 1000000;
const WINDOWS = (() => {
  const out = [];
  const dirs = [[0, 1], [1, 0], [1, 1], [1, -1]];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      for (const [dr, dc] of dirs) {
        const er = r + dr * 3, ec = c + dc * 3;
        if (er < 0 || er >= ROWS || ec < 0 || ec >= COLS) continue;
        out.push([0, 1, 2, 3].map((k) => (r + dr * k) * COLS + (c + dc * k)));
      }
    }
  }
  return out;
})();

function winsAt(b, idx, p) {
  const r0 = Math.floor(idx / COLS), c0 = idx % COLS;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    let n = 1;
    for (const s of [1, -1]) {
      let r = r0 + dr * s, c = c0 + dc * s;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && b[r * COLS + c] === p) { n++; r += dr * s; c += dc * s; }
    }
    if (n >= 4) return true;
  }
  return false;
}

// Position score for player p: open threes and twos, plus the centre column.
function evaluate(b, p) {
  const o = p === YOU ? CPU : YOU;
  let s = 0;
  for (let r = 0; r < ROWS; r++) {
    const v = b[r * COLS + 3];
    if (v === p) s += 3; else if (v === o) s -= 3;
  }
  for (const w of WINDOWS) {
    let mine = 0, theirs = 0;
    for (const i of w) { if (b[i] === p) mine++; else if (b[i] === o) theirs++; }
    if (theirs === 0) { if (mine === 3) s += 5; else if (mine === 2) s += 2; }
    else if (mine === 0) { if (theirs === 3) s -= 4; else if (theirs === 2) s -= 1; }
  }
  return s;
}

function negamax(b, p, depth, alpha, beta) {
  const o = p === YOU ? CPU : YOU;
  const cols = ORDER.filter((c) => lowestRow(b, c) >= 0);
  if (!cols.length) return 0;
  for (const c of cols) {
    const idx = lowestRow(b, c) * COLS + c;
    b[idx] = p;
    const w = winsAt(b, idx, p);
    b[idx] = 0;
    if (w) return WIN_SCORE + depth;          // quicker wins score higher
  }
  if (depth === 0) return evaluate(b, p);
  let best = -Infinity;
  for (const c of cols) {
    const idx = lowestRow(b, c) * COLS + c;
    b[idx] = p;
    const v = -negamax(b, o, depth - 1, -beta, -alpha);
    b[idx] = 0;
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

function hardMove(board) {
  const b = board.slice();
  let bestCol = -1, bestV = -Infinity;
  for (const c of ORDER) {
    const r = lowestRow(b, c);
    if (r < 0) continue;
    const idx = r * COLS + c;
    b[idx] = CPU;
    if (winsAt(b, idx, CPU)) return c;
    const v = -negamax(b, YOU, HARD_DEPTH - 1, -Infinity, -bestV);
    b[idx] = 0;
    if (v > bestV || bestCol < 0) { bestV = v; bestCol = c; }
  }
  return bestCol;
}
