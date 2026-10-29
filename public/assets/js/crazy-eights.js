// Crazy Eights: match the top card by suit or number. Eights are wild. First to empty their hand wins.
import { store } from './site.js';
import { setStatus, levelSwitch, record, showResult } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { shake } from './solo.js';
import { Table, slotEl, placeSlot, deck, suit, rank, shuffle, SUIT_NAMES, suitIcon } from './cards.js';
import { sortHand } from './tricks.js';
import { wait } from './dice-ui.js';

const $ = (id) => document.getElementById(id);
const score = record('eights');
const getLevel = levelSwitch('eights', () => {});
const N_KEY = 'bgs-eights-n';
const NAMES = ['You', 'Rosa', 'Otto', 'Mei'];
const area = $('area');
const T = new Table(area);
const drawSlot = slotEl(area, 'click stock');
let n = [2, 3, 4].includes(store.get(N_KEY, 2)) ? store.get(N_KEY, 2) : 2;
let hands, pile, discard, current, turn, over, busy, drewThisTurn, choosing, L = {};

const top = () => discard[discard.length - 1];
const fits = (c) => rank(c) === 8 || suit(c) === current || rank(c) === rank(top());
const playable = (s) => hands[s].filter(fits);

function measure() {
  const W = area.clientWidth;
  L.W = W;
  L.cw = Math.floor(Math.min(84, Math.max(46, W / 7.2)));
  L.ch = Math.round(L.cw * 1.4);
  L.small = Math.round(L.cw * 0.6);
  L.H = Math.round(L.ch * 2.4 + L.small * 1.4 + 70);
  T.size(L.cw);
}
function render() {
  T.hideAll();
  area.style.height = L.H + 'px';
  const { W, cw, ch } = L;
  // opponents across the top
  const seats = hands.length - 1;
  for (let s = 1; s <= seats; s++) {
    const h = hands[s];
    const cx = W * s / (seats + 1);
    const off = Math.min(10, Math.floor((W / (seats + 1) - L.small) / Math.max(1, h.length)));
    h.forEach((c, k) => {
      T.place(c, Math.round(cx - (L.small + off * (h.length - 1)) / 2 + k * off), 4, { up: over, z: 3 + k });
      const el = T.els.get(c); el.style.width = L.small + 'px'; el.style.height = Math.round(L.small * 1.4) + 'px'; el.style.setProperty('--cw', L.small + 'px');
    });
    const lab = labels[s];
    lab.textContent = NAMES[s] + ' · ' + h.length + (h.length === 1 ? ' card' : ' cards');
    lab.style.left = Math.round(cx - 70) + 'px'; lab.style.top = (Math.round(L.small * 1.4) + 10) + 'px'; lab.style.width = '140px';
    lab.classList.toggle('now', turn === s && !over);
    lab.hidden = false;
  }
  labels.forEach((l, s) => { if (s > seats) l.hidden = true; });
  // draw pile and discard in the middle
  const my = Math.round(L.small * 1.4 + 44);
  const px = Math.round(W / 2 - cw - 12), dx = Math.round(W / 2 + 12);
  placeSlot(drawSlot, px, my, cw, ch);
  pile.slice(-3).forEach((c, k) => { const el = T.els.get(c); el.style.width = cw + 'px'; el.style.height = ch + 'px'; el.style.removeProperty('--cw'); T.place(c, px + k * 2, my - k * 2, { up: false, z: 2 + k }); });
  discard.slice(-2).forEach((c, k) => { const el = T.els.get(c); el.style.width = cw + 'px'; el.style.height = ch + 'px'; el.style.removeProperty('--cw'); T.place(c, dx, my, { up: true, z: 5 + k }); });
  $('ce-suit').innerHTML = rank(top()) === 8 || current !== suit(top()) ? 'Suit to play: ' + suitIcon(current, 'ce-ic' + (current === 1 || current === 2 ? ' red' : '')) + ' ' + SUIT_NAMES[current] : '';
  // your hand
  const mine = hands[0];
  const step = mine.length > 1 ? Math.min(Math.round(cw * 0.62), Math.floor((W - cw) / (mine.length - 1))) : 0;
  const x0 = Math.round((W - (cw + step * (mine.length - 1))) / 2);
  const yHand = L.H - ch - 4;
  const myTurn = turn === 0 && !busy && !over && !choosing;
  mine.forEach((c, k) => {
    const el = T.els.get(c); el.style.width = cw + 'px'; el.style.height = ch + 'px'; el.style.removeProperty('--cw');
    T.place(c, x0 + k * step, yHand, { up: true, z: 20 + k, tab: myTurn && fits(c), dim: myTurn && !fits(c) });
  });
  labels[0].textContent = 'You · ' + mine.length + (mine.length === 1 ? ' card' : ' cards');
  labels[0].style.left = Math.round(W / 2 - 70) + 'px'; labels[0].style.top = (yHand - 24) + 'px'; labels[0].style.width = '140px';
  labels[0].classList.toggle('now', turn === 0 && !over);
  drawSlot.classList.toggle('drop', myTurn && !drewThisTurn && !playable(0).length);
  $('pass-btn').hidden = !(myTurn && drewThisTurn && !playable(0).length);
  $('suit-pick').hidden = !choosing;
}
const labels = [0, 1, 2, 3].map(() => { const d = document.createElement('p'); d.className = 'table-note seat'; area.appendChild(d); return d; });

function refill() {
  if (pile.length) return true;
  if (discard.length <= 1) return false;
  const keep = discard.pop();
  pile = shuffle(discard);
  discard = [keep];
  setStatus('The discards were shuffled into a new pile', 'neutral');
  return true;
}
function drawCard(s) {
  if (!refill()) return null;
  const c = pile.pop();
  hands[s] = s === 0 ? sortHand(hands[s].concat([c])) : hands[s].concat([c]);
  play('flip');
  return c;
}
function playCard(s, c, newSuit) {
  hands[s] = hands[s].filter((x) => x !== c);
  discard.push(c);
  current = rank(c) === 8 ? newSuit : suit(c);
  play(rank(c) === 8 ? 'king' : 'card');
  if (!hands[s].length) return finish(s);
  if (hands[s].length === 1) setStatus(NAMES[s] + (s === 0 ? ' have' : ' has') + ' one card left!', s ? 'cpu' : '');
  else if (rank(c) === 8) setStatus(NAMES[s] + (s === 0 ? ' changed' : ' changes') + ' the suit to ' + SUIT_NAMES[newSuit], s ? 'cpu' : '');
  nextTurn();
}
function nextTurn() {
  turn = (turn + 1) % hands.length;
  drewThisTurn = false;
  render();
  if (turn !== 0) cpuTurn();
  else setStatus(playable(0).length ? 'Your turn: match the suit or number' : 'No match: tap the pile to draw', '');
}

// The computer keeps its eights for emergencies and plays toward the suit it holds most of.
async function cpuTurn() {
  busy = true; render();
  await wait(700);
  const s = turn, lvl = getLevel();
  let opts = playable(s);
  if (!opts.length) {
    const c = drawCard(s);
    render();
    await wait(500);
    opts = c != null && fits(c) ? [c] : [];
    if (!opts.length) { busy = false; setStatus(NAMES[s] + ' drew and passed', 'cpu'); return nextTurn(); }
  }
  const counts = [0, 1, 2, 3].map((x) => hands[s].filter((c) => suit(c) === x && rank(c) !== 8).length);
  const plain = opts.filter((c) => rank(c) !== 8);
  let pick;
  if (lvl === 'easy') pick = opts[Math.floor(Math.random() * opts.length)];
  else if (plain.length) pick = plain.sort((a, b) => counts[suit(b)] - counts[suit(a)] || rank(b) - rank(a))[0];
  else pick = opts[0];
  // hard: if the next player is down to one card, try to change the suit away from what they need
  const best = counts.indexOf(Math.max(...counts));
  busy = false;
  playCard(s, pick, best);
}

function finish(s) {
  over = true;
  render();
  const won = s === 0;
  score.add(won ? 'win' : 'lose');
  const left = hands[0].length;
  showResult(won ? 'win' : 'lose', won ? 'You won!' : NAMES[s] + ' won', won ? 'You played your last card first.' : 'You had ' + left + (left === 1 ? ' card' : ' cards') + ' left.');
  setStatus(won ? 'You won!' : NAMES[s] + ' went out first', won ? '' : 'cpu');
  play(won ? 'win' : 'lose', 0.1);
  track('game_end', { game: 'crazy-eights', result: won ? 'win' : 'lose', players: n });
}

function newGame() {
  const d = deck();
  const per = n === 2 ? 7 : 5;
  hands = Array.from({ length: n }, (_, s) => d.slice(s * per, s * per + per));
  hands[0] = sortHand(hands[0]);
  pile = d.slice(n * per);
  // the first upcard can't be an eight
  let i = pile.findIndex((c) => rank(c) !== 8);
  discard = [pile.splice(i, 1)[0]];
  current = suit(discard[0]);
  turn = 0; over = false; busy = false; drewThisTurn = false; choosing = null;
  $('result').hidden = true;
  T.hideAll();
  track('game_start', { game: 'crazy-eights', players: n });
  render();
  setStatus(playable(0).length ? 'Your turn: match the suit or number' : 'No match: tap the pile to draw', '');
}

area.addEventListener('click', (e) => {
  if (over || busy || turn !== 0 || choosing) return;
  if (e.target.closest('.stock') || (T.idFrom(e) != null && pile.includes(T.idFrom(e)))) {
    if (drewThisTurn) return;
    if (playable(0).length && getLevel() !== 'easy') { setStatus('You have a card you can play', 'neutral'); shake(drawSlot, play); return; }
    const c = drawCard(0);
    drewThisTurn = true;
    if (c == null) { setStatus('No cards left to draw', 'neutral'); nextTurn(); return; }
    setStatus(fits(c) ? 'You drew a card you can play' : 'No luck. Tap Pass', 'neutral');
    return render();
  }
  const c = T.idFrom(e);
  if (c == null || !hands[0].includes(c)) return;
  if (!fits(c)) { shake(T.els.get(c), play); setStatus('Match the suit or the number, or play an 8', 'neutral'); return; }
  if (rank(c) === 8) { choosing = c; setStatus('Pick the new suit', ''); return render(); }
  playCard(0, c);
});
area.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.pc')) { e.preventDefault(); e.target.click(); } });
document.querySelectorAll('[data-suit]').forEach((b) => b.addEventListener('click', () => {
  if (choosing == null) return;
  const c = choosing; choosing = null;
  playCard(0, c, Number(b.dataset.suit));
}));
$('pass-btn').addEventListener('click', () => { if (turn === 0 && drewThisTurn && !busy) { setStatus('You passed', 'neutral'); nextTurn(); } });
document.querySelectorAll('[data-cn]').forEach((b) => {
  b.setAttribute('aria-pressed', String(Number(b.dataset.cn) === n));
  b.addEventListener('click', () => {
    if (busy) return;
    n = Number(b.dataset.cn); store.set(N_KEY, n);
    document.querySelectorAll('[data-cn]').forEach((x) => x.setAttribute('aria-pressed', String(Number(x.dataset.cn) === n)));
    newGame();
  });
});
$('new-game').addEventListener('click', () => { if (!busy) newGame(); });
$('again').addEventListener('click', newGame);
let raf = 0;
window.addEventListener('resize', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { measure(); render(); }); });
measure();
newGame();
