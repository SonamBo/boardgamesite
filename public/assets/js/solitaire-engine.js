// Klondike Solitaire rules. No DOM here.
// A card is a number 0–51: suit = Math.floor(n / 13) (0 ♠, 1 ♥, 2 ♦, 3 ♣), rank = n % 13 + 1 (1 = Ace … 13 = King).
export const SUITS = ['spades', 'hearts', 'diamonds', 'clubs'];
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const suit = (n) => Math.floor(n / 13);
export const rank = (n) => (n % 13) + 1;
export const isRed = (n) => suit(n) === 1 || suit(n) === 2;
export const cardName = (n) =>
  ['Ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King'][rank(n) - 1] + ' of ' + SUITS[suit(n)];

// State: { stock: [n], waste: [n], found: [[n]×4 by suit], tab: [[{c, up}]×7], draw: 1|3 }
export function deal(rnd = Math.random, draw = 1) {
  const deck = Array.from({ length: 52 }, (_, i) => i);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  const tab = [];
  for (let col = 0; col < 7; col++) {
    tab.push([]);
    for (let k = 0; k <= col; k++) tab[col].push({ c: deck.pop(), up: k === col });
  }
  return { stock: deck, waste: [], found: [[], [], [], []], tab, draw };
}

export const clone = (s) => JSON.parse(JSON.stringify(s));
const top = (arr) => arr[arr.length - 1];

export function canDraw(s) { return s.stock.length > 0 || s.waste.length > 0; }

export function drawCards(s) {
  const n = clone(s);
  if (n.stock.length) {
    for (let k = 0; k < n.draw && n.stock.length; k++) n.waste.push(n.stock.pop());
  } else {
    n.stock = n.waste.reverse();
    n.waste = [];
  }
  return n;
}

export function canGoToFoundation(s, card) {
  const f = s.found[suit(card)];
  return f.length === rank(card) - 1;
}

export function canGoToTableau(s, card, col) {
  const pile = s.tab[col];
  if (!pile.length) return rank(card) === 13;
  const t = top(pile);
  return t.up && isRed(t.c) !== isRed(card) && rank(t.c) === rank(card) + 1;
}

// Where a pick-up starts: { from: 'waste' } | { from: 'found', suit } | { from: 'tab', col, idx }
// Returns the cards it would carry, or null if that pick-up isn't allowed.
export function cardsAt(s, src) {
  if (src.from === 'waste') return s.waste.length ? [top(s.waste)] : null;
  if (src.from === 'found') { const f = s.found[src.suit]; return f.length ? [top(f)] : null; }
  if (src.from === 'tab') {
    const pile = s.tab[src.col];
    if (src.idx < 0 || src.idx >= pile.length || !pile[src.idx].up) return null;
    return pile.slice(src.idx).map((x) => x.c);
  }
  return null;
}

// dest: { to: 'found' } | { to: 'tab', col }
export function canMove(s, src, dest) {
  const cards = cardsAt(s, src);
  if (!cards) return false;
  if (dest.to === 'found') return cards.length === 1 && src.from !== 'found' && canGoToFoundation(s, cards[0]);
  if (dest.to === 'tab') {
    if (src.from === 'tab' && src.col === dest.col) return false;
    return canGoToTableau(s, cards[0], dest.col);
  }
  return false;
}

export function move(s, src, dest) {
  const n = clone(s);
  let cards;
  if (src.from === 'waste') cards = [n.waste.pop()];
  else if (src.from === 'found') cards = [n.found[src.suit].pop()];
  else {
    cards = n.tab[src.col].splice(src.idx).map((x) => x.c);
    const pile = n.tab[src.col];
    if (pile.length && !top(pile).up) top(pile).up = true;   // turn over the newly exposed card
  }
  if (dest.to === 'found') n.found[suit(cards[0])].push(cards[0]);
  else n.tab[dest.col].push(...cards.map((c) => ({ c, up: true })));
  return n;
}

// Best destination for a tap: foundation first, then a column with cards, then an empty column.
export function autoDest(s, src) {
  const cards = cardsAt(s, src);
  if (!cards) return null;
  if (cards.length === 1 && src.from !== 'found' && canGoToFoundation(s, cards[0])) return { to: 'found' };
  let empty = null;
  for (let col = 0; col < 7; col++) {
    if (!canMove(s, src, { to: 'tab', col })) continue;
    if (s.tab[col].length) return { to: 'tab', col };
    // moving a King that already heads its column to another empty column is pointless
    if (empty === null && !(src.from === 'tab' && src.idx === 0)) empty = { to: 'tab', col };
  }
  return empty;
}

export const isWon = (s) => s.found.every((f) => f.length === 13);

// Everything is face up and the stock is empty: the rest can be played to the foundations.
export function canAutoFinish(s) {
  return !s.stock.length && !s.waste.length && s.tab.every((p) => p.every((x) => x.up)) && !isWon(s);
}

// One step of auto-finish: the lowest card that can go up.
export function nextFinishMove(s) {
  let best = null;
  for (let col = 0; col < 7; col++) {
    const pile = s.tab[col];
    if (!pile.length) continue;
    const c = top(pile).c;
    if (canGoToFoundation(s, c) && (!best || rank(c) < best.r)) best = { r: rank(c), src: { from: 'tab', col, idx: pile.length - 1 } };
  }
  if (!best && s.waste.length && canGoToFoundation(s, top(s.waste))) best = { src: { from: 'waste' } };
  return best ? { src: best.src, dest: { to: 'found' } } : null;
}
