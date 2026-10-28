// Shared helpers for the word games: the everyday word list, fast lookups and letter tools.
import { WORDS } from './words.js';

let list = null, set = null;
// Everyday words, most common first.
export function words() { if (!list) list = WORDS.split(' '); return list; }
export function isWord(w) { if (!set) set = new Set(words()); return set.has(w.toLowerCase()); }
// How common a word is: 0 is the most common.
let rankMap = null;
export function rank(w) { if (!rankMap) { rankMap = new Map(); words().forEach((x, i) => rankMap.set(x, i)); } return rankMap.get(w) ?? Infinity; }

// Letters drawn in roughly the proportions they appear in English.
export const LETTER_WEIGHTS = { e: 12, t: 9, a: 9, o: 8, i: 8, n: 7, s: 7, r: 7, h: 4, l: 5, d: 4, c: 4, u: 4, m: 3, f: 2, p: 3, g: 3, w: 2, y: 2, b: 2, v: 1, k: 1, x: 0.5, j: 0.4, q: 0.3, z: 0.4 };
export function randomLetter(rand = Math.random) {
  const total = Object.values(LETTER_WEIGHTS).reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (const [ch, w] of Object.entries(LETTER_WEIGHTS)) { r -= w; if (r <= 0) return ch; }
  return 'e';
}
export function shuffled(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
// A prefix tree for searching letter grids and racks.
export function trie(wordList = words()) {
  const root = {};
  for (const w of wordList) {
    let n = root;
    for (const ch of w) n = n[ch] || (n[ch] = {});
    n.$ = w;
  }
  return root;
}
