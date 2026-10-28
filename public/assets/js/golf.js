// Golf Solitaire: clear seven columns by playing cards one higher or lower than the waste card. Nothing goes on a King.
import { cardGame } from './peaks.js';

const LOW = 'bgs-golf-low';
const ok = (a, top, rank) => rank(top) !== 13 && Math.abs(rank(a) - rank(top)) === 1;

cardGame({
  slug: 'golf', key: 'bgs-golf-stats', save: 'bgs-golf-game', cols: 7, maxCw: 96, scale: 0.9,
  intro: 'Play a column’s bottom card one higher or lower than the waste card',
  recordText: (s, b, store) => (s.won || 0) + ' of ' + (s.played || 0) + ' games cleared' + (store.get(LOW, null) != null ? ' · best score ' + store.get(LOW, null) : ''),
  deal: (d) => ({ cols: Array.from({ length: 7 }, (_, i) => d.slice(i * 5, i * 5 + 5)), stock: d.slice(36), waste: [d[35]] }),
  canDraw: (S) => S.stock.length > 0,
  draw: (S) => { S.waste.push(S.stock.pop()); },
  layout(S, L) {
    const out = [], fu = Math.round(L.ch * 0.26), gap = Math.round(L.cw * 0.1);
    S.cols.forEach((col, i) => col.forEach((id, k) => out.push({ id, x: L.left + i * L.cw + gap / 2, y: k * fu, up: true, z: 1 + k, tab: k === col.length - 1 })));
    return out;
  },
  bottomY: (L) => Math.round(L.ch * 0.26) * 4 + L.ch + Math.round(L.ch * 0.4),
  stockX: 2,
  afterRender(g) { document.getElementById('left').textContent = String(g.S.cols.flat().length); },
  tap(id, g) {
    const S = g.S, i = S.cols.findIndex((c) => c[c.length - 1] === id);
    if (i < 0) return;
    const top = S.waste[S.waste.length - 1];
    if (!ok(id, top, g.rank)) { g.shake(id); g.status(g.rank(top) === 13 ? 'Nothing can go on a King. Draw a card' : 'Play a card one higher or one lower than the waste card', 'neutral'); return; }
    g.push(); g.start();
    S.cols[i].pop(); S.waste.push(id);
    g.play('found');
    g.after();
  },
  check(S, g) {
    const left = S.cols.flat().length;
    const top = S.waste[S.waste.length - 1];
    const any = S.cols.some((c) => c.length && ok(c[c.length - 1], top, g.rank));
    if (!left || (!any && !S.stock.length)) {
      let low = null; try { low = JSON.parse(localStorage.getItem(LOW)); } catch (e) { /* ignore */ }
      if (low == null || left < low) try { localStorage.setItem(LOW, JSON.stringify(left)); } catch (e) { /* ignore */ }
      if (!left) g.finish(true, 'Every column cleared!', 'A perfect round of Golf.');
      else g.finish(false, 'Score: ' + left, left + (left === 1 ? ' card is' : ' cards are') + ' left. Like golf, lower is better.');
      return true;
    }
    return false;
  },
  nearWin: (S) => S.cols.flat().length <= 5
});
