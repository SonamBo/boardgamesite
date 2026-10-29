// Gin Rummy rules: finding melds, deadwood, and the computer's choices. No page code.
import { suit, rank } from './cards.js';

export const value = (c) => Math.min(10, rank(c));
// Every possible meld in a hand: sets of 3–4 of a rank, runs of 3+ in a suit (Ace low).
function allMelds(hand) {
  const out = [];
  const byRank = {};
  hand.forEach((c) => { (byRank[rank(c)] = byRank[rank(c)] || []).push(c); });
  Object.values(byRank).forEach((g) => {
    if (g.length >= 3) {
      out.push(g.slice());
      if (g.length === 4) for (let i = 0; i < 4; i++) out.push(g.filter((_, j) => j !== i));
    }
  });
  for (let s = 0; s < 4; s++) {
    const cs = hand.filter((c) => suit(c) === s).sort((a, b) => rank(a) - rank(b));
    for (let i = 0; i < cs.length; i++) {
      let run = [cs[i]];
      for (let j = i + 1; j < cs.length && rank(cs[j]) === rank(run[run.length - 1]) + 1; j++) {
        run = run.concat([cs[j]]);
        if (run.length >= 3) out.push(run.slice());
      }
    }
  }
  return out;
}
// The arrangement with the least deadwood: { melds, dead, score }.
export function best(hand) {
  const melds = allMelds(hand);
  let top = { melds: [], dead: hand.slice(), score: hand.reduce((a, c) => a + value(c), 0) };
  function go(i, used, chosen) {
    const dead = hand.filter((c) => !used.has(c));
    const sc = dead.reduce((a, c) => a + value(c), 0);
    if (sc < top.score) top = { melds: chosen.slice(), dead, score: sc };
    for (let k = i; k < melds.length; k++) {
      const m = melds[k];
      if (m.some((c) => used.has(c))) continue;
      m.forEach((c) => used.add(c));
      chosen.push(m);
      go(k + 1, used, chosen);
      chosen.pop();
      m.forEach((c) => used.delete(c));
    }
  }
  go(0, new Set(), []);
  return top;
}
// After drawing (11 cards), the discard that leaves the least deadwood (ties: throw the higher card).
export function bestDiscard(hand, avoid = null) {
  let pick = null;
  for (const c of hand) {
    if (c === avoid) continue;
    const r = best(hand.filter((x) => x !== c));
    if (!pick || r.score < pick.score || (r.score === pick.score && value(c) > value(pick.card))) pick = { card: c, score: r.score };
  }
  return pick;
}
// Lay off the defender's deadwood onto the knocker's melds. Returns the cards still dead.
export function layOff(melds, dead) {
  const ms = melds.map((m) => m.slice());
  let left = dead.slice(), changed = true;
  while (changed) {
    changed = false;
    for (const c of left) {
      for (const m of ms) {
        const isSet = m.every((x) => rank(x) === rank(m[0]));
        let fits = false;
        if (isSet) fits = rank(c) === rank(m[0]) && m.length < 4;
        else {
          const rs = m.map(rank).sort((a, b) => a - b);
          fits = suit(c) === suit(m[0]) && (rank(c) === rs[0] - 1 || rank(c) === rs[rs.length - 1] + 1);
        }
        if (fits) { m.push(c); left = left.filter((x) => x !== c); changed = true; break; }
      }
      if (changed) break;
    }
  }
  return left;
}
