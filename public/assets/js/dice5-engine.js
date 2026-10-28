// Five Dice: scoring and the computer player. No page code.
// dice: array of 5 numbers 1–6.

export const CATS = [
  { id: 'ones', name: 'Ones', upper: 1, help: 'Add up the 1s' },
  { id: 'twos', name: 'Twos', upper: 2, help: 'Add up the 2s' },
  { id: 'threes', name: 'Threes', upper: 3, help: 'Add up the 3s' },
  { id: 'fours', name: 'Fours', upper: 4, help: 'Add up the 4s' },
  { id: 'fives', name: 'Fives', upper: 5, help: 'Add up the 5s' },
  { id: 'sixes', name: 'Sixes', upper: 6, help: 'Add up the 6s' },
  { id: 'three', name: 'Three of a kind', help: 'Three the same: total of all dice' },
  { id: 'four', name: 'Four of a kind', help: 'Four the same: total of all dice' },
  { id: 'full', name: 'Full house', help: 'Three of one and two of another: 25' },
  { id: 'small', name: 'Small straight', help: 'Four in a row: 30' },
  { id: 'large', name: 'Large straight', help: 'Five in a row: 40' },
  { id: 'five', name: 'Five of a kind', help: 'All five the same: 50' },
  { id: 'chance', name: 'Chance', help: 'Any dice: total of all dice' }
];
export const UPPER_BONUS = 35;
export const UPPER_TARGET = 63;

const counts = (d) => { const c = [0, 0, 0, 0, 0, 0, 0]; d.forEach((v) => c[v]++); return c; };
const sum = (d) => d.reduce((a, b) => a + b, 0);
function run(c) { let best = 0, cur = 0; for (let v = 1; v <= 6; v++) { cur = c[v] ? cur + 1 : 0; best = Math.max(best, cur); } return best; }

export function scoreFor(id, d) {
  const c = counts(d);
  const max = Math.max(...c);
  switch (id) {
    case 'ones': return c[1] * 1;
    case 'twos': return c[2] * 2;
    case 'threes': return c[3] * 3;
    case 'fours': return c[4] * 4;
    case 'fives': return c[5] * 5;
    case 'sixes': return c[6] * 6;
    case 'three': return max >= 3 ? sum(d) : 0;
    case 'four': return max >= 4 ? sum(d) : 0;
    case 'full': return c.includes(3) && c.includes(2) ? 25 : 0;
    case 'small': return run(c) >= 4 ? 30 : 0;
    case 'large': return run(c) >= 5 ? 40 : 0;
    case 'five': return max === 5 ? 50 : 0;
    case 'chance': return sum(d);
  }
  return 0;
}

export function upperTotal(card) { return CATS.filter((k) => k.upper).reduce((a, k) => a + (card[k.id] ?? 0), 0); }
export function bonus(card) { return upperTotal(card) >= UPPER_TARGET ? UPPER_BONUS : 0; }
export function total(card) { return CATS.reduce((a, k) => a + (card[k.id] ?? 0), 0) + bonus(card); }
export const full = (card) => CATS.every((k) => card[k.id] != null);

// ---------- The computer ----------
// Roughly what each box is worth on average, so the computer doesn't waste a good box on a poor roll.
const PAR = { ones: 2, twos: 5, threes: 8, fours: 11, fives: 14, sixes: 17, three: 16, four: 8, full: 14, small: 20, large: 16, five: 10, chance: 21 };

function valueOf(id, d, card) {
  const s = scoreFor(id, d);
  let v = s - PAR[id];
  const k = CATS.find((x) => x.id === id);
  if (k.upper) {
    // Three or more of a number keeps the upper bonus on track.
    const need = UPPER_TARGET - upperTotal(card);
    if (need > 0) {
      if (s >= k.upper * 3) v += 6;
      if (upperTotal(card) + s >= UPPER_TARGET) v += 25;
    }
  }
  if (id === 'chance' && s < 20) v -= 6; // keep Chance for a rescue
  return v;
}

export function bestBox(d, card) {
  let best = null, bestV = -Infinity;
  for (const k of CATS) {
    if (card[k.id] != null) continue;
    const v = valueOf(k.id, d, card);
    if (v > bestV) { bestV = v; best = k.id; }
  }
  return { id: best, value: bestV };
}

// Which dice to keep, trying every combination and sampling the re-rolls.
export function chooseHolds(d, card, rollsLeft, rand = Math.random, samples = 160) {
  let bestMask = 31, bestV = -Infinity;
  for (let mask = 0; mask < 32; mask++) {
    let total = 0;
    for (let s = 0; s < samples; s++) {
      let dd = d.map((v, i) => (mask & (1 << i) ? v : 1 + Math.floor(rand() * 6)));
      if (rollsLeft > 1) {
        // one more roll to come: keep the dice that match the most common value or the best run
        const again = quickHold(dd);
        dd = dd.map((v, i) => (again & (1 << i) ? v : 1 + Math.floor(rand() * 6)));
      }
      total += bestBox(dd, card).value;
    }
    const v = total / samples;
    if (v > bestV) { bestV = v; bestMask = mask; }
  }
  // Keeping everything is "stop rolling": compare with the score in hand.
  if (bestBox(d, card).value >= bestV) bestMask = 31;
  return bestMask;
}

// A fast rule-of-thumb hold used inside the simulation.
function quickHold(d) {
  const c = counts(d);
  let most = 1;
  for (let v = 2; v <= 6; v++) if (c[v] >= c[most]) most = v;
  if (c[most] >= 2) return d.reduce((m, v, i) => (v === most ? m | (1 << i) : m), 0);
  const seen = new Set();
  return d.reduce((m, v, i) => (v >= 2 && v <= 5 && !seen.has(v) ? (seen.add(v), m | (1 << i)) : m), 0);
}
