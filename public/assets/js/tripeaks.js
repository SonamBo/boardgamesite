// TriPeaks: clear three peaks of cards by playing ones that are one higher or one lower than the waste card.
import { cardGame } from './peaks.js';

// positions (in card widths) for the 28 cards, top row first, and who covers whom
const POS = [];
[[1.5, 4.5, 7.5], [1, 2, 4, 5, 7, 8], [0.5, 1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5, 8.5], [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]].forEach((xs, row) => xs.forEach((x) => POS.push({ x, row })));
const COVER = POS.map((p) => POS.map((q, j) => (q.row === p.row + 1 && Math.abs(q.x - p.x) === 0.5 ? j : -1)).filter((j) => j >= 0));
const free = (S, i) => S.peaks[i] != null && COVER[i].every((j) => S.peaks[j] == null);
const near = (a, b, rank) => { const d = Math.abs(rank(a) - rank(b)); return d === 1 || d === 12; };

cardGame({
  slug: 'tripeaks', key: 'bgs-tri-stats', save: 'bgs-tri-game', cols: 10, maxCw: 88,
  intro: 'Play a card one higher or lower than the waste card',
  recordText: (s, b, store) => (s.won || 0) + ' of ' + (s.played || 0) + ' games won' + (store.get('bgs-tri-chain', 0) ? ' · longest chain ' + store.get('bgs-tri-chain', 0) : ''),
  deal: (d) => ({ peaks: d.slice(0, 28), stock: d.slice(29), waste: [d[28]], chain: 0, best: 0 }),
  canDraw: (S) => S.stock.length > 0,
  draw: (S) => { S.waste.push(S.stock.pop()); S.chain = 0; },
  layout(S, L) {
    const out = [];
    const dy = Math.round(L.ch * 0.5);
    S.peaks.forEach((id, i) => {
      if (id == null) return;
      const p = POS[i];
      out.push({ id, x: L.left + Math.round(p.x * L.cw), y: p.row * dy, up: free(S, i), z: 1 + p.row, tab: free(S, i) });
    });
    return out;
  },
  bottomY: (L) => Math.round(L.ch * 0.5) * 3 + L.ch + Math.round(L.ch * 0.35),
  stockX: 3,
  afterRender(g) { document.getElementById('chain').textContent = String(g.S.chain); },
  tap(id, g) {
    const S = g.S, i = S.peaks.indexOf(id);
    if (i < 0) return;
    if (!free(S, i)) return g.shake(id);
    if (!near(id, S.waste[S.waste.length - 1], g.rank)) { g.shake(id); g.status('Play a card one higher or one lower than the waste card', 'neutral'); return; }
    g.push(); g.start();
    S.peaks[i] = null; S.waste.push(id); S.chain++; S.best = Math.max(S.best, S.chain);
    g.play(S.chain >= 5 ? 'king' : 'found');
    if (S.chain >= 3) g.status('Chain of ' + S.chain + '!', '');
    g.after();
  },
  check(S, g) {
    const saveChain = () => { try { const b = JSON.parse(localStorage.getItem('bgs-tri-chain') || '0'); if (S.best > b) localStorage.setItem('bgs-tri-chain', JSON.stringify(S.best)); } catch (e) { /* ignore */ } };
    if (S.peaks.every((x) => x == null)) { saveChain(); g.finish(true, 'All three peaks cleared!', 'Longest chain: ' + S.best + '.'); return true; }
    const top = S.waste[S.waste.length - 1];
    const any = S.peaks.some((id, i) => id != null && free(S, i) && near(id, top, g.rank));
    if (!any && !S.stock.length) { saveChain(); const left = S.peaks.filter((x) => x != null).length; g.finish(false, left + (left === 1 ? ' card' : ' cards') + ' left', 'No more moves and the deck is empty. Longest chain: ' + S.best + '.'); return true; }
    return false;
  },
  nearWin: (S) => S.peaks.filter((x) => x != null).length <= 4
});
