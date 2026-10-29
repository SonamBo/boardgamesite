// Pyramid Solitaire: remove pairs of cards that add up to 13. Kings go on their own.
import { cardGame } from './peaks.js';

const POS = [];
for (let r = 0; r < 7; r++) for (let i = 0; i <= r; i++) POS.push({ r, i });
const idx = (r, i) => (r * (r + 1)) / 2 + i;
const free = (S, k) => { const { r, i } = POS[k]; return S.pyr[k] != null && (r === 6 || (S.pyr[idx(r + 1, i)] == null && S.pyr[idx(r + 1, i + 1)] == null)); };
const PASSES = 3;

cardGame({
  slug: 'pyramid', key: 'bgs-pyr-stats', save: 'bgs-pyr-game', cols: 7, maxCw: 96, wasteTappable: true,
  intro: 'Remove pairs that add up to 13. Kings go alone',
  recordText: (s) => (s.won || 0) + ' of ' + (s.played || 0) + ' pyramids cleared',
  deal: (d) => ({ pyr: d.slice(0, 28), stock: d.slice(28), waste: [], pass: 1 }),
  canDraw: (S) => S.stock.length > 0 || (S.waste.length > 0 && S.pass < PASSES),
  draw: (S) => {
    if (S.stock.length) S.waste.push(S.stock.pop());
    else { S.stock = S.waste.reverse(); S.waste = []; S.pass++; }
  },
  layout(S, L, g) {
    const out = [], dy = Math.round(L.ch * 0.45);
    S.pyr.forEach((id, k) => {
      if (id == null) return;
      const { r, i } = POS[k];
      const f = free(S, k);
      out.push({ id, x: L.left + Math.round((3 - r / 2 + i) * L.cw), y: r * dy, up: true, z: 1 + r, sel: g.sel === id, tab: f, dim: !f });
    });
    return out;
  },
  bottomY: (L) => Math.round(L.ch * 0.45) * 6 + L.ch + Math.round(L.ch * 0.3),
  stockX: 2,
  afterRender(g) { document.getElementById('passes').textContent = g.S.pass + ' / ' + PASSES; },
  tap(id, g) {
    const S = g.S, k = S.pyr.indexOf(id);
    const isWaste = S.waste[S.waste.length - 1] === id;
    if (k < 0 && !isWaste) return;
    if (k >= 0 && !free(S, k)) return g.shake(id);
    const remove = (ids) => {
      g.push(); g.start();
      ids.forEach((x) => { const j = S.pyr.indexOf(x); if (j >= 0) S.pyr[j] = null; else S.waste.pop(); });
      g.sel = null;
      g.play('found');
      g.after();
    };
    if (g.rank(id) === 13) return remove([id]);
    if (g.sel == null || g.sel === id) { g.sel = g.sel === id ? null : id; g.play('select'); return g.render(); }
    if (g.rank(g.sel) + g.rank(id) === 13) return remove([g.sel, id]);
    g.shake(id);
    g.status(g.rank(g.sel) + ' and ' + g.rank(id) + ' make ' + (g.rank(g.sel) + g.rank(id)) + ', not 13', 'neutral');
    g.sel = id;
    g.render();
  },
  check(S, g) {
    if (S.pyr.every((x) => x == null)) { g.finish(true, 'Pyramid cleared!', 'Every card removed in ' + S.pass + (S.pass === 1 ? ' pass' : ' passes') + ' through the deck.'); return true; }
    // out of moves: nothing more to draw and no pair available
    const open = S.pyr.filter((x, k) => x != null && free(S, k));
    if (S.waste.length) open.push(S.waste[S.waste.length - 1]);
    const pair = open.some((a) => g.rank(a) === 13 || open.some((b) => b !== a && g.rank(a) + g.rank(b) === 13));
    if (!pair && !S.stock.length && (S.pass >= PASSES || !S.waste.length)) {
      const left = S.pyr.filter((x) => x != null).length;
      g.finish(false, left + (left === 1 ? ' card' : ' cards') + ' left in the pyramid', 'No pairs left and no more passes through the deck.');
      return true;
    }
    return false;
  },
  nearWin: (S) => S.pyr.filter((x) => x != null).length <= 3
});
