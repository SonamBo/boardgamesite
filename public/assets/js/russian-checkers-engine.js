// Russian Checkers (shashki) rules and computer player. No DOM here.
// Same board as checkers-engine.js: 64 cells, index r*8+c, only dark squares ((r+c) odd) are used.
// Pieces: 1 = your man, 2 = your king, -1 = computer man, -2 = computer king.
// You start at the bottom (rows 5–7) and move up, and move first (White's role); the computer starts at the top.
//
// How it differs from American checkers:
//   - men capture backwards as well as forwards (they still only step forwards)
//   - kings fly: they move and capture any distance along a diagonal, landing on any empty square beyond
//   - a man that reaches the far row in the middle of a capture is crowned at once and keeps capturing as a king
//   - captures are compulsory, but you may choose any capture (not necessarily the longest); once started,
//     a capture must be taken as far as it goes, and a king must land where it can keep capturing if it can
//   - "Turkish strike": captured pieces are only removed when the move ends, so they can't be jumped twice
//     and they block the way until then
export const YOU = 1;
export const CPU = -1;

export const isDark = (i) => ((i >> 3) + (i & 7)) % 2 === 1;

export function startBoard() {
  const b = new Array(64).fill(0);
  for (let i = 0; i < 64; i++) {
    if (!isDark(i)) continue;
    const r = i >> 3;
    if (r <= 2) b[i] = CPU;
    if (r >= 5) b[i] = YOU;
  }
  return b;
}

const sideOf = (p) => (p > 0 ? YOU : p < 0 ? CPU : 0);
const isKing = (p) => p === 2 || p === -2;
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const crownRow = (side) => (side === YOU ? 0 : 7);

// Every capture sequence for one piece, following the rules above.
function capturesFrom(b, from, piece) {
  const side = sideOf(piece);
  const empty = (i) => b[i] === 0 || i === from;   // the moving piece has left its square
  function seqs(pos, king, path, caps) {
    // landing squares for each piece that can be captured from here: Map(captured square → [landings])
    const groups = new Map();
    const r = pos >> 3, c = pos & 7;
    for (const [dr, dc] of DIAG) {
      if (king) {
        let k = 1;
        while (inside(r + k * dr, c + k * dc) && empty((r + k * dr) * 8 + c + k * dc)) k++;
        if (!inside(r + k * dr, c + k * dc)) continue;
        const mid = (r + k * dr) * 8 + c + k * dc;
        if (sideOf(b[mid]) !== -side || caps.includes(mid)) continue;
        const lands = [];
        for (let j = k + 1; inside(r + j * dr, c + j * dc) && empty((r + j * dr) * 8 + c + j * dc); j++) lands.push((r + j * dr) * 8 + c + j * dc);
        if (lands.length) groups.set(mid, lands);
      } else {
        const mr = r + dr, mc = c + dc, lr = r + 2 * dr, lc = c + 2 * dc;
        if (!inside(lr, lc)) continue;
        const mid = mr * 8 + mc, land = lr * 8 + lc;
        if (sideOf(b[mid]) !== -side || caps.includes(mid) || !empty(land)) continue;
        groups.set(mid, [land]);
      }
    }
    if (!groups.size) return caps.length ? [{ path, caps }] : [];
    const out = [];
    for (const [mid, lands] of groups) {
      const subs = lands.map((land) => seqs(land, king || (land >> 3) === crownRow(side), path.concat(land), caps.concat(mid)));
      // a landing square that lets the capture go on must be chosen over one that doesn't
      const goesOn = subs.map((list) => list.some((m) => m.caps.length > caps.length + 1));
      const must = goesOn.some(Boolean);
      subs.forEach((list, k) => { if (!must || goesOn[k]) out.push(...list); });
    }
    return out;
  }
  return seqs(from, isKing(piece), [from], []);
}

// All legal moves for a side: { path: [from, ...landings], caps: [captured squares] }. Captures are compulsory.
export function legalMoves(b, side) {
  const jumps = [];
  const steps = [];
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (sideOf(p) !== side) continue;
    jumps.push(...capturesFrom(b, i, p));
    if (jumps.length) continue;
    const r = i >> 3, c = i & 7;
    if (isKing(p)) {
      for (const [dr, dc] of DIAG) {
        for (let k = 1; inside(r + k * dr, c + k * dc) && b[(r + k * dr) * 8 + c + k * dc] === 0; k++) steps.push({ path: [i, (r + k * dr) * 8 + c + k * dc], caps: [] });
      }
    } else {
      const dr = side === YOU ? -1 : 1;
      for (const dc of [-1, 1]) {
        const nr = r + dr, nc = c + dc;
        if (inside(nr, nc) && b[nr * 8 + nc] === 0) steps.push({ path: [i, nr * 8 + nc], caps: [] });
      }
    }
  }
  return jumps.length ? jumps : steps;
}

// True if this move crowns a man (it touches the far row anywhere along its path).
export function crowns(b, m) {
  const p = b[m.path[0]];
  return !isKing(p) && m.path.slice(1).some((i) => (i >> 3) === crownRow(sideOf(p)));
}

export function applyMove(b, m) {
  const nb = b.slice();
  const from = m.path[0], to = m.path[m.path.length - 1];
  let p = nb[from];
  if (crowns(b, m)) p *= 2;
  nb[from] = 0;
  for (const x of m.caps) nb[x] = 0;
  nb[to] = p;
  return nb;
}

export function countPieces(b) {
  let you = 0, cpu = 0;
  for (const p of b) { if (p > 0) you++; else if (p < 0) cpu++; }
  return { you, cpu };
}

// The long diagonal a1–h8 ("the main road"): a king there is very hard to catch.
const MAIN_ROAD = new Set([56, 49, 42, 35, 28, 21, 14, 7]);

// Score from the computer's point of view.
function evaluate(b) {
  let s = 0;
  for (let i = 0; i < 64; i++) {
    const p = b[i];
    if (!p) continue;
    const r = i >> 3, c = i & 7;
    const centre = (c >= 2 && c <= 5 && r >= 2 && r <= 5) ? 6 : 0;
    let v;
    if (isKing(p)) v = 300 + (MAIN_ROAD.has(i) ? 25 : 0);
    else {
      const adv = p > 0 ? 7 - r : r;          // rows advanced
      const backGuard = (p > 0 && r === 7) || (p < 0 && r === 0) ? 8 : 0;
      v = 100 + adv * 5 + (adv >= 5 ? 15 : 0) + centre + backGuard;
    }
    s += p < 0 ? v : -v;
  }
  // Endgame: the side that is ahead is happy to trade pieces, since every even swap makes its lead bigger.
  if (Math.abs(s) >= 60) {
    let total = 0;
    for (const p of b) if (p) total++;
    s += (s > 0 ? 1 : -1) * (24 - total) * 6;
  }
  return s;
}

function negamax(b, side, depth, alpha, beta) {
  const moves = legalMoves(b, side);
  if (!moves.length) return -100000 - depth;   // side to move has lost
  if (depth === 0) return side === CPU ? evaluate(b) : -evaluate(b);
  // captures first (longest first) helps pruning
  moves.sort((a, z) => z.caps.length - a.caps.length);
  let best = -Infinity;
  for (const m of moves) {
    // a capture at the horizon gets one extra ply so the AI doesn't walk into obvious trades
    const d = depth === 1 && m.caps.length ? 1 : depth - 1;
    const v = -negamax(applyMove(b, m), -side, d, -beta, -alpha);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

export const LEVELS = { easy: { depth: 2, noise: 60 }, medium: { depth: 4, noise: 12 }, hard: { depth: 7, noise: 0 } };

// `side`: the side the computer plays (black at the top unless the person chose to play black).
export function pickComputerMove(b, level = 'medium', rnd = Math.random, side = CPU) {
  const { depth, noise } = LEVELS[level] || LEVELS.medium;
  const moves = legalMoves(b, side);
  if (moves.length <= 1) return moves[0] || null;
  let best = null, bestScore = -Infinity;
  for (const m of moves) {
    const v = -negamax(applyMove(b, m), -side, depth - 1, -Infinity, Infinity) + (noise ? (rnd() - 0.5) * noise * 2 : 0);
    if (v > bestScore) { bestScore = v; best = m; }
  }
  return best;
}

// Post-game review: score every legal move for `side` (from that side's point of view), searching deeper
// until the time budget runs out. Returns [{ move, score }] best first, and the depth reached.
export function analysePosition(b, side, timeMs = 600) {
  const moves = legalMoves(b, side);
  if (!moves.length) return { scores: [], depth: 0 };
  const t0 = Date.now();
  let scores = moves.map((m) => ({ move: m, score: 0 })), depth = 0;
  for (let d = 2; d <= 12; d++) {
    const next = [];
    for (const m of moves) next.push({ move: m, score: -negamax(applyMove(b, m), -side, d - 1, -Infinity, Infinity) });
    scores = next.sort((a, z) => z.score - a.score);
    depth = d;
    if (Date.now() - t0 > timeMs / 3) break;   // the next depth would take several times longer
  }
  return { scores, depth };
}
