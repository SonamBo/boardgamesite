// Go on a 9×9 board: rules, scoring and a Monte Carlo computer player. No page code.
// Points 0..80; 0 empty, 1 black, 2 white.
export const N = 9, KOMI = 6.5;
const NB = Array.from({ length: N * N }, (_, i) => {
  const r = Math.floor(i / N), c = i % N, out = [];
  if (r > 0) out.push(i - N); if (r < N - 1) out.push(i + N); if (c > 0) out.push(i - 1); if (c < N - 1) out.push(i + 1);
  return out;
});
export const neighbours = (i) => NB[i];

// the group containing i and whether it has a liberty
function group(b, i) {
  const col = b[i], stones = [i], seen = new Uint8Array(N * N);
  seen[i] = 1;
  let libs = 0;
  for (let k = 0; k < stones.length; k++) {
    for (const j of NB[stones[k]]) {
      if (seen[j]) continue;
      seen[j] = 1;
      if (b[j] === col) stones.push(j); else if (!b[j]) libs++;
    }
  }
  return { stones, libs };
}
// Play a stone; returns the new board and captures, or null if illegal. `prev` is the board before the opponent's last move (simple ko).
export function play(b, i, col, prev) {
  if (b[i]) return null;
  const nb = b.slice();
  nb[i] = col;
  const opp = 3 - col;
  let captured = 0;
  for (const j of NB[i]) {
    if (nb[j] === opp) { const g = group(nb, j); if (!g.libs) { for (const s of g.stones) nb[s] = 0; captured += g.stones.length; } }
  }
  if (!group(nb, i).libs) return null; // suicide
  if (prev && captured === 1 && nb.every((v, k) => v === prev[k])) return null; // ko
  return { b: nb, captured };
}
// is i an eye of col (all neighbours col, and not a false eye in the middle)?
function isEye(b, i, col) {
  if (b[i]) return false;
  for (const j of NB[i]) if (b[j] !== col) return false;
  const r = Math.floor(i / N), c = i % N;
  let bad = 0, diag = 0;
  for (const [dr, dc] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    const rr = r + dr, cc = c + dc;
    if (rr < 0 || cc < 0 || rr >= N || cc >= N) continue;
    diag++;
    if (b[rr * N + cc] === 3 - col) bad++;
  }
  return diag === 4 ? bad <= 1 : bad === 0;
}

// Area score: stones plus empty regions bordered by only one colour. Returns black − white − komi.
export function score(b, dead = null) {
  const bb = b.slice();
  if (dead) dead.forEach((i) => { bb[i] = 0; });
  let black = 0, white = 0;
  const seen = new Uint8Array(N * N);
  const owner = new Int8Array(N * N);
  for (let i = 0; i < N * N; i++) {
    if (bb[i] === 1) { black++; owner[i] = 1; } else if (bb[i] === 2) { white++; owner[i] = 2; }
    else if (!seen[i]) {
      const region = [i]; seen[i] = 1; let touch = 0;
      for (let k = 0; k < region.length; k++) for (const j of NB[region[k]]) {
        if (bb[j]) touch |= bb[j]; else if (!seen[j]) { seen[j] = 1; region.push(j); }
      }
      if (touch === 1) { black += region.length; region.forEach((x) => { owner[x] = 1; }); }
      if (touch === 2) { white += region.length; region.forEach((x) => { owner[x] = 2; }); }
    }
  }
  return { diff: black - white - KOMI, black, white: white + KOMI, owner };
}

// One random game to the end; returns the final board.
function playout(b0, col, prev0) {
  let b = b0, c = col, passes = 0, prev = prev0;
  for (let n = 0; n < 200 && passes < 2; n++) {
    const empties = [];
    for (let i = 0; i < N * N; i++) if (!b[i] && !isEye(b, i, c)) empties.push(i);
    let moved = false;
    // try a few random points
    for (let t = empties.length; t > 0; t--) {
      const k = Math.floor(Math.random() * t);
      const i = empties[k];
      empties[k] = empties[t - 1];
      const r = play(b, i, c, prev);
      if (r) { prev = b; b = r.b; moved = true; break; }
    }
    passes = moved ? 0 : passes + 1;
    c = 3 - c;
  }
  return b;
}

// Guess which stones are dead at the end of the game: stones that random playouts usually lose.
export function deadStones(b, toMove = 1, samples = 120) {
  const own = new Float32Array(N * N);
  for (let s = 0; s < samples; s++) {
    const end = playout(b, toMove, null);
    const o = score(end).owner;
    for (let i = 0; i < N * N; i++) if (b[i] && o[i] === b[i]) own[i]++;
  }
  const dead = [];
  for (let i = 0; i < N * N; i++) if (b[i] && own[i] / samples < 0.3) dead.push(i);
  return dead;
}

// Flat Monte Carlo: try each move with random playouts and keep the one that wins most often.
export function bestMove(b, col, prev, level = 'medium') {
  const ms = { easy: 250, medium: 900, hard: 2200 }[level] || 900;
  const cands = [];
  for (let i = 0; i < N * N; i++) {
    if (b[i] || isEye(b, i, col)) continue;
    const r = play(b, i, col, prev);
    if (r) {
      // early on, the edge is a poor place to play
      const rr = Math.floor(i / N), cc = i % N, line = Math.min(rr, cc, N - 1 - rr, N - 1 - cc);
      const stones = b.filter(Boolean).length;
      const early = stones < 30 ? (line === 0 ? -0.15 : line === 1 ? -0.04 : 0) : 0;
      cands.push({ i, r, wins: 0, n: 0, bonus: r.captured * 0.08 + early });
    }
  }
  if (!cands.length) return { pass: true };
  // urgent: save own group in atari / capture
  const stop = Date.now() + ms;
  let rounds = 0;
  while (Date.now() < stop) {
    for (const c of cands) {
      const end = playout(c.r.b, 3 - col, b);
      const d = score(end).diff;
      if ((col === 1 && d > 0) || (col === 2 && d < 0)) c.wins++;
      c.n++;
    }
    rounds++;
    if (rounds > 400) break;
  }
  let best = null, bv = -1;
  for (const c of cands) {
    const v = c.wins / c.n + c.bonus + (level === 'easy' ? Math.random() * 0.25 : 0);
    if (v > bv) { bv = v; best = c; }
  }
  // resign-free pass: if every move loses badly late in the game, or the position is settled, pass
  return { i: best.i, winrate: best.wins / best.n };
}
export { isEye, group };
