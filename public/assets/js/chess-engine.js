// Chess rules and the computer player. No page code.
// Board: 64 squares, a8 = 0 … h1 = 63. Pieces: 'PNBRQK' white, 'pnbrqk' black, '' empty.

export const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const FILES = 'abcdefgh';
export const sq = (name) => (8 - Number(name[1])) * 8 + FILES.indexOf(name[0]);
export const sqName = (i) => FILES[i % 8] + (8 - Math.floor(i / 8));
const isWhite = (p) => p && p === p.toUpperCase();
const colorOf = (p) => (p ? (isWhite(p) ? 'w' : 'b') : null);

export function fromFen(fen) {
  const [pos, turn, cast, ep, half, full] = fen.split(' ');
  const board = [];
  for (const ch of pos.replace(/\//g, '')) {
    if (/\d/.test(ch)) for (let k = 0; k < +ch; k++) board.push('');
    else board.push(ch);
  }
  return { board, turn, castle: cast === '-' ? '' : cast, ep: ep === '-' ? -1 : sq(ep), half: +half || 0, full: +full || 1 };
}
export function toFen(s) {
  let out = '';
  for (let r = 0; r < 8; r++) {
    let empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = s.board[r * 8 + f];
      if (!p) empty++; else { if (empty) out += empty; empty = 0; out += p; }
    }
    if (empty) out += empty;
    if (r < 7) out += '/';
  }
  return out + ' ' + s.turn + ' ' + (s.castle || '-') + ' ' + (s.ep >= 0 ? sqName(s.ep) : '-') + ' ' + s.half + ' ' + s.full;
}
const key = (s) => toFen(s).split(' ').slice(0, 4).join(' ');

const N_OFF = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const K_OFF = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ORTH = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const at = (r, f) => (r >= 0 && r < 8 && f >= 0 && f < 8 ? r * 8 + f : -1);

// Is square i attacked by side `by`?
export function attacked(board, i, by) {
  const r = Math.floor(i / 8), f = i % 8;
  const own = (p) => p && colorOf(p) === by;
  const pr = by === 'w' ? r + 1 : r - 1;
  for (const df of [-1, 1]) { const j = at(pr, f + df); if (j >= 0 && board[j] === (by === 'w' ? 'P' : 'p')) return true; }
  for (const [dr, df] of N_OFF) { const j = at(r + dr, f + df); if (j >= 0 && own(board[j]) && board[j].toLowerCase() === 'n') return true; }
  for (const [dr, df] of K_OFF) { const j = at(r + dr, f + df); if (j >= 0 && own(board[j]) && board[j].toLowerCase() === 'k') return true; }
  for (const [dirs, kinds] of [[DIAG, 'bq'], [ORTH, 'rq']]) {
    for (const [dr, df] of dirs) {
      let rr = r + dr, ff = f + df;
      while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
        const p = board[rr * 8 + ff];
        if (p) { if (own(p) && kinds.includes(p.toLowerCase())) return true; break; }
        rr += dr; ff += df;
      }
    }
  }
  return false;
}
const kingSq = (board, side) => board.indexOf(side === 'w' ? 'K' : 'k');
export const inCheck = (s, side = s.turn) => attacked(s.board, kingSq(s.board, side), side === 'w' ? 'b' : 'w');

// Moves: { from, to, piece, captured, promo, castle, ep }
function pseudo(s) {
  const out = [], b = s.board, me = s.turn, them = me === 'w' ? 'b' : 'w';
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!p || colorOf(p) !== me) continue;
    const r = Math.floor(i / 8), f = i % 8, t = p.toLowerCase();
    const add = (to, extra = {}) => out.push({ from: i, to, piece: p, captured: b[to] || '', ...extra });
    if (t === 'p') {
      const dir = me === 'w' ? -1 : 1, startRow = me === 'w' ? 6 : 1, lastRow = me === 'w' ? 0 : 7;
      const pushP = (to, extra = {}) => {
        if (Math.floor(to / 8) === lastRow) for (const q of 'qrbn') add(to, { ...extra, promo: me === 'w' ? q.toUpperCase() : q });
        else add(to, extra);
      };
      const one = at(r + dir, f);
      if (one >= 0 && !b[one]) {
        pushP(one);
        const two = at(r + 2 * dir, f);
        if (r === startRow && !b[two]) add(two);
      }
      for (const df of [-1, 1]) {
        const c = at(r + dir, f + df);
        if (c < 0) continue;
        if (b[c] && colorOf(b[c]) === them) pushP(c);
        if (c === s.ep) out.push({ from: i, to: c, piece: p, captured: me === 'w' ? 'p' : 'P', ep: true });
      }
    } else if (t === 'n' || t === 'k') {
      for (const [dr, df] of t === 'n' ? N_OFF : K_OFF) {
        const j = at(r + dr, f + df);
        if (j >= 0 && colorOf(b[j]) !== me) add(j);
      }
      if (t === 'k') {
        const row = me === 'w' ? 7 : 0, k0 = row * 8 + 4;
        if (i === k0 && !attacked(b, k0, them)) {
          const can = (ch) => s.castle.includes(me === 'w' ? ch.toUpperCase() : ch);
          if (can('k') && !b[k0 + 1] && !b[k0 + 2] && b[k0 + 3] === (me === 'w' ? 'R' : 'r') && !attacked(b, k0 + 1, them) && !attacked(b, k0 + 2, them)) add(k0 + 2, { castle: 'k' });
          if (can('q') && !b[k0 - 1] && !b[k0 - 2] && !b[k0 - 3] && b[k0 - 4] === (me === 'w' ? 'R' : 'r') && !attacked(b, k0 - 1, them) && !attacked(b, k0 - 2, them)) add(k0 - 2, { castle: 'q' });
        }
      }
    } else {
      const dirs = t === 'b' ? DIAG : t === 'r' ? ORTH : DIAG.concat(ORTH);
      for (const [dr, df] of dirs) {
        let rr = r + dr, ff = f + df;
        while (rr >= 0 && rr < 8 && ff >= 0 && ff < 8) {
          const j = rr * 8 + ff;
          if (b[j]) { if (colorOf(b[j]) === them) add(j); break; }
          add(j);
          rr += dr; ff += df;
        }
      }
    }
  }
  return out;
}

export function make(s, m) {
  const b = s.board.slice();
  const me = s.turn;
  b[m.to] = m.promo || m.piece;
  b[m.from] = '';
  if (m.ep) b[m.to + (me === 'w' ? 8 : -8)] = '';
  if (m.castle) {
    const row = me === 'w' ? 7 : 0;
    if (m.castle === 'k') { b[row * 8 + 5] = b[row * 8 + 7]; b[row * 8 + 7] = ''; }
    else { b[row * 8 + 3] = b[row * 8]; b[row * 8] = ''; }
  }
  let castle = s.castle;
  const drop = (chars) => { for (const c of chars) castle = castle.replace(c, ''); };
  if (m.piece === 'K') drop('KQ');
  if (m.piece === 'k') drop('kq');
  for (const [i, c] of [[63, 'K'], [56, 'Q'], [7, 'k'], [0, 'q']]) if (m.from === i || m.to === i) drop(c);
  const ep = m.piece.toLowerCase() === 'p' && Math.abs(m.to - m.from) === 16 ? (m.from + m.to) / 2 : -1;
  return {
    board: b, turn: me === 'w' ? 'b' : 'w', castle, ep,
    half: m.piece.toLowerCase() === 'p' || m.captured ? 0 : s.half + 1,
    full: s.full + (me === 'b' ? 1 : 0)
  };
}

export function legal(s) {
  return pseudo(s).filter((m) => { const n = make(s, m); return !attacked(n.board, kingSq(n.board, s.turn), n.turn); });
}

function insufficient(board) {
  const rest = board.filter((p) => p && p.toLowerCase() !== 'k');
  if (!rest.length) return true;
  if (rest.length === 1 && 'nb'.includes(rest[0].toLowerCase())) return true;
  return false;
}
// { over, result: 'w'|'b'|'draw', reason }
export function status(s, history = []) {
  const moves = legal(s);
  if (!moves.length) return inCheck(s) ? { over: true, result: s.turn === 'w' ? 'b' : 'w', reason: 'checkmate' } : { over: true, result: 'draw', reason: 'stalemate' };
  if (s.half >= 100) return { over: true, result: 'draw', reason: 'the 50-move rule' };
  if (insufficient(s.board)) return { over: true, result: 'draw', reason: 'not enough pieces to checkmate' };
  const k = key(s);
  if (history.filter((h) => h === k).length >= 3) return { over: true, result: 'draw', reason: 'threefold repetition' };
  return { over: false };
}
export { key };

// Standard algebraic notation for a move in position s.
export function san(s, m) {
  let out;
  if (m.castle) out = m.castle === 'k' ? 'O-O' : 'O-O-O';
  else {
    const t = m.piece.toUpperCase();
    const cap = m.captured ? 'x' : '';
    if (t === 'P') out = (cap ? FILES[m.from % 8] : '') + cap + sqName(m.to) + (m.promo ? '=' + m.promo.toUpperCase() : '');
    else {
      const others = legal(s).filter((o) => o.piece === m.piece && o.to === m.to && o.from !== m.from);
      let dis = '';
      if (others.length) {
        if (others.every((o) => o.from % 8 !== m.from % 8)) dis = FILES[m.from % 8];
        else if (others.every((o) => Math.floor(o.from / 8) !== Math.floor(m.from / 8))) dis = String(8 - Math.floor(m.from / 8));
        else dis = sqName(m.from);
      }
      out = t + dis + cap + sqName(m.to);
    }
  }
  const n = make(s, m);
  if (inCheck(n)) out += legal(n).length ? '+' : '#';
  return out;
}

// ---------- The computer ----------
const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
// piece-square tables from White's point of view (a8 first)
const PST = {
  p: [0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0],
  n: [-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50],
  b: [-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20],
  r: [0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0],
  q: [-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20],
  k: [-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20],
  ke: [-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30, -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50]
};
function evaluate(s) {
  let score = 0, material = 0;
  for (const p of s.board) if (p && p.toLowerCase() !== 'k' && p.toLowerCase() !== 'p') material += VAL[p.toLowerCase()];
  const endgame = material <= 1300;
  for (let i = 0; i < 64; i++) {
    const p = s.board[i];
    if (!p) continue;
    const t = p.toLowerCase(), w = isWhite(p);
    const idx = w ? i : (7 - Math.floor(i / 8)) * 8 + (i % 8);
    const table = t === 'k' && endgame ? PST.ke : PST[t];
    const v = VAL[t] + table[idx];
    score += w ? v : -v;
  }
  return s.turn === 'w' ? score : -score;
}
const order = (moves) => moves.sort((a, b) => (b.captured ? VAL[b.captured.toLowerCase()] * 10 - VAL[b.piece.toLowerCase()] : 0) + (b.promo ? 800 : 0) - ((a.captured ? VAL[a.captured.toLowerCase()] * 10 - VAL[a.piece.toLowerCase()] : 0) + (a.promo ? 800 : 0)));

let nodes = 0, deadline = 0;
function quiesce(s, alpha, beta, depth = 0) {
  nodes++;
  const stand = evaluate(s);
  if (stand >= beta) return beta;
  if (alpha < stand) alpha = stand;
  if (depth > 6) return alpha;
  for (const m of order(legal(s).filter((x) => x.captured || x.promo))) {
    const v = -quiesce(make(s, m), -beta, -alpha, depth + 1);
    if (v >= beta) return beta;
    if (v > alpha) alpha = v;
  }
  return alpha;
}
function search(s, depth, alpha, beta, ply) {
  if ((nodes & 1023) === 0 && Date.now() > deadline) throw new Error('time');
  nodes++;
  if (s.half >= 100) return 0;
  if (depth === 0) return quiesce(s, alpha, beta);
  const moves = legal(s);
  if (!moves.length) return inCheck(s) ? -100000 + ply : 0;
  order(moves);
  for (const m of moves) {
    const v = -search(make(s, m), depth - 1, -beta, -alpha, ply + 1);
    if (v >= beta) return beta;
    if (v > alpha) alpha = v;
  }
  return alpha;
}
// level: easy (shallow, with mistakes), medium, hard (deeper, more time)
export function bestMove(s, level = 'medium') {
  const moves = order(legal(s));
  if (!moves.length) return null;
  const cfg = { easy: { depth: 1, ms: 300, noise: 140 }, medium: { depth: 3, ms: 900, noise: 15 }, hard: { depth: 5, ms: 2200, noise: 0 } }[level] || { depth: 3, ms: 900, noise: 15 };
  deadline = Date.now() + cfg.ms; nodes = 0;
  let best = moves[0], scored = moves.map((m) => ({ m, v: 0 }));
  for (let d = 1; d <= cfg.depth; d++) {
    try {
      const res = [];
      let alpha = -Infinity;
      for (const { m } of scored) {
        const v = -search(make(s, m), d - 1, -Infinity, -alpha + 1, 1);
        res.push({ m, v });
        if (v > alpha) alpha = v;
      }
      scored = res.sort((a, b) => b.v - a.v);
      best = scored[0].m;
    } catch (e) { break; }
  }
  if (cfg.noise) {
    const pick = scored.map((x) => ({ ...x, v: x.v + (Math.random() - 0.5) * cfg.noise })).sort((a, b) => b.v - a.v)[0];
    best = pick.m;
  }
  return best;
}
// for testing: count positions to a given depth
export function perft(s, d) { if (!d) return 1; let n = 0; for (const m of legal(s)) n += perft(make(s, m), d - 1); return n; }
