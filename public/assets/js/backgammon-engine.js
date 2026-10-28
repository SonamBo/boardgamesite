// Backgammon rules and the computer player. No page code.
// pts[0..23]: + for your checkers (moving 23 → 0, home 0–5), − for the computer's (moving 0 → 23, home 18–23).
// bar = [yours, computer's], off = [yours, computer's]. side 0 = you, 1 = computer.

export function start() {
  const pts = new Array(24).fill(0);
  pts[23] = 2; pts[12] = 5; pts[7] = 3; pts[5] = 5;
  pts[0] = -2; pts[11] = -5; pts[16] = -3; pts[18] = -5;
  return { pts, bar: [0, 0], off: [0, 0] };
}
export const clone = (s) => ({ pts: s.pts.slice(), bar: s.bar.slice(), off: s.off.slice() });
const sign = (side) => (side === 0 ? 1 : -1);
const mine = (s, i, side) => s.pts[i] * sign(side) > 0;
const count = (s, i, side) => Math.max(0, s.pts[i] * sign(side));
const homeRange = (side) => (side === 0 ? [0, 5] : [18, 23]);
function allHome(s, side) {
  if (s.bar[side]) return false;
  const [a, b] = homeRange(side);
  for (let i = 0; i < 24; i++) if ((i < a || i > b) && mine(s, i, side)) return false;
  return true;
}
// how far a point is from bearing off for that side (1–6 in the home board)
const dist = (i, side) => (side === 0 ? i + 1 : 24 - i);

// One checker move with one die: { from, to } where from = 'bar' and to = 'off' are allowed. Returns null if illegal.
export function moveFor(s, side, from, d) {
  let to;
  if (from === 'bar') {
    if (!s.bar[side]) return null;
    to = side === 0 ? 24 - d : d - 1;
  } else {
    if (s.bar[side] || !mine(s, from, side)) return null;
    to = side === 0 ? from - d : from + d;
  }
  if (to < 0 || to > 23) {
    if (from === 'bar' || !allHome(s, side)) return null;
    const need = dist(from, side);
    if (d !== need) {
      // a bigger die can bear off only from the furthest point
      if (d < need) return null;
      for (let i = 0; i < 24; i++) if (mine(s, i, side) && dist(i, side) > need) return null;
    }
    return { from, to: 'off', d };
  }
  if (s.pts[to] * sign(side) < -1) return null; // blocked by two or more
  return { from, to, d };
}
export function apply(s, side, m) {
  const t = clone(s), sg = sign(side);
  if (m.from === 'bar') t.bar[side]--; else t.pts[m.from] -= sg;
  if (m.to === 'off') t.off[side]++;
  else {
    if (t.pts[m.to] === -sg) { t.pts[m.to] = 0; t.bar[1 - side]++; m.hit = true; }
    t.pts[m.to] += sg;
  }
  return t;
}
function singles(s, side, d) {
  const out = [];
  if (s.bar[side]) { const m = moveFor(s, side, 'bar', d); if (m) out.push(m); return out; }
  for (let i = 0; i < 24; i++) if (mine(s, i, side)) { const m = moveFor(s, side, i, d); if (m) out.push(m); }
  return out;
}

// Every legal way to play the dice: lists of moves, using as many dice as possible (and the bigger die if only one fits).
export function plays(s, side, dice, dedupe = true) {
  const ds = dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : [dice[0], dice[1]];
  const results = [];
  const seen = new Set();
  function go(st, left, seq) {
    let moved = false;
    const tried = new Set();
    for (let k = 0; k < left.length; k++) {
      const d = left[k];
      if (tried.has(d)) continue;
      tried.add(d);
      for (const m of singles(st, side, d)) {
        moved = true;
        const nx = apply(st, side, { ...m });
        go(nx, left.slice(0, k).concat(left.slice(k + 1)), seq.concat([{ ...m }]));
      }
    }
    if (!moved) {
      const key = st.pts.join(',') + '|' + st.bar + '|' + st.off;
      if (!dedupe || !seen.has(key)) { seen.add(key); results.push({ seq, end: st }); }
    }
  }
  go(s, ds, []);
  const most = Math.max(0, ...results.map((r) => r.seq.length));
  let best = results.filter((r) => r.seq.length === most);
  if (most === 1 && dice[0] !== dice[1]) {
    const big = Math.max(...dice);
    if (best.some((r) => r.seq[0].d === big)) best = best.filter((r) => r.seq[0].d === big);
  }
  return best;
}

export function pips(s, side) {
  let p = s.bar[side] * 25;
  for (let i = 0; i < 24; i++) if (mine(s, i, side)) p += count(s, i, side) * dist(i, side);
  return p;
}
export const winner = (s) => (s.off[0] === 15 ? 0 : s.off[1] === 15 ? 1 : -1);

// Position score for `side` (higher is better).
function evaluate(s, side) {
  const opp = 1 - side, sg = sign(side);
  let v = (pips(s, opp) - pips(s, side)) * 1.0;
  v += s.off[side] * 6 - s.off[opp] * 6;
  v += s.bar[opp] * 14 - s.bar[side] * 14;
  // can the opponent still hit? (any of their checkers behind ours)
  const oppBack = s.bar[opp] ? (opp === 0 ? 24 : -1) : (() => { let far = -1; for (let i = 0; i < 24; i++) if (mine(s, i, opp)) far = opp === 0 ? Math.max(far, i) : (far < 0 ? i : Math.min(far, i)); return far; })();
  for (let i = 0; i < 24; i++) {
    const c = s.pts[i] * sg;
    if (c >= 2) {
      v += 3;
      const inHome = side === 0 ? i <= 5 : i >= 18;
      if (inHome) v += 4;
      if ((side === 0 && (i === 4 || i === 5 || i === 6)) || (side === 1 && (i === 19 || i === 18 || i === 17))) v += 3;
    } else if (c === 1) {
      // a lone checker the opponent can reach is a liability
      const exposed = oppBack >= 0 && (side === 0 ? oppBack > i : oppBack < i);
      if (exposed) v -= 6 + (side === 0 ? (23 - i) : i) * 0.25;
    }
  }
  return v;
}
export function choose(s, side, dice, level = 'hard') {
  const ps = plays(s, side, dice);
  if (!ps.length || !ps[0].seq.length) return [];
  const scored = ps.map((p) => ({ p, v: evaluate(p.end, side) + (level === 'easy' ? Math.random() * 40 : level === 'medium' ? Math.random() * 8 : 0) }));
  scored.sort((a, b) => b.v - a.v);
  return scored[0].p.seq;
}
