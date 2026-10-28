// Picture Logic (nonograms): makes random pictures that can be solved by logic alone, one line at a time.
// A grid is an array of rows; each cell is 1 (filled) or 0 (empty).

export function clues(line) {
  const out = [];
  let run = 0;
  for (const v of line) { if (v) run++; else if (run) { out.push(run); run = 0; } }
  if (run) out.push(run);
  return out.length ? out : [0];
}

// Everything that's certain in one line, given its clue and what's known: -1 unknown, 0 empty, 1 filled.
// Returns null if the line can't be completed.
function solveLine(clue, known) {
  const n = known.length;
  const blocks = clue[0] === 0 ? [] : clue;
  const canFill = new Array(n).fill(false), canEmpty = new Array(n).fill(false);
  // memo[b][pos]: can blocks b.. be placed starting at or after pos
  const memo = new Map();
  function fits(b, pos) {
    const key = b * 64 + pos;
    if (memo.has(key)) return memo.get(key);
    let ok = false;
    if (b === blocks.length) {
      ok = true;
      for (let i = pos; i < n; i++) if (known[i] === 1) { ok = false; break; }
      if (ok) for (let i = pos; i < n; i++) canEmpty[i] = true;
    } else {
      const len = blocks[b];
      for (let start = pos; start + len <= n; start++) {
        // cells pos..start-1 empty
        let gapOk = true;
        for (let i = pos; i < start; i++) if (known[i] === 1) { gapOk = false; break; }
        if (!gapOk) break;
        let blockOk = true;
        for (let i = start; i < start + len; i++) if (known[i] === 0) { blockOk = false; break; }
        if (!blockOk) continue;
        if (start + len < n && known[start + len] === 1) continue;
        const next = Math.min(n, start + len + 1);
        if (fits(b + 1, next)) {
          ok = true;
          for (let i = pos; i < start; i++) canEmpty[i] = true;
          for (let i = start; i < start + len; i++) canFill[i] = true;
          if (start + len < n) canEmpty[start + len] = true;
        }
      }
    }
    memo.set(key, ok);
    return ok;
  }
  if (!fits(0, 0)) return null;
  return known.map((_, i) => (canFill[i] && !canEmpty[i] ? 1 : !canFill[i] && canEmpty[i] ? 0 : -1));
}

// True if the clues pin down every cell using line-by-line logic (so the picture is unique and fair).
export function logicSolvable(rowClues, colClues) {
  const h = rowClues.length, w = colClues.length;
  const g = Array.from({ length: h }, () => new Array(w).fill(-1));
  let changed = true;
  while (changed) {
    changed = false;
    for (let r = 0; r < h; r++) {
      const res = solveLine(rowClues[r], g[r]);
      if (!res) return false;
      for (let c = 0; c < w; c++) if (g[r][c] === -1 && res[c] !== -1) { g[r][c] = res[c]; changed = true; }
    }
    for (let c = 0; c < w; c++) {
      const col = g.map((row) => row[c]);
      const res = solveLine(colClues[c], col);
      if (!res) return false;
      for (let r = 0; r < h; r++) if (g[r][c] === -1 && res[r] !== -1) { g[r][c] = res[r]; changed = true; }
    }
  }
  return g.every((row) => row.every((v) => v !== -1));
}

// A random picture with some clumping, so it looks like shapes rather than noise.
function randomPicture(n, rand, density) {
  let g = Array.from({ length: n }, () => Array.from({ length: n }, () => (rand() < density ? 1 : 0)));
  for (let pass = 0; pass < 2; pass++) {
    g = g.map((row, r) => row.map((v, c) => {
      let s = 0, k = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const rr = r + dr, cc = c + dc;
        if (rr >= 0 && cc >= 0 && rr < n && cc < n) { s += g[rr][cc]; k++; }
      }
      const f = s / k;
      return f > 0.55 ? 1 : f < 0.4 ? 0 : v;
    }));
  }
  return g;
}

export const SIZES = { easy: 5, medium: 10, hard: 15 };

export function generate(rand, level = 'medium') {
  const n = SIZES[level] || 10;
  for (let tries = 0; tries < 400; tries++) {
    const pic = randomPicture(n, rand, 0.58);
    const filled = pic.flat().filter(Boolean).length;
    if (filled < n * n * 0.35 || filled > n * n * 0.75) continue;
    const rowClues = pic.map(clues);
    const colClues = pic[0].map((_, c) => clues(pic.map((row) => row[c])));
    if (logicSolvable(rowClues, colClues)) return { n, pic, rowClues, colClues };
  }
  // Fallback that's always solvable: a filled frame with a cross.
  const pic = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => (r === 0 || c === 0 || r === n - 1 || c === n - 1 || r === c ? 1 : 0)));
  return { n, pic, rowClues: pic.map(clues), colClues: pic[0].map((_, c) => clues(pic.map((row) => row[c]))) };
}
