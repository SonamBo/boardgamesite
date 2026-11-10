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
//   Dots and Boxes  { n: 3, lines: 'h:0:0 v:1:2 …', you: '0:0', them: '1:1 1:2' } (n boxes a side; boxes already
//               claimed, as row:column; their four sides must be drawn). You move. A line is 'h:r:c' (r 0…n, c 0…n−1)
//               or 'v:r:c' (r 0…n−1, c 0…n); a box is 'b:r:c' (for marks). Closing a box means you move again.
//               Facts: box (closed at least one box), captured (how many), safe (no box now has three sides drawn),
//               gift (some box now has three sides: your opponent can take it).
//   Tricks      Spades and Hearts, one trick at a time: { game: 'spades' | 'hearts', hand: 'AS 10H 2C', trick: 'QH KH'
//               (cards already played to this trick, in order, by the players before you), broken: true (spades or
//               hearts have been played, so you may lead them), first: true (Hearts: the first trick, where no points
//               may be played if you can help it) }. A move plays one card from your hand: '10H'.
//               Facts: follow (followed the suit led), trump (Spades: a spade played on another suit), win (your card
//               is winning the trick: certain when you play last), duck (a card lower than the one winning),
//               points (Hearts: hearts and the Q♠ in the trick, if you win it), dump (Hearts: you played a heart or the
//               Q♠ on a trick someone else is winning).
//   Gin Rummy   { hand: '10 cards' }, or 11 after you've drawn: then a move discards one card: 'KH'. Facts: deadwood (the points
//               left outside melds after the discard), best (no other discard leaves less), gin (0 deadwood),
//               knock (10 or less).
//   FreeCell    { tab: ['KS QH …' ×8, bottom card first], cells: 'QH 7C' (up to four), found: { S: 2, … } }. Moves:
//               'QH-t5' (that card, and the ordered run on it, onto column 5, if there's room to move it), 'QH-c' (to
//               a free cell), '7C-f' (to its foundation). Facts: found, empty (a column was emptied), cell (a card went
//               to a free cell), freed (a card left a free cell).
//   Spider      { tab: ['#KS #9H 5S 4S' ×10, bottom card first, '#' = face down], deals: 3 (rows left to deal), done: 0 }.
//               Moves: '5S-t4' (that card and the same-suit run on it onto column 4: one rank higher in any suit, or
//               empty), 'deal'. A complete King-to-Ace run of one suit is cleared at once. Facts: insuit (moved onto
//               the same suit), reveal (a face-down card was turned over), empty, complete, deal.
//   Dice, Mines, Picture Logic, Cryptogram  Boards for looking and tapping (info, choice and tap steps; no moves).
//               Dice: { dice: [3, 3, 5, 1, 6], label: 'Your roll', kept: [6, 5] } (tap names 'd1'…'d5').
//               Mines: rows top first, '.' hidden, 'F' flag, '0'–'8' open (tap names 'r1c1', top left).
//               Picture Logic: { rows: ['1 1', '3', …], cols: […], grid: ['..#', 'x..', …] } with '#' filled, 'x' crossed
//               (tap names 'r1c1'). Cryptogram: { text: 'XLI UYMGO …', key: { X: 'T' } } (tap names: the cipher letter).
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


// ---------- Dots and Boxes ----------
const dbSides = (r, c) => ['h:' + r + ':' + c, 'h:' + (r + 1) + ':' + c, 'v:' + r + ':' + c, 'v:' + r + ':' + (c + 1)];
function dbAll(n) {
  const out = [];
  for (let r = 0; r <= n; r++) for (let c = 0; c < n; c++) out.push('h:' + r + ':' + c);
  for (let r = 0; r < n; r++) for (let c = 0; c <= n; c++) out.push('v:' + r + ':' + c);
  return out;
}
function dbBoxesOf(id, n) {
  const [t, r, c] = [id[0], +id.split(':')[1], +id.split(':')[2]], out = [];
  if (t === 'h') { if (r > 0) out.push([r - 1, c]); if (r < n) out.push([r, c]); } else { if (c > 0) out.push([r, c - 1]); if (c < n) out.push([r, c]); }
  return out;
}
const dbCount = (L, r, c) => dbSides(r, c).filter((x) => L.has(x)).length;
export const dots = {
  kind: 'dots',
  load(p) {
    if (!p || typeof p !== 'object' || !(p.n >= 2 && p.n <= 6)) fail('Dots and Boxes position needs { n, lines, you, them }');
    const n = p.n, all = new Set(dbAll(n));
    const lines = new Set(String(p.lines || '').split(/\s+/).filter(Boolean));
    for (const l of lines) if (!all.has(l)) fail('no line called ' + l);
    const owner = new Array(n * n).fill(0);
    for (const [k, v] of [['you', 1], ['them', 2]]) for (const bx of String(p[k] || '').split(/\s+/).filter(Boolean)) {
      const [r, c] = bx.split(':').map(Number); if (!(r >= 0 && r < n && c >= 0 && c < n)) fail('no box ' + bx); owner[r * n + c] = v;
    }
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const full = dbCount(lines, r, c) === 4;
      if (full && !owner[r * n + c]) fail('box ' + r + ':' + c + ' has four sides but no owner');
      if (!full && owner[r * n + c]) fail('box ' + r + ':' + c + ' has an owner but not four sides');
    }
    return { n, lines, owner, side: 1 };
  },
  lines: dbAll,
  list(s) { return dbAll(s.n).filter((l) => !s.lines.has(l)).map((l) => ({ name: l })); },
  find(s, name) { return s.lines.has(name) ? undefined : this.list(s).find((x) => x.name === name); },
  apply(s, x) {
    const lines = new Set(s.lines); lines.add(x.name);
    const owner = s.owner.slice();
    let closed = 0;
    for (const [r, c] of dbBoxesOf(x.name, s.n)) if (dbCount(lines, r, c) === 4) { owner[r * s.n + c] = s.side; closed++; }
    let threes = 0;
    for (let r = 0; r < s.n; r++) for (let c = 0; c < s.n; c++) if (!owner[r * s.n + c] && dbCount(lines, r, c) === 3) threes++;
    const f = { box: closed > 0, captured: closed, safe: threes === 0, gift: threes > 0 };
    return { s: { n: s.n, lines, owner, side: closed ? s.side : 3 - s.side }, f };
  },
  dests: () => [],
  isSquare: (n) => /^(h|v|b):\d:\d$/.test(n)
};


// ---------- Card games: shared ----------
const crank = (n) => K.rank(n);                    // 1 (Ace) … 13 (King)
const csuit = (n) => K.suit(n);                    // 0 spades, 1 hearts, 2 diamonds, 3 clubs
const highRank = (n) => (crank(n) === 1 ? 14 : crank(n));   // Aces high in trick games
function cardsOnce(...lists) {
  const seen = new Set(), out = [];
  for (const l of lists) out.push(cardList(l).map((c) => { const n = cardNum(c); if (seen.has(n)) fail('card twice: ' + c); seen.add(n); return n; }));
  return out;
}

// ---------- Spades and Hearts (one trick) ----------
function trickWinner(cards, game) {
  let w = 0;
  for (let k = 1; k < cards.length; k++) {
    const a = cards[w], b = cards[k];
    const beats = csuit(b) === csuit(a) ? highRank(b) > highRank(a) : game === 'spades' && csuit(b) === 0 && csuit(a) !== 0;
    if (beats) w = k;
  }
  return w;
}
const isPoint = (n) => csuit(n) === 1 || cardCode(n) === 'QS';
export const tricks = {
  kind: 'tricks',
  cardCode,
  load(p) {
    if (!p || !['spades', 'hearts'].includes(p.game)) fail('Trick position needs game: spades or hearts');
    const [hand, trick] = cardsOnce(p.hand, p.trick);
    if (!hand.length) fail('the hand is empty');
    if (trick.length > 3) fail('a trick has at most three cards before yours');
    return { game: p.game, hand, trick, broken: !!p.broken, first: !!p.first, side: 0 };
  },
  list(s) {
    let ok = s.hand;
    if (s.trick.length) {
      const led = csuit(s.trick[0]), follow = s.hand.filter((c) => csuit(c) === led);
      if (follow.length) ok = follow;
      else if (s.game === 'hearts' && s.first) { const clean = s.hand.filter((c) => !isPoint(c)); if (clean.length) ok = clean; }
    } else {
      const special = s.game === 'spades' ? 0 : 1;
      if (!s.broken) { const other = s.hand.filter((c) => csuit(c) !== special); if (other.length) ok = other; }
    }
    return ok.map((c) => ({ name: cardCode(c), c }));
  },
  find(s, name) { return this.list(s).find((x) => x.name === name); },
  apply(s, x) {
    const cards = s.trick.concat(x.c), me = cards.length - 1;
    const before = s.trick.length ? s.trick[trickWinner(s.trick, s.game)] : null;
    const w = trickWinner(cards, s.game);
    const led = cards[0];
    const f = {
      follow: !s.trick.length || csuit(x.c) === csuit(led),
      trump: s.game === 'spades' && s.trick.length > 0 && csuit(x.c) === 0 && csuit(led) !== 0,
      win: w === me,
      duck: before != null && w !== me
    };
    if (s.game === 'hearts') {
      f.points = w === me ? cards.filter(isPoint).reduce((n, c) => n + (cardCode(c) === 'QS' ? 13 : 1), 0) : 0;
      f.dump = w !== me && isPoint(x.c);
      f.clean = !f.points;
    }
    return { s: { ...s, hand: s.hand.filter((c) => c !== x.c), trick: cards }, f };
  },
  dests: () => [],
  isSquare: (n) => /^(A|[2-9]|10|J|Q|K)[SHDC]$/.test(n)
};

// ---------- Gin Rummy (choosing a discard) ----------
const ginValue = (n) => Math.min(10, crank(n));
// lowest deadwood for a set of cards: try every way of making sets (same rank) and runs (same suit, in order)
function ginBest(cards) {
  const melds = [];
  const byRank = {}, bySuit = {};
  cards.forEach((c) => { (byRank[crank(c)] ||= []).push(c); (bySuit[csuit(c)] ||= []).push(c); });
  Object.values(byRank).forEach((g) => {
    if (g.length >= 3) { melds.push(g.slice()); if (g.length === 4) for (let k = 0; k < 4; k++) melds.push(g.filter((_, j) => j !== k)); }
  });
  Object.values(bySuit).forEach((g) => {
    const sorted = g.slice().sort((a, b) => crank(a) - crank(b));
    for (let i = 0; i < sorted.length; i++) for (let j = i + 2; j < sorted.length; j++) {
      const run = sorted.slice(i, j + 1);
      if (run.every((c, k) => !k || crank(c) === crank(run[k - 1]) + 1)) melds.push(run);
    }
  });
  let best = { dead: cards.reduce((n, c) => n + ginValue(c), 0), melds: [] };
  (function go(k, used, chosen) {
    const dead = cards.filter((c) => !used.has(c)).reduce((n, c) => n + ginValue(c), 0);
    if (dead < best.dead) best = { dead, melds: chosen.slice() };
    for (let i = k; i < melds.length; i++) {
      if (melds[i].some((c) => used.has(c))) continue;
      melds[i].forEach((c) => used.add(c)); chosen.push(melds[i]);
      go(i + 1, used, chosen);
      melds[i].forEach((c) => used.delete(c)); chosen.pop();
    }
  })(0, new Set(), []);
  return best;
}
export const gin = {
  kind: 'gin',
  cardCode,
  deadwood: (codes) => ginBest(cardList(codes).map(cardNum)).dead,
  load(p) {
    const [hand] = cardsOnce(p && p.hand);
    if (hand.length !== 10 && hand.length !== 11) fail('a Gin Rummy hand has 10 cards (11 after drawing, ready to discard)');
    return { hand, side: 0 };
  },
  list(s) { return s.hand.length === 11 ? s.hand.map((c) => ({ name: cardCode(c), c })) : []; },
  find(s, name) { return this.list(s).find((x) => x.name === name); },
  apply(s, x) {
    const after = s.hand.filter((c) => c !== x.c);
    const dead = ginBest(after).dead;
    const bestAll = Math.min(...s.hand.map((c) => ginBest(s.hand.filter((d) => d !== c)).dead));
    return { s: { hand: after, side: 0 }, f: { deadwood: dead, best: dead === bestAll, gin: dead === 0, knock: dead <= 10 } };
  },
  melds: (s) => ginBest(s.hand).melds.map((m) => m.map(cardCode)),
  dests: () => [],
  isSquare: (n) => /^(A|[2-9]|10|J|Q|K)[SHDC]$/.test(n)
};

// ---------- FreeCell ----------
const fcRed = (n) => csuit(n) === 1 || csuit(n) === 2;
const fcFits = (c, onto) => crank(onto) === crank(c) + 1 && fcRed(onto) !== fcRed(c);
export const freecell = {
  kind: 'freecell',
  cardCode,
  load(p) {
    if (!p || !Array.isArray(p.tab) || p.tab.length !== 8) fail('FreeCell position needs tab: 8 columns');
    const seen = new Set();
    const use = (code) => { const n = cardNum(code); if (seen.has(n)) fail('card twice: ' + code); seen.add(n); return n; };
    const found = [0, 1, 2, 3].map((su) => (p.found || {})[SUITL[su]] || 0);
    found.forEach((k, su) => { for (let r = 0; r < k; r++) use(K.RANKS[r] + SUITL[su]); });
    const tab = p.tab.map((col) => cardList(col).map(use));
    const cells = cardList(p.cells).map(use);
    if (cells.length > 4) fail('only four free cells');
    return { tab, cells: cells.concat(new Array(4 - cells.length).fill(null)), found, side: 0 };
  },
  // how many cards can move at once: (free cells + 1) × 2^(empty columns), not counting the target column
  room(s, toEmpty) { const free = s.cells.filter((c) => c == null).length, empty = s.tab.filter((c) => !c.length).length - (toEmpty ? 1 : 0); return (free + 1) * 2 ** Math.max(0, empty); },
  list(s) {
    const out = [];
    const toFound = (c) => s.found[csuit(c)] === crank(c) - 1;
    s.cells.forEach((c) => {
      if (c == null) return;
      if (toFound(c)) out.push({ name: cardCode(c) + '-f', card: c, from: 'cell' });
      s.tab.forEach((col, k) => { if (!col.length || fcFits(c, col[col.length - 1])) out.push({ name: cardCode(c) + '-t' + (k + 1), card: c, from: 'cell', to: k }); });
    });
    s.tab.forEach((col, i) => {
      if (!col.length) return;
      const top = col[col.length - 1];
      if (toFound(top)) out.push({ name: cardCode(top) + '-f', card: top, from: i, n: 1 });
      if (s.cells.some((c) => c == null)) out.push({ name: cardCode(top) + '-c', card: top, from: i, n: 1 });
      // ordered runs ending at the top card
      let start = col.length - 1;
      while (start > 0 && fcFits(col[start], col[start - 1])) start--;
      for (let k = start; k < col.length; k++) {
        const card = col[k], n = col.length - k;
        s.tab.forEach((dest, j) => {
          if (j === i) return;
          if (dest.length ? fcFits(card, dest[dest.length - 1]) && n <= this.room(s, false) : n <= this.room(s, true) && n < col.length) out.push({ name: cardCode(card) + '-t' + (j + 1), card, from: i, n, to: j });
        });
      }
    });
    return out;
  },
  find(s, name) { return this.list(s).find((x) => x.name === name); },
  apply(s, x) {
    const tab = s.tab.map((c) => c.slice()), cells = s.cells.slice(), found = s.found.slice();
    let moving;
    if (x.from === 'cell') { cells[cells.indexOf(x.card)] = null; moving = [x.card]; } else moving = tab[x.from].splice(tab[x.from].length - x.n, x.n);
    const dest = x.name.split('-')[1];
    if (dest === 'f') found[csuit(x.card)]++;
    else if (dest === 'c') cells[cells.indexOf(null)] = x.card;
    else tab[x.to].push(...moving);
    const f = { found: dest === 'f', cell: dest === 'c', freed: x.from === 'cell', empty: x.from !== 'cell' && tab[x.from].length === 0 };
    return { s: { tab, cells, found, side: 0 }, f };
  },
  dests: () => [],
  isSquare: (n) => /^(A|[2-9]|10|J|Q|K)[SHDC]$/.test(n) || /^(t[1-8]|c[1-4]|f|cells)$/.test(n)
};


// ---------- Boards for looking and tapping ----------
const noMoves = (kind, load, isSquare) => ({ kind, load, list: () => [], find: () => undefined, apply: () => fail('no moves on this board'), dests: () => [], isSquare });
export const dice = noMoves('dice', (p) => {
  if (!p || !Array.isArray(p.dice) || !p.dice.length || p.dice.length > 6 || p.dice.some((d) => !(d >= 1 && d <= 6))) fail('Dice position needs dice: 1–6 numbers from 1 to 6');
  return { dice: p.dice.slice(), kept: (p.kept || []).slice(), label: p.label || '', side: 0 };
}, (n) => /^d[1-6]$/.test(n));
export const mines = noMoves('mines', (p) => {
  const rows = Array.isArray(p) ? p : String(p).split('/');
  if (!rows.length || rows.some((r) => r.length !== rows[0].length || /[^.F0-8]/.test(r))) fail('Mines position needs equal rows of . F 0–8');
  return { rows, side: 0 };
}, (n) => /^r\d+c\d+$/.test(n));
export const nonogram = noMoves('nonogram', (p) => {
  if (!p || !Array.isArray(p.rows) || !Array.isArray(p.cols) || !Array.isArray(p.grid)) fail('Picture Logic position needs rows, cols and grid');
  if (p.grid.length !== p.rows.length || p.grid.some((r) => r.length !== p.cols.length || /[^.#x]/.test(r))) fail('the grid must match the clues');
  return { rows: p.rows.map(String), cols: p.cols.map(String), grid: p.grid.slice(), side: 0 };
}, (n) => /^r\d+c\d+$/.test(n));
export const cryptogram = noMoves('cryptogram', (p) => {
  if (!p || typeof p.text !== 'string' || /[^A-Z ,.'’!?-]/.test(p.text)) fail('Cryptogram position needs text in capitals');
  return { text: p.text, key: { ...(p.key || {}) }, side: 0 };
}, (n) => /^[A-Z]$/.test(n));


// ---------- Spider ----------
export const spider = {
  kind: 'spider',
  cardCode,
  load(p) {
    if (!p || !Array.isArray(p.tab) || p.tab.length !== 10) fail('Spider position needs tab: 10 columns');
    const tab = p.tab.map((col) => cardList(col).map((t) => ({ c: cardNum(t.replace('#', '')), up: !t.startsWith('#') })));
    tab.forEach((col, i) => { if (col.length && !col[col.length - 1].up) fail('column ' + (i + 1) + ' ends with a face-down card'); });
    return { tab, deals: p.deals || 0, done: p.done || 0, side: 0 };
  },
  list(s) {
    const out = [];
    s.tab.forEach((col, i) => {
      if (!col.length) return;
      let start = col.length - 1;
      while (start > 0 && col[start - 1].up && csuit(col[start - 1].c) === csuit(col[start].c) && crank(col[start - 1].c) === crank(col[start].c) + 1) start--;
      for (let k = start; k < col.length; k++) {
        const card = col[k].c;
        s.tab.forEach((dest, j) => {
          if (j === i) return;
          const top = dest[dest.length - 1];
          if (dest.length ? crank(top.c) === crank(card) + 1 : k > 0) out.push({ name: cardCode(card) + '-t' + (j + 1), from: i, k, to: j });
        });
      }
    });
    if (s.deals > 0 && s.tab.every((c) => c.length)) out.push({ name: 'deal', deal: true });
    return out;
  },
  find(s, name) { return this.list(s).find((x) => x.name === name); },
  apply(s, x) {
    const tab = s.tab.map((c) => c.map((y) => ({ ...y })));
    const f = { insuit: false, reveal: false, empty: false, complete: false, deal: !!x.deal };
    if (x.deal) return { s: { ...s, tab, deals: s.deals - 1 }, f };   // the dealt cards aren't known in a lesson
    const moving = tab[x.from].splice(x.k);
    const dest = tab[x.to];
    f.insuit = dest.length > 0 && csuit(dest[dest.length - 1].c) === csuit(moving[0].c);
    dest.push(...moving);
    const src = tab[x.from];
    if (src.length && !src[src.length - 1].up) { src[src.length - 1].up = true; f.reveal = true; }
    f.empty = src.length === 0;
    let done = s.done;
    const t = dest;
    if (t.length >= 13) {
      const run = t.slice(-13);
      if (run.every((y, k) => y.up && csuit(y.c) === csuit(run[0].c) && crank(y.c) === 13 - k)) {
        t.splice(-13); done++; f.complete = true;
        if (t.length && !t[t.length - 1].up) { t[t.length - 1].up = true; f.reveal = true; }
      }
    }
    return { s: { tab, deals: s.deals, done, side: 0 }, f };
  },
  dests: () => [],
  isSquare: (n) => /^(A|[2-9]|10|J|Q|K)[SHDC]$/.test(n) || /^(t([1-9]|10)|deal)$/.test(n)
};

export const RULES = { go, reversi, c4, sudoku, backgammon, solitaire, gomoku, hex, morris, dots, tricks, gin, freecell, spider, dice, mines, nonogram, cryptogram };
