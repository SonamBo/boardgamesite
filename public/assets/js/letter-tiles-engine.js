// Letter Tiles: board, scoring, checking a move and finding the computer's moves. No page code.
// The board is N×N; board[r][c] is a letter or ''.
import { words, isWord, trie } from './word-lib.js';

export const N = 11;
export const CENTRE = 5;
// Our own letter values and tile counts (no blanks).
export const VALUES = { a: 1, b: 3, c: 3, d: 2, e: 1, f: 4, g: 3, h: 4, i: 1, j: 8, k: 5, l: 1, m: 3, n: 1, o: 1, p: 3, q: 10, r: 1, s: 1, t: 1, u: 2, v: 5, w: 4, x: 8, y: 4, z: 10 };
const COUNTS = { a: 7, b: 2, c: 2, d: 3, e: 10, f: 2, g: 2, h: 2, i: 7, j: 1, k: 1, l: 3, m: 2, n: 5, o: 6, p: 2, q: 1, r: 5, s: 4, t: 5, u: 3, v: 1, w: 2, x: 1, y: 2, z: 1 };
export const RACK = 7, BONUS = 35;
export function bag(rand = Math.random) {
  const b = [];
  for (const [ch, n] of Object.entries(COUNTS)) for (let i = 0; i < n; i++) b.push(ch);
  for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

// Bonus squares: dl/tl = double/triple letter, dw/tw = double/triple word. Our own symmetric layout.
const Q = [
  'tw .  .  dl .  tw',
  '.  dw .  .  tl .',
  '.  .  dw .  .  dl',
  'dl .  .  dw .  .',
  '.  tl .  .  .  .',
  'tw .  dl .  .  dw'
].map((r) => r.trim().split(/\s+/));
export const BONUSES = Array.from({ length: N }, (_, r) => Array.from({ length: N }, (_, c) => {
  const rr = Math.min(r, N - 1 - r), cc = Math.min(c, N - 1 - c);
  const v = Q[Math.min(rr, cc)][Math.max(rr, cc)];
  return v === '.' ? '' : v;
}));

// Two-letter words aren't in the main list, so here are the everyday ones we accept.
const TWO = new Set('am an as at ax be by do go ha he hi if in is it lo ma me my no of oh ok on or ox pa pi so to uh um up us we ye yo'.split(' '));
export const valid = (w) => (w.length === 2 ? TWO.has(w) : isWord(w));

const inB = (r, c) => r >= 0 && c >= 0 && r < N && c < N;
export const empty = () => Array.from({ length: N }, () => new Array(N).fill(''));
export const isEmptyBoard = (b) => b.every((row) => row.every((x) => !x));

// Check a set of placed tiles [{r,c,ch}] and score it. Returns { ok, error, score, words }.
export function evaluate(board, placed) {
  if (!placed.length) return { ok: false, error: 'Place some tiles first' };
  const rows = new Set(placed.map((p) => p.r)), cols = new Set(placed.map((p) => p.c));
  if (rows.size > 1 && cols.size > 1) return { ok: false, error: 'Tiles must be in one row or one column' };
  const b = board.map((row) => row.slice());
  for (const p of placed) { if (b[p.r][p.c]) return { ok: false, error: 'That square is taken' }; b[p.r][p.c] = p.ch; }
  const horiz = rows.size === 1 && (cols.size > 1 || hasNeighbour(b, placed[0].r, placed[0].c, 0, 1));
  const [dr, dc] = horiz ? [0, 1] : [1, 0];
  // no gaps
  const line = placed.map((p) => (horiz ? p.c : p.r)).sort((a, z) => a - z);
  const fixed = horiz ? placed[0].r : placed[0].c;
  for (let k = line[0]; k <= line[line.length - 1]; k++) {
    const [r, c] = horiz ? [fixed, k] : [k, fixed];
    if (!b[r][c]) return { ok: false, error: 'Leave no gaps between your tiles' };
  }
  const first = isEmptyBoard(board);
  if (first && !placed.some((p) => p.r === CENTRE && p.c === CENTRE)) return { ok: false, error: 'The first word must cover the centre star' };
  if (first && placed.length < 2) return { ok: false, error: 'The first word needs at least 2 letters' };
  if (!first && !placed.some((p) => hasNeighbour(board, p.r, p.c, 0, 1) || hasNeighbour(board, p.r, p.c, 1, 0))) return { ok: false, error: 'Your word must join the tiles already on the board' };
  const newSet = new Set(placed.map((p) => p.r * N + p.c));
  const found = [];
  const main = wordAt(b, placed[0].r, placed[0].c, dr, dc);
  if (main.word.length >= 2) found.push(main);
  for (const p of placed) {
    const cross = wordAt(b, p.r, p.c, dc, dr);
    if (cross.word.length >= 2) found.push(cross);
  }
  if (!found.length) return { ok: false, error: 'Make a word of at least 2 letters' };
  for (const f of found) if (!valid(f.word)) return { ok: false, error: f.word.toUpperCase() + ' isn’t in our word list' };
  let score = 0;
  for (const f of found) score += scoreWord(b, f.cells, newSet);
  if (placed.length === RACK) score += BONUS;
  return { ok: true, score, words: found.map((f) => f.word) };
}
function hasNeighbour(b, r, c, dr, dc) { return (inB(r - dr, c - dc) && !!b[r - dr][c - dc]) || (inB(r + dr, c + dc) && !!b[r + dr][c + dc]); }
function wordAt(b, r, c, dr, dc) {
  while (inB(r - dr, c - dc) && b[r - dr][c - dc]) { r -= dr; c -= dc; }
  let word = '';
  const cells = [];
  while (inB(r, c) && b[r][c]) { word += b[r][c]; cells.push([r, c]); r += dr; c += dc; }
  return { word, cells };
}
function scoreWord(b, cells, newSet) {
  let s = 0, mult = 1;
  for (const [r, c] of cells) {
    let v = VALUES[b[r][c]];
    if (newSet.has(r * N + c)) {
      const bon = BONUSES[r][c];
      if (bon === 'dl') v *= 2;
      if (bon === 'tl') v *= 3;
      if (bon === 'dw') mult *= 2;
      if (bon === 'tw') mult *= 3;
    }
    s += v;
  }
  return s * mult;
}

// ---------- Move finder (anchor-based search over a prefix tree) ----------
let T = null;
const TWO_LIST = [...TWO];
function tree() { if (!T) T = trie(words().filter((w) => w.length >= 3 && w.length <= N).concat(TWO_LIST)); return T; }

export function allMoves(board, rack) {
  const moves = [];
  const seen = new Set();
  const first = isEmptyBoard(board);
  for (const horiz of [true, false]) {
    // read the board along rows (horiz) or columns
    const get = (i, j) => (horiz ? board[i][j] : board[j][i]);
    const at = (i, j) => (horiz ? { r: i, c: j } : { r: j, c: i });
    for (let i = 0; i < N; i++) {
      // letters allowed in each empty square by the words running across it
      const cross = [];
      for (let j = 0; j < N; j++) {
        if (get(i, j)) { cross.push(null); continue; }
        let up = '', down = '';
        for (let k = i - 1; k >= 0 && get(k, j); k--) up = get(k, j) + up;
        for (let k = i + 1; k < N && get(k, j); k++) down += get(k, j);
        if (!up && !down) cross.push('*');
        else {
          let ok = '';
          for (const ch of 'abcdefghijklmnopqrstuvwxyz') if (valid(up + ch + down)) ok += ch;
          cross.push(ok);
        }
      }
      const anchor = (j) => !get(i, j) && (first ? i === CENTRE && j === CENTRE
        : (j > 0 && get(i, j - 1)) || (j < N - 1 && get(i, j + 1)) || (i > 0 && get(i - 1, j)) || (i < N - 1 && get(i + 1, j)));
      const extend = (j, node, word, placed, left, hitAnchor) => {
        if (j >= N || !get(i, j)) {
          if (node.$ && hitAnchor && placed.length && word.length >= 2) {
            const key = (horiz ? 'h' : 'v') + i + ':' + placed.map((p) => p.r + ',' + p.c + p.ch).join('|');
            if (!seen.has(key)) { seen.add(key); moves.push(placed.slice()); }
          }
        }
        if (j >= N) return;
        const fixedCh = get(i, j);
        if (fixedCh) { if (node[fixedCh]) extend(j + 1, node[fixedCh], word + fixedCh, placed, left, hitAnchor); return; }
        const allowed = cross[j];
        const tried = new Set();
        for (let k = 0; k < left.length; k++) {
          const ch = left[k];
          if (tried.has(ch) || !node[ch] || (allowed !== '*' && !allowed.includes(ch))) continue;
          tried.add(ch);
          const rest = left.slice(0, k) + left.slice(k + 1);
          placed.push({ ...at(i, j), ch });
          extend(j + 1, node[ch], word + ch, placed, rest, hitAnchor || anchor(j));
          placed.pop();
        }
      };
      // start a word at each square that's not directly after a letter
      for (let s = 0; s < N; s++) {
        if (s > 0 && get(i, s - 1)) continue;
        // only useful if an anchor is within reach
        let reach = false;
        for (let j = s, used = 0; j < N && used <= rack.length; j++) { if (anchor(j)) { reach = true; break; } if (!get(i, j)) used++; }
        if (!reach) continue;
        extend(s, tree(), '', [], rack.join(''), false);
      }
    }
  }
  const scored = [];
  for (const placed of moves) {
    const ev = evaluate(board, placed);
    if (ev.ok) scored.push({ placed, score: ev.score, words: ev.words });
  }
  return scored.sort((a, b) => b.score - a.score);
}
