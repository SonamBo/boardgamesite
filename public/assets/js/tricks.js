// Shared table for four-player card games (Hearts, Spades): your hand at the bottom, the computer players
// around the table, and the trick in the middle. Seats: 0 you (south), 1 west, 2 north, 3 east. Play goes 0 → 1 → 2 → 3.
import { Table, suit, rank } from './cards.js';

export const SEAT_NAMES = ['You', 'West', 'North', 'East'];
// sort a hand: by suit (spades, hearts, clubs, diamonds alternate colours), high to low
const SUIT_ORDER = [0, 1, 3, 2];
export const sortHand = (h) => h.slice().sort((a, b) => SUIT_ORDER.indexOf(suit(a)) - SUIT_ORDER.indexOf(suit(b)) || rankHi(b) - rankHi(a));
export const rankHi = (c) => (rank(c) === 1 ? 14 : rank(c)); // Ace high

// Who wins a trick: highest card of the suit led, unless a trump was played.
export function trickWinner(trick, trump = -1) {
  const led = suit(trick[0].card);
  let best = trick[0];
  for (const p of trick.slice(1)) {
    const bs = suit(best.card), ps = suit(p.card);
    if (ps === bs && rankHi(p.card) > rankHi(best.card)) best = p;
    else if (ps === trump && bs !== trump) best = p;
  }
  void led;
  return best.seat;
}

export class TrickTable {
  constructor(area) {
    this.area = area;
    this.T = new Table(area);
    this.L = {};
    this.measure();
  }
  measure() {
    const W = this.area.clientWidth;
    const L = this.L;
    L.W = W;
    L.cw = Math.floor(Math.min(84, Math.max(46, W / 7.2)));
    L.ch = Math.round(L.cw * 1.4);
    L.small = Math.round(L.cw * 0.62);
    L.H = Math.round(L.ch * 1.15 + L.small * 1.4 * 2 + L.ch * 1.3 + 30);
    this.T.size(L.cw);
  }
  // state: { hands, trick, legal (Set), picked (Set), reveal (bool), labels: [text per seat], lastWinner }
  draw(st) {
    const { T, L } = this;
    T.hideAll();
    const W = L.W, cw = L.cw, ch = L.ch;
    this.area.style.height = L.H + 'px';
    // your hand
    const mine = st.hands[0];
    const step = mine.length > 1 ? Math.min(Math.round(cw * 0.62), Math.floor((W - cw) / (mine.length - 1))) : 0;
    const x0 = Math.round((W - (cw + step * (mine.length - 1))) / 2);
    const yHand = L.H - ch - 4;
    mine.forEach((c, k) => {
      const legal = !st.legal || st.legal.has(c);
      T.place(c, x0 + k * step, yHand - (st.picked && st.picked.has(c) ? Math.round(ch * 0.22) : 0), { up: true, z: 20 + k, tab: legal && st.active, dim: st.active && !legal, sel: st.picked && st.picked.has(c) });
    });
    // computer hands: small fans of card backs
    const smallW = L.small, smallH = Math.round(L.small * 1.4);
    const fan = (seat, n) => {
      const ids = st.hands[seat];
      ids.forEach((c, k) => {
        let x, y;
        const off = Math.min(12, Math.floor((seat === 2 ? W * 0.5 : L.H * 0.45) / Math.max(1, n)));
        if (seat === 2) { x = Math.round(W / 2 - (smallW + off * (n - 1)) / 2) + k * off; y = 4; }
        if (seat === 1) { x = 4; y = Math.round(L.H * 0.4 - (smallH + off * (n - 1)) / 2) + k * off; }
        if (seat === 3) { x = W - smallW - 4; y = Math.round(L.H * 0.4 - (smallH + off * (n - 1)) / 2) + k * off; }
        const up = !!st.reveal;
        T.place(c, x, y, { up, z: 5 + k });
        const el = T.els.get(c);
        el.style.width = smallW + 'px'; el.style.height = smallH + 'px';
        el.style.setProperty('--cw', smallW + 'px');
      });
    };
    [1, 2, 3].forEach((s) => fan(s, st.hands[s].length));
    // restore full size for cards in your hand and the trick
    mine.forEach((c) => { const el = T.els.get(c); el.style.width = cw + 'px'; el.style.height = ch + 'px'; el.style.removeProperty('--cw'); });
    // the trick in the middle
    const cx = W / 2, cy = L.H * 0.42;
    const spot = [[0, 0.42], [-0.62, 0], [0, -0.42], [0.62, 0]];
    (st.trick || []).forEach((p, k) => {
      const [dx, dy] = spot[p.seat];
      const el = T.els.get(p.card);
      el.style.width = cw + 'px'; el.style.height = ch + 'px'; el.style.removeProperty('--cw');
      T.place(p.card, Math.round(cx - cw / 2 + dx * cw * 1.2), Math.round(cy - ch / 2 + dy * ch * 1.05), { up: true, z: 60 + k, lit: st.winning === p.seat });
    });
    // seat labels
    if (!this.labels) {
      this.labels = [0, 1, 2, 3].map(() => { const d = document.createElement('p'); d.className = 'table-note seat'; this.area.appendChild(d); return d; });
    }
    const pos = [[W / 2, yHand - 24], [smallW + 60, L.H * 0.4 + smallH / 2 + 30], [W / 2, smallH + 26], [W - smallW - 60, L.H * 0.4 + smallH / 2 + 30]];
    this.labels.forEach((d, s) => {
      d.textContent = st.labels[s];
      d.classList.toggle('now', st.turn === s);
      d.style.left = Math.round(pos[s][0] - 70) + 'px';
      d.style.top = Math.round(pos[s][1] - 10) + 'px';
      d.style.width = '140px';
    });
  }
  idFrom(e) { return this.T.idFrom(e); }
  els() { return this.T.els; }
}
