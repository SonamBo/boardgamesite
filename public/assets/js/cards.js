// Shared playing cards for the card games: the card faces, a table that places cards, and deck helpers.
// A card is a number 0–51: suit * 13 + (rank − 1). Suits: 0 spades, 1 hearts, 2 diamonds, 3 clubs.
export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
export const SUIT_NAMES = ['spades', 'hearts', 'diamonds', 'clubs'];
export const suit = (c) => Math.floor(c / 13);
export const rank = (c) => (c % 13) + 1;
export const isRed = (c) => suit(c) === 1 || suit(c) === 2;
export const name = (c) => { const r = rank(c); return (r === 1 ? 'Ace' : r === 11 ? 'Jack' : r === 12 ? 'Queen' : r === 13 ? 'King' : String(r)) + ' of ' + SUIT_NAMES[suit(c)]; };
export const short = (c) => RANKS[rank(c) - 1] + ['♠', '♥', '♦', '♣'][suit(c)];

export function shuffle(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
export const deck = (rand) => shuffle(Array.from({ length: 52 }, (_, i) => i), rand);

// The four suit shapes, added to the page once.
const SYMBOLS = [
  'M12 2C9 6 3 9.5 3 14a4.5 4.5 0 0 0 7.6 3.2c-.3 1.9-1 3.3-2.6 4.8h8c-1.6-1.5-2.3-2.9-2.6-4.8A4.5 4.5 0 0 0 21 14c0-4.5-6-8-9-12z',
  'M12 21.5s-7.6-4.8-9.7-9.4C.7 8.5 2.7 4 6.7 4c2.3 0 3.8 1.3 5.3 3.2C13.5 5.3 15 4 17.3 4c4 0 6 4.5 4.4 8.1-2.1 4.6-9.7 9.4-9.7 9.4z',
  'M12 1.5l8.5 10.5L12 22.5 3.5 12z',
  'M12 2.5a4.3 4.3 0 0 0-3.7 6.5A4.3 4.3 0 1 0 10.6 16c-.3 2.3-1.1 4-2.8 5.5h8.4c-1.7-1.5-2.5-3.2-2.8-5.5a4.3 4.3 0 1 0 2.3-7A4.3 4.3 0 0 0 12 2.5z'
];
export function suitSprite() {
  if (document.getElementById('suit-0')) return;
  const d = document.createElement('div');
  d.innerHTML = '<svg width="0" height="0" style="position:absolute" aria-hidden="true">' + SYMBOLS.map((p, i) => '<symbol id="suit-' + i + '" viewBox="0 0 24 24"><path d="' + p + '"/></symbol>').join('') + '</svg>';
  document.body.prepend(d.firstChild);
}
export const suitIcon = (s, cls = '') => '<svg class="' + cls + '" viewBox="0 0 24 24" aria-hidden="true"><use href="#suit-' + s + '"/></svg>';

// A card table: one element per card, placed by x/y in pixels inside `area`.
export class Table {
  constructor(area, { count = 52, ids = null } = {}) {
    suitSprite();
    this.area = area;
    this.els = new Map();
    const list = ids || Array.from({ length: count }, (_, i) => i);
    for (const id of list) {
      const c = id % 52;
      const el = document.createElement('div');
      const r = RANKS[rank(c) - 1], s = suit(c);
      const ix = '<span class="ix%"><span>' + r + '</span><svg><use href="#suit-' + s + '"/></svg></span>';
      el.className = 'pc' + (isRed(c) ? ' red' : '');
      el.dataset.id = String(id);
      el.innerHTML = ix.replace('%', '') + '<svg class="pip"><use href="#suit-' + s + '"/></svg>' + ix.replace('%', ' br');
      el.style.display = 'none';
      area.appendChild(el);
      this.els.set(id, el);
    }
  }
  // place(id, x, y, { up, z, cls, label, tab })
  place(id, x, y, o = {}) {
    const el = this.els.get(id);
    if (!el) return;
    el.style.display = '';
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.zIndex = String(o.z || 1);
    el.classList.toggle('back', !o.up);
    el.classList.toggle('face', !!o.up);
    el.classList.toggle('sel', !!o.sel);
    el.classList.toggle('lit', !!o.lit);
    el.classList.toggle('dim', !!o.dim);
    el.setAttribute('aria-label', o.up ? name(id % 52) + (o.label || '') : 'Face-down card');
    if (o.tab) { el.tabIndex = 0; el.setAttribute('role', 'button'); } else { el.removeAttribute('tabindex'); el.removeAttribute('role'); }
  }
  hide(id) { const el = this.els.get(id); if (el) el.style.display = 'none'; }
  hideAll() { this.els.forEach((el) => { el.style.display = 'none'; }); }
  size(cw) {
    this.area.style.setProperty('--cw', cw + 'px');
    this.els.forEach((el) => { el.style.width = cw + 'px'; el.style.height = Math.round(cw * 1.4) + 'px'; });
  }
  idFrom(e) { const el = e.target.closest && e.target.closest('.pc'); return el ? Number(el.dataset.id) : null; }
}
// A dashed empty space on the table.
export function slotEl(area, cls = '', html = '') {
  const el = document.createElement('div');
  el.className = 'slot ' + cls;
  el.innerHTML = html;
  area.appendChild(el);
  return el;
}
export function placeSlot(el, x, y, w, h) { el.style.left = x + 'px'; el.style.top = y + 'px'; el.style.width = w + 'px'; el.style.height = h + 'px'; }
