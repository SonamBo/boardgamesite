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
//   Sudoku      9 rows of 9 digits, '.' or 0 for empty, joined with '/'; or { grid, notes } where notes is 'auto'
//               (show every empty cell's candidates) or { r1c2: '27', … }. Cells are 'r1c1' (top left) to 'r9c9'.
//               A move fills one empty cell: 'r3c5=7'. Only moves that clash with nothing are legal.
//               Facts: single (it was the cell's only candidate), hidden (the only place for that digit in its
//               row, column or box), solved (the grid is full).
//   Backgammon  { you: { '24': 2, … }, them: { '1': 2, … }, bar: [you, them], off: [you, them], dice: [3, 1] }.
//               Points are numbered 1–24 from your side (your home board is 1–6); both colours use your numbers.
//               A move plays the whole roll, in standard notation: '8/5 6/5', 'bar/22', '6/off 4/off'. Several
//               orders that end in the same position count as the same move; the course checker says which way to
//               write it. Facts: hit, point (made a new point of 2+), safe (no single checkers left anywhere),
//               off (checkers borne off), entered (came in from the bar).
//   Five in a Row  15 rows of 15, top row first: '.' empty, 'g' gold (you, moves first), 'b' ivory. Points are named
//               like Go: columns a–o, rows 1–15 from the bottom ('h8' is the centre). Facts: win (five or more in a
//               line), threat (this move made a new point where you'd make five next turn: a four), three (this move
//               made a new open three: a move that would make an open four), double (the opponent can't stop you: whatever they play, you win or make two
//               threats next), block (the opponent had a five or an open four to make next turn, and now hasn't).
//   Hex         n rows of n (7×7 in the lessons), top row first: '.' empty, 'g' gold (you, joins top to bottom,
//               moves first), 'b' ivory (joins left to right). Cells are named column a… then row 1… from the top ('d4').
//               Facts: win (a chain joins your two edges), block (the opponent could have won next turn and now can't),
//               bridge (the stone forms a bridge with one of yours: not touching, with two shared empty neighbours),
//               connect (it joins two of your groups that weren't touching), shorter (it cuts how many more stones you
//               need), longer (it adds to how many more stones the opponent needs).
//   Nine Men's Morris  { gold: 'a7 d7', ivory: 'g1', hand: [7, 8] } (pieces still to place: gold, ivory). Gold (you)
//               moves. Points use the usual notation: files a–g, ranks 1–7 from the bottom ('d2'). Moves: 'd2' (place),
//               'd2-d3' (move or fly), plus 'xg4' when it makes a mill and removes that piece ('a7-d7xg4').
//               Facts: mill, removed, win (the opponent is down to two pieces or can't move), block (the opponent had
//               a point that would make a mill next turn, and now hasn't).
//   Solitaire   Klondike, one card at a time. { tab: ['#5S #2D KH', …7 columns, bottom card first, '#' = face down],
//               found: { S: 3, H: 0, D: 1, C: 0 } (cards already up, ace first), stock: '9C 4D' (top card last),
//               waste: '8H' (top card last) }. Cards are rank + suit: 'AS', '10H', 'QD', 'KC'.
//               Moves: 'QH-t5' (that card, and any cards on it, onto column 5), '7C-f' (to its foundation), 'draw'.
//               Tap names: a card ('QH'), 'stock', 'waste', 'f' (foundations) or 't1'–'t7' (a column).
//               Facts: found (a card went to a foundation), reveal (a face-down card was turned over),
//               empty (a column was emptied), king (a king went into an empty column), draw.
import * as G from './go-engine.js';
import * as R from './reversi-engine.js';
import * as F from './c4-engine.js';
import * as SU from './sudoku-engine.js';
import * as BG from './backgammon-engine.js';
import * as K from './solitaire-engine.js';

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

// ---------- Sudoku ----------
const suName = (i) => 'r' + (Math.floor(i / 9) + 1) + 'c' + (i % 9 + 1);
const suIndex = (n) => (Number(n[1]) - 1) * 9 + Number(n[3]) - 1;
const candidates = (g, i) => {
  if (g[i]) return [];
  const used = new Set(SU.PEERS[i].map((j) => g[j]));
  return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((v) => !used.has(v));
};
const UNITS = [
  ...Array.from({ length: 9 }, (_, r) => Array.from({ length: 9 }, (_, c) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, c) => Array.from({ length: 9 }, (_, r) => r * 9 + c)),
  ...Array.from({ length: 9 }, (_, b) => Array.from({ length: 9 }, (_, k) => (Math.floor(b / 3) * 3 + Math.floor(k / 3)) * 9 + (b % 3) * 3 + (k % 3)))
];
export const sudoku = {
  kind: 'sudoku',
  cells: Array.from({ length: 81 }, (_, i) => suName(i)),
  name: suName,
  index: suIndex,
  candidates,
  load(p) {
    const src = typeof p === 'string' ? p : p && p.grid;
    const rows = String(src).split('/');
    if (rows.length !== 9 || rows.some((r) => r.length !== 9 || /[^.0-9]/.test(r))) fail('Sudoku position needs 9 rows of 9 from . and 1–9: ' + src);
    const g = rows.join('').split('').map((ch) => (ch === '.' ? 0 : Number(ch)));
    if (SU.conflicts(g).size) fail('the grid has a clash at ' + [...SU.conflicts(g)].map(suName).join(' '));
    const notes = typeof p === 'object' && p.notes ? p.notes : null;
    return { g, notes, side: 0 };
  },
  list(s) {
    const out = [];
    for (let i = 0; i < 81; i++) for (const v of candidates(s.g, i)) out.push({ name: suName(i) + '=' + v, i, v });
    return out;
  },
  find(s, name) { return this.list(s).find((x) => x.name === name); },
  apply(s, x) {
    const cand = candidates(s.g, x.i);
    const hidden = UNITS.some((u) => u.includes(x.i) && u.filter((j) => candidates(s.g, j).includes(x.v)).length === 1);
    const g = s.g.slice();
    g[x.i] = x.v;
    let notes = s.notes;
    if (notes && notes !== 'auto') { notes = { ...notes }; delete notes[suName(x.i)]; }
    return { s: { g, notes, side: 0 }, f: { single: cand.length === 1, hidden, solved: g.every(Boolean) } };
  },
  dests: () => [],
  isSquare: (n) => /^r[1-9]c[1-9]$/.test(n)
};

// ---------- Backgammon ----------
const bgPt = (x) => (x === 'bar' ? 'bar' : x === 'off' ? 'off' : String(x + 1));
const bgKey = (st) => st.pts.join(',') + '|' + st.bar + '|' + st.off;
const bgNote = (seq) => seq.slice().sort((a, b) => (b.from === 'bar' ? 25 : b.from) - (a.from === 'bar' ? 25 : a.from)).map((m) => bgPt(m.from) + '/' + bgPt(m.to)).join(' ');
export const backgammon = {
  kind: 'backgammon',
  cells: Array.from({ length: 24 }, (_, i) => String(i + 1)).concat('bar', 'off'),
  key: bgKey,
  note: bgNote,
  load(p) {
    if (!p || typeof p !== 'object' || !p.you || !p.them) fail('Backgammon position needs { you, them, bar, off, dice }');
    const pts = new Array(24).fill(0);
    for (const [k, n] of Object.entries(p.you)) { if (!(k >= 1 && k <= 24)) fail('bad point ' + k); pts[k - 1] += n; }
    for (const [k, n] of Object.entries(p.them)) { if (!(k >= 1 && k <= 24)) fail('bad point ' + k); if (pts[k - 1]) fail('both colours on point ' + k); pts[k - 1] -= n; }
    const bar = (p.bar || [0, 0]).slice(), off = (p.off || [0, 0]).slice();
    const mine = pts.filter((v) => v > 0).reduce((a, v) => a + v, 0) + bar[0] + off[0];
    const theirs = -pts.filter((v) => v < 0).reduce((a, v) => a + v, 0) + bar[1] + off[1];
    if (mine !== 15 || theirs !== 15) fail('each side needs 15 checkers (you ' + mine + ', them ' + theirs + ')');
    if (p.dice && (p.dice.length !== 2 || p.dice.some((d) => !(d >= 1 && d <= 6)))) fail('dice must be two numbers 1–6');
    return { s: { pts, bar, off }, dice: p.dice || null, side: 0 };
  },
  // every distinct way to play the roll (different orders reaching the same position count once)
  list(st) {
    if (!st.dice) return [];
    return BG.plays(st.s, 0, st.dice).map((pl) => ({ name: bgNote(pl.seq), seq: pl.seq, end: pl.end }));
  },
  find(st, name) {
    const all = this.list(st);
    const exact = all.find((x) => x.name === name);
    if (exact) return exact;
    // the same play written another way: replay it and compare where it ends
    const toks = String(name).trim().split(/\s+/);
    const left = st.dice[0] === st.dice[1] ? [st.dice[0], st.dice[0], st.dice[0], st.dice[0]] : st.dice.slice();
    let cur = st.s;
    for (const t of toks) {
      const [a, b] = t.split('/');
      const from = a === 'bar' ? 'bar' : Number(a) - 1;
      const k = left.findIndex((d) => { const m = BG.moveFor(cur, 0, from, d); return m && bgPt(m.to) === b; });
      if (k < 0) return undefined;
      cur = BG.apply(cur, 0, BG.moveFor(cur, 0, from, left[k]));
      left.splice(k, 1);
    }
    return all.find((x) => bgKey(x.end) === bgKey(cur));
  },
  apply(st, x) {
    const a = st.s, e = x.end;
    const blots = e.pts.filter((v) => v === 1).length;
    let point = false;
    for (let i = 0; i < 24; i++) if (e.pts[i] >= 2 && a.pts[i] < 2) point = true;
    const f = { hit: e.bar[1] > a.bar[1], point, safe: blots === 0, off: e.off[0] - a.off[0], entered: a.bar[0] > e.bar[0] };
    return { s: { s: e, dice: null, side: 1 }, f };
  },
  dests: () => [],
  isSquare: (n) => /^([1-9]|1[0-9]|2[0-4]|bar|off)$/.test(n)
};

// ---------- Solitaire ----------
const SUITL = 'SHDC';
export const cardCode = (n) => K.RANKS[K.rank(n) - 1] + SUITL[K.suit(n)];
const cardNum = (code) => {
  const m = /^(A|[2-9]|10|J|Q|K)([SHDC])$/.exec(code);
  if (!m) fail('bad card ' + code);
  return SUITL.indexOf(m[2]) * 13 + K.RANKS.indexOf(m[1]);
};
const cardList = (str) => String(str || '').trim().split(/\s+/).filter(Boolean);
export const solitaire = {
  kind: 'solitaire',
  cardCode,
  load(p) {
    if (!p || !Array.isArray(p.tab) || p.tab.length !== 7) fail('Solitaire position needs tab: 7 columns');
    const seen = new Set();
    const use = (code) => { const n = cardNum(code); if (seen.has(n)) fail('card twice: ' + code); seen.add(n); return n; };
    const found = [0, 1, 2, 3].map((su) => {
      const k = (p.found || {})[SUITL[su]] || 0;
      return Array.from({ length: k }, (_, r) => use(K.RANKS[r] + SUITL[su]));
    });
    const tab = p.tab.map((col) => cardList(col).map((t) => ({ c: use(t.replace('#', '')), up: !t.startsWith('#') })));
    tab.forEach((col, i) => { if (col.length && !col[col.length - 1].up) fail('column ' + (i + 1) + ' ends with a face-down card'); });
    const stock = cardList(p.stock).map(use), waste = cardList(p.waste).map(use);
    return { k: { stock, waste, found, tab, draw: 1 }, side: 0 };
  },
  // every legal move: drawing, and every card or stack that can go somewhere
  list(st) {
    const s = st.k, out = [];
    if (K.canDraw(s)) out.push({ name: 'draw', draw: true });
    const srcs = [];
    if (s.waste.length) srcs.push({ from: 'waste' });
    s.tab.forEach((pile, col) => pile.forEach((x, idx) => { if (x.up) srcs.push({ from: 'tab', col, idx }); }));
    for (const src of srcs) {
      const card = K.cardsAt(s, src)[0];
      if (K.canMove(s, src, { to: 'found' })) out.push({ name: cardCode(card) + '-f', src, dest: { to: 'found' } });
      for (let col = 0; col < 7; col++) if (K.canMove(s, src, { to: 'tab', col })) out.push({ name: cardCode(card) + '-t' + (col + 1), src, dest: { to: 'tab', col } });
    }
    return out;
  },
  find(st, name) { return this.list(st).find((x) => x.name === name); },
  apply(st, x) {
    const s = st.k;
    if (x.draw) return { s: { k: K.drawCards(s), side: 0 }, f: { draw: true } };
    const n = K.move(s, x.src, x.dest);
    const downs = (k) => k.tab.reduce((a, p) => a + p.filter((c) => !c.up).length, 0);
    const card = K.cardsAt(s, x.src)[0];
    const emptied = x.src.from === 'tab' && x.src.idx === 0;
    const f = { found: x.dest.to === 'found', reveal: downs(n) < downs(s), empty: emptied, king: x.dest.to === 'tab' && !s.tab[x.dest.col].length && K.rank(card) === 13 };
    return { s: { k: n, side: 0 }, f };
  },
  dests: () => [],
  isSquare: (n) => /^(t[1-7]|f|stock|waste|(A|[2-9]|10|J|Q|K)[SHDC])$/.test(n)
};


// ---------- Five in a Row ----------
const GMN = 15, GMF = 'abcdefghijklmno';
const gmName = (i) => GMF[i % GMN] + (GMN - Math.floor(i / GMN));
const gmIndex = (n) => (GMN - Number(n.slice(1))) * GMN + GMF.indexOf(n[0]);
const GDIRS = [[0, 1], [1, 0], [1, 1], [1, -1]];
const gAt = (r, c) => (r >= 0 && c >= 0 && r < GMN && c < GMN ? r * GMN + c : -1);
function gFive(b, i, p) {
  const r = Math.floor(i / GMN), c = i % GMN;
  for (const [dr, dc] of GDIRS) {
    const line = [i];
    for (const s of [1, -1]) for (let k = 1; ; k++) { const j = gAt(r + dr * k * s, c + dc * k * s); if (j < 0 || b[j] !== p) break; line.push(j); }
    if (line.length >= 5) return line;
  }
  return null;
}
// empty points next to (within two of) a stone: where anything happens in these small positions
function gNear(b) {
  const out = [];
  for (let i = 0; i < GMN * GMN; i++) {
    if (b[i]) continue;
    const r = Math.floor(i / GMN), c = i % GMN;
    let near = false;
    for (let dr = -2; dr <= 2 && !near; dr++) for (let dc = -2; dc <= 2; dc++) { const j = gAt(r + dr, c + dc); if (j >= 0 && b[j]) { near = true; break; } }
    if (near) out.push(i);
  }
  return out;
}
const gWins = (b, p) => gNear(b).filter((i) => { b[i] = p; const w = gFive(b, i, p); b[i] = 0; return !!w; });
// moves that make an open four (two different winning points at once)
const gOpenFours = (b, p) => gNear(b).filter((i) => { b[i] = p; const n = gWins(b, p).length; b[i] = 0; return n >= 2; });
// p to move after this: can p's opponent (who just moved) no longer be stopped?
function gUnstoppable(b, me) {
  const opp = 3 - me;
  if (gWins(b, me).length >= 2) return true;
  for (const r of gNear(b)) {
    b[r] = opp;
    const oppWon = !!gFive(b, r, opp);
    let ok = false;
    if (!oppWon) ok = gWins(b, me).length > 0 || gOpenFours(b, me).length > 0;
    b[r] = 0;
    if (!ok) return false;
  }
  return true;
}
export const gomoku = {
  kind: 'gomoku',
  cells: Array.from({ length: GMN * GMN }, (_, i) => gmName(i)),
  name: gmName,
  index: gmIndex,
  load(p) {
    const rows = String(p).split('/');
    if (rows.length !== GMN || rows.some((r) => r.length !== GMN || /[^.gb]/.test(r))) fail('Five in a Row position needs 15 rows of 15 from . g b: ' + p);
    const b = rows.join('').split('').map((ch) => (ch === 'g' ? 1 : ch === 'b' ? 2 : 0));
    for (let i = 0; i < b.length; i++) if (b[i] && gFive(b, i, b[i])) fail('the position already has five in a row at ' + gmName(i));
    return { b, side: 1 };
  },
  list(s) { return s.b.map((v, i) => (v ? null : { name: gmName(i), i })).filter(Boolean); },
  find(s, name) { const i = gmIndex(name); return s.b[i] === 0 && /^[a-o](1[0-5]|[1-9])$/.test(name) ? { name, i } : undefined; },
  apply(s, x) {
    const me = s.side, opp = 3 - me;
    const before = s.b;
    const oppHad = gWins(before.slice(), opp).length > 0 || gOpenFours(before.slice(), opp).length > 0;
    const winsBefore = new Set(gWins(before.slice(), me)), foursBefore = new Set(gOpenFours(before.slice(), me));
    const b = before.slice(); b[x.i] = me;
    const line = gFive(b, x.i, me);
    const f = { win: !!line };
    if (!line) {
      // a new threat or open three: one this move made, not one that was already there
      f.threat = gWins(b.slice(), me).some((i) => !winsBefore.has(i));
      f.three = gOpenFours(b.slice(), me).some((i) => !foursBefore.has(i) && i !== x.i);
      f.block = oppHad && !gWins(b.slice(), opp).length && !gOpenFours(b.slice(), opp).length;
      f.double = gUnstoppable(b.slice(), me);
    }
    return { s: { b, side: opp }, f, line };
  },
  dests: () => [],
  isSquare: (n) => /^[a-o](1[0-5]|[1-9])$/.test(n)
};


// ---------- Hex ----------
const HXF = 'abcdefghijk';
const HXNB = [[-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0]];
function hexGeo(n) {
  const nbs = (i) => { const r = Math.floor(i / n), c = i % n; return HXNB.map(([dr, dc]) => [r + dr, c + dc]).filter(([a, b]) => a >= 0 && b >= 0 && a < n && b < n).map(([a, b]) => a * n + b); };
  const start = (p, i) => (p === 1 ? Math.floor(i / n) === 0 : i % n === 0);
  const end = (p, i) => (p === 1 ? Math.floor(i / n) === n - 1 : i % n === n - 1);
  function chain(b, p) {
    const seen = new Set(), q = [], prev = new Map();
    for (let i = 0; i < n * n; i++) if (b[i] === p && start(p, i)) { q.push(i); seen.add(i); }
    while (q.length) {
      const i = q.shift();
      if (end(p, i)) { const path = []; for (let x = i; x != null; x = prev.get(x)) path.push(x); return path; }
      for (const j of nbs(i)) if (!seen.has(j) && b[j] === p) { seen.add(j); prev.set(j, i); q.push(j); }
    }
    return null;
  }
  // fewest empty cells p still needs to connect
  function need(b, p) {
    const dist = new Array(n * n).fill(Infinity), todo = [];
    for (let i = 0; i < n * n; i++) if (start(p, i) && b[i] !== 3 - p) { dist[i] = b[i] === p ? 0 : 1; todo.push(i); }
    while (todo.length) {
      let k = 0; for (let t = 1; t < todo.length; t++) if (dist[todo[t]] < dist[todo[k]]) k = t;
      const i = todo.splice(k, 1)[0];
      for (const j of nbs(i)) { if (b[j] === 3 - p) continue; const d = dist[i] + (b[j] === p ? 0 : 1); if (d < dist[j]) { dist[j] = d; todo.push(j); } }
    }
    let best = 99; for (let i = 0; i < n * n; i++) if (end(p, i)) best = Math.min(best, dist[i]);
    return best;
  }
  const group = (b, i) => { const p = b[i], seen = new Set([i]), q = [i]; while (q.length) { const x = q.pop(); for (const j of nbs(x)) if (!seen.has(j) && b[j] === p) { seen.add(j); q.push(j); } } return seen; };
  return { nbs, chain, need, group };
}
export const hex = {
  kind: 'hex',
  load(p) {
    const rows = String(p).split('/'), n = rows.length;
    if (n < 3 || n > 11 || rows.some((r) => r.length !== n || /[^.gb]/.test(r))) fail('Hex position needs n rows of n (3–11) from . g b: ' + p);
    const b = rows.join('').split('').map((ch) => (ch === 'g' ? 1 : ch === 'b' ? 2 : 0));
    const G = hexGeo(n);
    if (G.chain(b, 1) || G.chain(b, 2)) fail('the position already has a winning chain');
    return { b, n, side: 1 };
  },
  name: (i, n = 7) => HXF[i % n] + (Math.floor(i / n) + 1),
  index: (name, n = 7) => (Number(name.slice(1)) - 1) * n + HXF.indexOf(name[0]),
  list(s) { return s.b.map((v, i) => (v ? null : { name: hex.name(i, s.n), i })).filter(Boolean); },
  find(s, name) { return this.list(s).find((x) => x.name === name); },
  apply(s, x) {
    const G = hexGeo(s.n), me = s.side, opp = 3 - me, before = s.b;
    const oppCould = G.need(before, opp) <= 1;
    const meNeed = G.need(before, me), oppNeed = G.need(before, opp);
    const b = before.slice(); b[x.i] = me;
    const line = G.chain(b, me);
    const f = { win: !!line };
    // bridge: an own stone two steps away, not touching, with both shared neighbours empty
    const mine = new Set(G.nbs(x.i));
    f.bridge = b.some((v, j) => v === me && j !== x.i && !mine.has(j) && G.nbs(j).filter((k) => mine.has(k) && !b[k]).length === 2);
    const touching = G.nbs(x.i).filter((j) => b[j] === me);
    const groups = new Set(); const tmp = before.slice();
    for (const j of touching) { const g = G.group(tmp, j); groups.add(Math.min(...g)); }
    f.connect = groups.size >= 2;
    f.block = oppCould && G.need(b, opp) > 1;
    f.shorter = G.need(b, me) < meNeed;
    f.longer = G.need(b, opp) > oppNeed;
    return { s: { b, n: s.n, side: opp }, f, line };
  },
  dests: () => [],
  isSquare: (n) => /^[a-k](1[01]|[1-9])$/.test(n)
};


// ---------- Nine Men's Morris ----------
const NM_XY = [[0, 0], [3, 0], [6, 0], [1, 1], [3, 1], [5, 1], [2, 2], [3, 2], [4, 2], [0, 3], [1, 3], [2, 3], [4, 3], [5, 3], [6, 3], [2, 4], [3, 4], [4, 4], [1, 5], [3, 5], [5, 5], [0, 6], [3, 6], [6, 6]];
const NM_MILLS = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [9, 10, 11], [12, 13, 14], [15, 16, 17], [18, 19, 20], [21, 22, 23], [0, 9, 21], [3, 10, 18], [6, 11, 15], [1, 4, 7], [16, 19, 22], [8, 12, 17], [5, 13, 20], [2, 14, 23]];
const NM_ADJ = NM_XY.map(() => []);
NM_MILLS.forEach(([a, b, c]) => { NM_ADJ[a].push(b); NM_ADJ[b].push(a, c); NM_ADJ[c].push(b); });
const nmName = (i) => 'abcdefg'[NM_XY[i][0]] + (7 - NM_XY[i][1]);
const NM_NAMES = NM_XY.map((_, i) => nmName(i));
const nmIndex = (n) => NM_NAMES.indexOf(n);
const nmOn = (b, p) => b.filter((x) => x === p).length;
const nmInMill = (b, i) => NM_MILLS.some((m) => m.includes(i) && m.every((j) => b[j] === b[i] && b[i]));
const nmMakes = (b, i, p) => NM_MILLS.some((m) => m.includes(i) && m.every((j) => (j === i ? p : b[j]) === p));
function nmSteps(s, p) {   // moves without the removal: [{ from, to }]
  const out = [];
  if (s.hand[p] > 0) { s.b.forEach((x, i) => { if (!x) out.push({ to: i }); }); return out; }
  const fly = nmOn(s.b, p) === 3;
  s.b.forEach((x, i) => {
    if (x !== p) return;
    (fly ? s.b.map((y, j) => (y ? -1 : j)).filter((j) => j >= 0) : NM_ADJ[i].filter((j) => !s.b[j])).forEach((j) => out.push({ from: i, to: j }));
  });
  return out;
}
function nmRemovable(b, p) {
  const all = b.map((x, i) => (x === 3 - p ? i : -1)).filter((i) => i >= 0);
  const free = all.filter((i) => !nmInMill(b, i));
  return free.length ? free : all;
}
const nmLost = (s, p) => (s.hand[p] === 0 && nmOn(s.b, p) < 3) || (nmOn(s.b, p) + s.hand[p] >= 3 && !nmSteps(s, p).length);
// points where p would make a mill with their next move
function nmMillPoints(s, p) {
  const out = new Set();
  for (const m of nmSteps(s, p)) {
    const b = s.b.slice(); if (m.from != null) b[m.from] = 0;
    if (nmMakes(b, m.to, p)) out.add(m.to);
  }
  return out;
}
export const morris = {
  kind: 'morris',
  cells: NM_NAMES,
  name: nmName,
  index: nmIndex,
  load(p) {
    if (!p || typeof p !== 'object') fail('Morris position needs { gold, ivory, hand }');
    const b = new Array(24).fill(0);
    for (const [k, v] of [['gold', 1], ['ivory', 2]]) for (const n of String(p[k] || '').split(/\s+/).filter(Boolean)) {
      const i = nmIndex(n); if (i < 0) fail('no point called ' + n); if (b[i]) fail('two pieces on ' + n); b[i] = v;
    }
    const hand = [0, ...(p.hand || [0, 0])];
    if (nmOn(b, 1) + hand[1] > 9 || nmOn(b, 2) + hand[2] > 9) fail('more than nine pieces for one side');
    return { b, hand, side: 1 };
  },
  list(s) {
    const p = s.side, out = [];
    for (const m of nmSteps(s, p)) {
      const b = s.b.slice(); if (m.from != null) b[m.from] = 0; b[m.to] = p;
      const base = (m.from != null ? nmName(m.from) + '-' : '') + nmName(m.to);
      if (nmMakes(s.b.map((x, i) => (i === m.from ? 0 : x)), m.to, p)) nmRemovable(b, p).forEach((t) => out.push({ name: base + 'x' + nmName(t), ...m, take: t }));
      else out.push({ name: base, ...m });
    }
    return out;
  },
  find(s, name) { return this.list(s).find((x) => x.name === name); },
  apply(s, x) {
    const p = s.side, o = 3 - p;
    const threatBefore = nmMillPoints(s, o).size > 0;
    const b = s.b.slice(), hand = s.hand.slice();
    if (x.from != null) b[x.from] = 0; else hand[p]--;
    b[x.to] = p;
    if (x.take != null) b[x.take] = 0;
    const next = { b, hand, side: o };
    const f = { mill: x.take != null, removed: x.take != null ? 1 : 0, win: nmLost(next, o) };
    f.block = threatBefore && nmMillPoints(next, o).size === 0;
    return { s: next, f };
  },
  dests(s, from) { return this.list(s).filter((x) => x.name.startsWith(from + '-')).map((x) => x.name.split('-')[1].split('x')[0]); },
  isSquare: (n) => NM_NAMES.includes(n),
  geometry: { XY: NM_XY, MILLS: NM_MILLS, removable: nmRemovable }
};

export const RULES = { go, reversi, c4, sudoku, backgammon, solitaire, gomoku, hex, morris };
