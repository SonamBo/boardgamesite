// Lesson rules for Go, Reversi and Four in a Row: positions, move names and move facts, on top of the real
// game engines. Shared by the lesson boards (learn-boards.js) and the course checker (tools/check-courses.mjs),
// so a lesson can never expect a move the board won't allow.
//
// Each adapter: load(position) → state or throws; list(state) → [{ name, ... }]; find(state, name);
// apply(state, x) → { s, f } (next state, facts); dests() → []; isSquare(name); cells (every square name).
//
// Positions and names
//   Go          9 rows of 9, top row first: '.' empty, 'x' black, 'o' white. Black (you) moves first.
//               Points are named like the game page: columns a–j without i, rows 1–9 from the bottom ('e5').
//               Facts: capture, captured, atari (a touching enemy group left with one liberty), saved (the group
//               of the stone you played has 2+ liberties).
//   Reversi     8 rows of 8, top row first: '.' empty, 'g' gold (you, moves first), 'b' black.
//               Squares use Othello notation like the game page: a1 is the top-left corner. Facts: capture (discs
//               flipped), flipped, corner. A side with no move passes automatically.
//   Four in a Row  6 rows of 7, top row first: '.' empty, 'g' gold (you, moves first), 'b' ivory.
//               Moves are columns '1'–'7'. Cells for marks and taps: columns a–g, rows 1–6 from the bottom ('d1').
//               Facts: win, threat (you now have a winning drop next turn), double (two of them), block (you
//               filled the column where the opponent was about to win).
import * as G from './go-engine.js';
import * as R from './reversi-engine.js';
import * as F from './c4-engine.js';

const fail = (msg) => { throw new Error(msg); };

// ---------- Go ----------
const GF = 'abcdefghj';
const goName = (i) => GF[i % 9] + (9 - Math.floor(i / 9));
const goIndex = (n) => (9 - Number(n.slice(1))) * 9 + GF.indexOf(n[0]);
export const go = {
  kind: 'go',
  cells: Array.from({ length: 81 }, (_, i) => goName(i)),
  name: goName,
  index: goIndex,
  load(p) {
    const rows = String(p).split('/');
    if (rows.length !== 9 || rows.some((r) => r.length !== 9 || /[^.xo]/.test(r))) fail('Go position needs 9 rows of 9 from . x o: ' + p);
    const b = rows.join('').split('').map((ch) => (ch === 'x' ? 1 : ch === 'o' ? 2 : 0));
    for (let i = 0; i < 81; i++) if (b[i] && !G.group(b, i).libs) fail('a group with no liberties at ' + goName(i));
    return { b, side: 1, prev: null };
  },
  list(s) {
    const out = [];
    for (let i = 0; i < 81; i++) { const r = G.play(s.b, i, s.side, s.prev); if (r) out.push({ name: goName(i), i, r }); }
    return out;
  },
  find(s, name) { return this.list(s).find((x) => x.name === name); },
  apply(s, x) {
    const nb = x.r.b, opp = 3 - s.side;
    // atari: the stone just played leaves a touching enemy group with one liberty
    const atari = G.neighbours(x.i).some((j) => nb[j] === opp && G.group(nb, j).libs === 1);
    const f = { capture: x.r.captured > 0, captured: x.r.captured, atari, saved: G.group(nb, x.i).libs >= 2 };
    return { s: { b: nb, side: opp, prev: s.b }, f };
  },
  dests: () => [],
  isSquare: (n) => /^[a-hj][1-9]$/.test(n)
};

// ---------- Reversi ----------
const FILES = 'abcdefgh';
const rvName = (i) => FILES[i & 7] + ((i >> 3) + 1);
const rvIndex = (n) => (Number(n[1]) - 1) * 8 + FILES.indexOf(n[0]);
const CORNERS = [0, 7, 56, 63];
export const reversi = {
  kind: 'reversi',
  cells: Array.from({ length: 64 }, (_, i) => rvName(i)),
  name: rvName,
  index: rvIndex,
  load(p) {
    const rows = String(p).split('/');
    if (rows.length !== 8 || rows.some((r) => r.length !== 8 || /[^.gb]/.test(r))) fail('Reversi position needs 8 rows of 8 from . g b: ' + p);
    const b = rows.join('').split('').map((ch) => (ch === 'g' ? R.YOU : ch === 'b' ? R.CPU : 0));
    return { b, side: R.YOU };
  },
  list(s) { return R.legalMoves(s.b, s.side).map((i) => ({ name: rvName(i), i })); },
  find(s, name) { return this.list(s).find((x) => x.name === name); },
  apply(s, x) {
    const r = R.play(s.b, x.i, s.side);
    let side = -s.side;
    if (!R.legalMoves(r.board, side).length && R.legalMoves(r.board, s.side).length) side = s.side;   // pass
    const f = { capture: r.flips.length > 0, flipped: r.flips.length, corner: CORNERS.includes(x.i), win: R.isOver(r.board) && R.count(r.board).you > R.count(r.board).cpu };
    return { s: { b: r.board, side }, f, flips: r.flips };
  },
  dests: () => [],
  isSquare: (n) => /^[a-h][1-8]$/.test(n)
};

// ---------- Four in a Row ----------
const C4F = 'abcdefg';
const c4Name = (i) => C4F[i % 7] + (6 - Math.floor(i / 7));
const c4Index = (n) => (6 - Number(n[1])) * 7 + C4F.indexOf(n[0]);
export const c4 = {
  kind: 'c4',
  cells: Array.from({ length: 42 }, (_, i) => c4Name(i)),
  name: c4Name,
  index: c4Index,
  load(p) {
    const rows = String(p).split('/');
    if (rows.length !== 6 || rows.some((r) => r.length !== 7 || /[^.gb]/.test(r))) fail('Four in a Row position needs 6 rows of 7 from . g b: ' + p);
    const b = rows.join('').split('').map((ch) => (ch === 'g' ? F.YOU : ch === 'b' ? F.CPU : 0));
    for (let i = 0; i < 35; i++) if (b[i] && !b[i + 7]) fail('a floating disc at ' + c4Name(i));
    if (F.findLine(b, F.YOU) || F.findLine(b, F.CPU)) fail('the position already has four in a row');
    return { b, side: F.YOU };
  },
  list(s) { return F.validCols(s.b).map((c) => ({ name: String(c + 1), c })); },
  find(s, name) { return this.list(s).find((x) => x.name === name); },
  apply(s, x) {
    const opp = s.side === F.YOU ? F.CPU : F.YOU;
    const block = F.winningCols(s.b, opp).includes(x.c);
    const nb = F.place(s.b, x.c, s.side);
    const line = F.findLine(nb, s.side);
    const threats = line ? 0 : F.winningCols(nb, s.side).length;
    const cell = F.lowestRow(s.b, x.c) * 7 + x.c;
    return { s: { b: nb, side: opp }, f: { win: !!line, threat: threats >= 1, double: threats >= 2, block }, cell, line };
  },
  dests: () => [],
  isSquare: (n) => /^[a-g][1-6]$/.test(n) || /^[1-7]$/.test(n)
};

export const RULES = { go, reversi, c4 };
