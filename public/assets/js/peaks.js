// Shared engine for the "build on the waste pile" solitaires: TriPeaks, Golf and Pyramid.
// Each game describes its layout; this file handles the table, the deck, undo, saving and the end.
import { store } from './site.js';
import { setStatus, MASCOT } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { clock, fmt, soloRecord, shake } from './solo.js';
import { Table, slotEl, placeSlot, rank, deck } from './cards.js';

export function cardGame(cfg) {
  const $ = (id) => document.getElementById(id);
  const area = $('area');
  const T = new Table(area);
  const stockSlot = slotEl(area, 'click stock', '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>');
  const wasteSlot = slotEl(area, '');
  const timer = clock($('time'));
  const rec = soloRecord(cfg.key, { onPaint: (s, b) => { $('record').textContent = cfg.recordText(s, b, store); } });
  const g = { S: null, history: [], sel: null, started: false, done: false, L: {} };

  g.save = () => { if (g.started && !g.done) store.set(cfg.save, { S: g.S, elapsed: timer.elapsed() }); };
  g.push = () => { g.history.push(JSON.parse(JSON.stringify(g.S))); };
  g.start = () => { if (!g.started) { g.started = true; timer.start(0); rec.played(); track('game_start', { game: cfg.slug }); } };
  g.shake = (id) => { const el = T.els.get(id); if (el) shake(el, play); };
  g.status = setStatus;
  g.play = play;
  g.rank = rank;

  function measure() {
    const W = area.clientWidth;
    const L = g.L;
    L.cw = Math.floor(Math.min(cfg.maxCw || 96, W / cfg.cols));
    L.ch = Math.round(L.cw * 1.4);
    L.left = Math.floor((W - cfg.cols * L.cw) / 2);
    T.size(Math.round(L.cw * (cfg.scale || 1)));
  }
  g.render = () => {
    T.hideAll();
    const L = g.L;
    const items = cfg.layout(g.S, L, g);
    items.forEach((it) => T.place(it.id, it.x, it.y, it));
    // stock and waste along the bottom
    const by = cfg.bottomY(L);
    const sx = L.left + (cfg.stockX || 0) * L.cw, wx = sx + L.cw + Math.round(L.cw * 0.3);
    placeSlot(stockSlot, sx, by, L.cw, L.ch);
    placeSlot(wasteSlot, wx, by, L.cw, L.ch);
    stockSlot.classList.toggle('click', cfg.canDraw(g.S));
    g.S.stock.slice(-3).forEach((id, k, a) => T.place(id, sx + k * 3, by - k * 2, { up: false, z: 2 + k }));
    const w = g.S.waste;
    w.slice(-3).forEach((id, k, a) => T.place(id, wx + k * Math.round(L.cw * (cfg.fanWaste ? 0.22 : 0)), by, { up: true, z: 5 + k, sel: g.sel === id, tab: k === a.length - 1 && !!cfg.wasteTappable }));
    area.style.height = (by + L.ch + 4) + 'px';
    const note = $('stock-left');
    if (note) note.textContent = String(g.S.stock.length);
    $('undo').disabled = !g.history.length || g.done;
    if (cfg.afterRender) cfg.afterRender(g);
  };
  g.finish = (won, text, sub, extra) => {
    g.done = true;
    timer.stop();
    const t = timer.elapsed();
    let record = false;
    if (won) record = rec.won(cfg.bestLevel || 'all', t); else rec.lost();
    if (extra) extra(rec);
    store.set(cfg.save, null);
    g.render();
    setStatus(text, won ? '' : 'neutral');
    $('result-img').src = MASCOT[won ? 'win' : cfg.nearWin && cfg.nearWin(g.S) ? 'draw' : 'lose'];
    $('result-text').textContent = text;
    $('result-sub').textContent = sub + (won ? ' Time ' + fmt(t) + '.' + (record ? ' A new best time!' : '') : '');
    $('result').hidden = false;
    play(won ? 'win' : 'lose', 0.1);
    track('game_end', { game: cfg.slug, result: won ? 'win' : 'lose' });
  };
  g.after = () => {
    g.render();
    const end = cfg.check(g.S, g);
    if (end) return;
    g.save();
  };

  area.addEventListener('click', (e) => {
    if (g.done) return;
    if (e.target.closest('.stock') || (T.idFrom(e) != null && g.S.stock.includes(T.idFrom(e)))) {
      if (!cfg.canDraw(g.S)) { shake(stockSlot, play); return; }
      g.push(); g.start(); g.sel = null;
      cfg.draw(g.S);
      play('flip');
      return g.after();
    }
    const id = T.idFrom(e);
    if (id == null) { g.sel = null; return g.render(); }
    cfg.tap(id, g);
  });
  area.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.pc')) { e.preventDefault(); e.target.click(); } });

  g.newGame = () => {
    g.S = cfg.deal(deck()); g.history = []; g.sel = null; g.started = false; g.done = false;
    timer.reset();
    $('result').hidden = true;
    store.set(cfg.save, null);
    g.render();
    setStatus(cfg.intro, 'neutral');
  };
  function resume() {
    const s = store.get(cfg.save, null);
    if (!s || !s.S || !Array.isArray(s.S.stock)) return false;
    g.S = s.S; g.history = []; g.sel = null; g.started = true; g.done = false;
    timer.start(Number(s.elapsed) || 0);
    g.render();
    setStatus('Welcome back. Your game is where you left it', 'neutral');
    return true;
  }
  window.addEventListener('pagehide', g.save);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { g.save(); if (timer.running) timer.stop(); }
    else if (g.started && !g.done && !timer.running) timer.start(timer.elapsed());
  });
  $('undo').addEventListener('click', () => { if (!g.history.length || g.done) return; g.S = g.history.pop(); g.sel = null; play('card'); g.render(); g.save(); });
  $('new-game').addEventListener('click', () => { play('shuffle'); g.newGame(); });
  $('again').addEventListener('click', () => { play('shuffle'); g.newGame(); });
  let raf = 0;
  window.addEventListener('resize', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { measure(); g.render(); }); });
  measure();
  if (!resume()) g.newGame();
  return g;
}
