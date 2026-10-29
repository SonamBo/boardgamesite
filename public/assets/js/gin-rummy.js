// Gin Rummy: draw, discard, and form melds (sets and runs). Knock when your deadwood is 10 or less,
// or go gin with none. You against the computer; first to 100 points wins.
import { setStatus, levelSwitch, record, showResult } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { shake } from './solo.js';
import { Table, slotEl, placeSlot, deck, suit, rank, short } from './cards.js';
import * as G from './gin-engine.js';
import { wait } from './dice-ui.js';

const $ = (id) => document.getElementById(id);
const GOAL = 100;
const score = record('gin');
const getLevel = levelSwitch('gin', () => {});
const area = $('area');
const T = new Table(area);
const stockSlot = slotEl(area, 'click stock');
const discSlot = slotEl(area, '');
const labels = [0, 1].map(() => { const d = document.createElement('p'); d.className = 'table-note seat'; area.appendChild(d); return d; });

let hands, stock, discard, turn, phase, sel, took, totals, over, busy, reveal, L = {};
// phase: 'draw' (pick a card up), 'discard' (throw one), 'end'

function measure() {
  const W = area.clientWidth;
  L.W = W;
  L.cw = Math.floor(Math.min(80, Math.max(42, W / 8)));
  L.ch = Math.round(L.cw * 1.4);
  L.small = Math.round(L.cw * 0.6);
  L.H = Math.round(L.ch * 2.5 + L.small * 1.4 + 60);
  T.size(L.cw);
}
// your hand shown with melds first, then deadwood
function arranged(h) {
  const b = G.best(h);
  const order = b.melds.flat().concat(b.dead.sort((a, c) => rank(a) - rank(c) || suit(a) - suit(c)));
  const inMeld = new Set(b.melds.flat());
  return { order, inMeld, dead: b.score };
}
function render() {
  T.hideAll();
  area.style.height = L.H + 'px';
  const { W, cw, ch } = L;
  const sized = (c, w) => { const el = T.els.get(c); el.style.width = w + 'px'; el.style.height = Math.round(w * 1.4) + 'px'; el.style.setProperty('--cw', w + 'px'); };
  // computer hand at the top
  const opp = reveal ? arranged(hands[1]).order : hands[1];
  const ow = L.small;
  const oOff = Math.min(reveal ? Math.round(ow * 0.62) : 12, Math.floor((W - ow) / Math.max(1, opp.length)));
  opp.forEach((c, k) => { sized(c, ow); T.place(c, Math.round(W / 2 - (ow + oOff * (opp.length - 1)) / 2 + k * oOff), 4, { up: reveal, z: 3 + k }); });
  const ar1 = arranged(hands[1]);
  labels[1].textContent = 'Computer' + (reveal ? ' · deadwood ' + ar1.dead : ' · ' + hands[1].length + ' cards');
  labels[1].style.left = Math.round(W / 2 - 80) + 'px'; labels[1].style.top = (Math.round(ow * 1.4) + 8) + 'px'; labels[1].style.width = '160px';
  labels[1].classList.toggle('now', turn === 1 && phase !== 'end');
  // stock and discard
  const my = Math.round(L.small * 1.4 + 40);
  const px = Math.round(W / 2 - cw - 12), dx = Math.round(W / 2 + 12);
  placeSlot(stockSlot, px, my, cw, ch); placeSlot(discSlot, dx, my, cw, ch);
  const canDraw = turn === 0 && phase === 'draw' && !busy;
  stockSlot.classList.toggle('drop', canDraw);
  stock.slice(-3).forEach((c, k) => { sized(c, cw); T.place(c, px + k * 2, my - k * 2, { up: false, z: 2 + k }); });
  discard.slice(-2).forEach((c, k) => { sized(c, cw); T.place(c, dx, my, { up: true, z: 5 + k, lit: canDraw && k === Math.min(1, discard.length - 1), tab: canDraw && k === Math.min(1, discard.length - 1) }); });
  // your hand
  const ar = arranged(hands[0]);
  const h = ar.order;
  const step = h.length > 1 ? Math.min(Math.round(cw * 0.66), Math.floor((W - cw) / (h.length - 1))) : 0;
  const x0 = Math.round((W - (cw + step * (h.length - 1))) / 2);
  const yH = L.H - ch - 4;
  h.forEach((c, k) => { sized(c, cw); T.place(c, x0 + k * step, yH - (sel === c ? Math.round(ch * 0.2) : 0) - (ar.inMeld.has(c) ? 0 : 0), { up: true, z: 20 + k, tab: turn === 0 && phase === 'discard' && !busy, sel: sel === c, dim: phase !== 'end' && !ar.inMeld.has(c) && false }); T.els.get(c).classList.toggle('meld', ar.inMeld.has(c)); });
  labels[0].textContent = 'You · deadwood ' + ar.dead;
  labels[0].style.left = Math.round(W / 2 - 80) + 'px'; labels[0].style.top = (yH - 24) + 'px'; labels[0].style.width = '160px';
  labels[0].classList.toggle('now', turn === 0 && phase !== 'end');
  // buttons
  const after = sel != null ? G.best(hands[0].filter((c) => c !== sel)).score : 99;
  $('discard-btn').hidden = !(turn === 0 && phase === 'discard');
  $('discard-btn').disabled = sel == null || busy;
  $('knock-btn').hidden = !(turn === 0 && phase === 'discard');
  $('knock-btn').disabled = sel == null || after > 10 || busy;
  $('knock-btn').textContent = sel != null && after === 0 ? 'Gin!' : 'Knock';
  $('score-you').textContent = String(totals[0]);
  $('score-cpu').textContent = String(totals[1]);
  $('row-you').classList.toggle('turn-you', turn === 0 && phase !== 'end');
  $('row-cpu').classList.toggle('turn-cpu', turn === 1 && phase !== 'end');
  $('next-hand').hidden = phase !== 'end' || over;
}

function deal() {
  const d = deck();
  hands = [d.slice(0, 10), d.slice(10, 20)];
  discard = [d[20]];
  stock = d.slice(21);
  turn = totals.reduce((a, b) => a + b, 0) % 2 === 0 ? 0 : 1; // simple alternation
  phase = 'draw'; sel = null; took = null; reveal = false; busy = false;
  T.hideAll();
  render();
  if (turn === 1) cpuTurn(); else setStatus('Your turn: draw from the deck or take the discard', '');
}

function draw(from) {
  if (from === 'stock') { if (stock.length <= 2) return endDraw(); hands[turn].push(stock.pop()); took = null; play('flip'); }
  else { const c = discard.pop(); hands[turn].push(c); took = c; play('card'); }
  phase = 'discard';
}
function doDiscard(c, knock) {
  hands[turn] = hands[turn].filter((x) => x !== c);
  discard.push(c);
  sel = null;
  play('card');
  if (knock) return showdown(turn);
  if (stock.length <= 2) return endDraw();
  turn = 1 - turn; phase = 'draw';
  render();
  if (turn === 1) cpuTurn(); else setStatus('Your turn: draw from the deck or take the ' + short(discard[discard.length - 1]), '');
}

async function cpuTurn() {
  busy = true; render();
  await wait(700);
  const lvl = getLevel();
  const h = hands[1], top = discard[discard.length - 1];
  const now = G.best(h).score;
  const withTop = G.bestDiscard(h.concat([top]), top);
  const takeTop = lvl !== 'easy' ? withTop.score < now - (lvl === 'hard' ? 0 : 2) : Math.random() < 0.3;
  draw(takeTop ? 'discard' : 'stock');
  if (phase !== 'discard') return; // the hand ended in a draw
  setStatus('The computer ' + (takeTop ? 'took the ' + short(top) : 'drew from the deck'), 'cpu');
  render();
  await wait(700);
  const pick = lvl === 'easy' && Math.random() < 0.3 ? { card: hands[1].filter((c) => c !== took)[Math.floor(Math.random() * 10)], score: 99 } : G.bestDiscard(hands[1], took);
  const after = G.best(hands[1].filter((c) => c !== pick.card)).score;
  const knock = after === 0 || (after <= 10 && (lvl !== 'hard' || after <= 6 || stock.length < 14));
  busy = false;
  doDiscard(pick.card, knock);
}

function endDraw() {
  phase = 'end'; reveal = true;
  render();
  setStatus('The deck ran low. This hand is a draw', 'neutral');
  showRound('No score this hand', 'Only two cards were left in the deck.', 'draw');
}

function showdown(k) {
  phase = 'end'; reveal = true;
  const d = 1 - k;
  const kb = G.best(hands[k]), db = G.best(hands[d]);
  let dDead = db.score, text, pts = 0, winner;
  const gin = kb.score === 0;
  if (!gin) { const left = G.layOff(kb.melds, db.dead); dDead = left.reduce((a, c) => a + G.value(c), 0); }
  if (gin) { winner = k; pts = 25 + dDead; text = (k === 0 ? 'Gin! You score ' : 'Gin for the computer: ') + pts; }
  else if (kb.score < dDead) { winner = k; pts = dDead - kb.score; text = (k === 0 ? 'You knocked and score ' : 'The computer knocked and scores ') + pts; }
  else { winner = d; pts = kb.score - dDead + 25; text = 'Undercut! ' + (d === 0 ? 'You score ' : 'The computer scores ') + pts; }
  totals[winner] += pts;
  play(winner === 0 ? 'found' : 'lose');
  render();
  setStatus(text, winner === 0 ? '' : 'cpu');
  if (totals[0] >= GOAL || totals[1] >= GOAL) return finish();
  showRound(text, 'Deadwood: you ' + (k === 0 ? kb.score : dDead) + ', computer ' + (k === 1 ? kb.score : dDead) + '.', winner === 0 ? 'win' : 'lose');
}
function showRound(text, sub) { $('hand-note').textContent = text + '. ' + sub; $('hand-note').hidden = false; render(); }

function finish() {
  over = true;
  const won = totals[0] > totals[1];
  score.add(won ? 'win' : 'lose');
  render();
  showResult(won ? 'win' : 'lose', won ? 'You won!' : 'The computer won', 'Final score: you ' + totals[0] + ', computer ' + totals[1] + '.');
  play(won ? 'win' : 'lose', 0.1);
  track('game_end', { game: 'gin-rummy', result: won ? 'win' : 'lose' });
}

function newGame() {
  totals = [0, 0]; over = false;
  $('result').hidden = true; $('hand-note').hidden = true;
  track('game_start', { game: 'gin-rummy' });
  deal();
}

area.addEventListener('click', (e) => {
  if (turn !== 0 || busy || over || phase === 'end') return;
  const c = T.idFrom(e);
  if (phase === 'draw') {
    if (e.target.closest('.stock') || (c != null && stock.includes(c))) { draw('stock'); if (phase === 'discard') { setStatus('Tap a card to discard. Knock if your deadwood is 10 or less', ''); render(); } return; }
    if (c != null && c === discard[discard.length - 1]) { draw('discard'); setStatus('You took the ' + short(c) + '. Now discard a different card', ''); return render(); }
    return;
  }
  if (c == null || !hands[0].includes(c)) return;
  if (c === took) { shake(T.els.get(c), play); setStatus('You can’t throw back the card you just picked up', 'neutral'); return; }
  sel = sel === c ? null : c;
  play('select');
  if (sel != null) { const after = G.best(hands[0].filter((x) => x !== sel)).score; setStatus('Discard the ' + short(sel) + '? Deadwood after: ' + after, ''); }
  render();
});
area.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.pc')) { e.preventDefault(); e.target.click(); } });
$('discard-btn').addEventListener('click', () => { if (sel != null && turn === 0 && phase === 'discard') doDiscard(sel, false); });
$('knock-btn').addEventListener('click', () => { if (sel != null && turn === 0 && phase === 'discard' && G.best(hands[0].filter((x) => x !== sel)).score <= 10) doDiscard(sel, true); });
$('next-hand').addEventListener('click', () => { $('hand-note').hidden = true; deal(); });
$('new-game').addEventListener('click', () => { if (!busy) newGame(); });
$('again').addEventListener('click', newGame);
let raf = 0;
window.addEventListener('resize', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { measure(); render(); }); });
measure();
newGame();
