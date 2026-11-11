// Crazy Eights: match the top card by suit or number. Eights are wild. First to empty their hand wins.
import { store } from './site.js';
import { setStatus, levelSwitch, record, showResult, confirmNewGame, gameInProgress } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { shake } from './solo.js';
import { Table, slotEl, placeSlot, deck, suit, rank, shuffle, SUIT_NAMES, suitIcon } from './cards.js';
import { sortHand } from './tricks.js';
import { wait } from './dice-ui.js';
import { online, roomInLink } from './online.js';

const $ = (id) => document.getElementById(id);
const score = record('eights');
const getLevel = levelSwitch('eights');
const N_KEY = 'bgs-eights-n';
const NAMES = ['You', 'Rosa', 'Otto', 'Mei'];
const area = $('area');
const T = new Table(area);
const drawSlot = slotEl(area, 'click stock');
let n = [2, 3, 4].includes(store.get(N_KEY, 2)) ? store.get(N_KEY, 2) : 2;
let hands, pile, discard, current, turn, over, busy, drewThisTurn, choosing, L = {};

// Online with a friend (2 players): both boards deal from the same seeded deck (the room id is the
// seed) and replay the same moves, so only the moves travel: 'd' draw, 'x' pass, 'p<card>[:<suit>]' play.
let onlineOn = roomInLink, ol = null, rand = Math.random, sendQ = Promise.resolve();
const ME = () => (onlineOn && ol ? Math.max(0, ol.mySeat()) : 0);
const name = (s) => (!onlineOn ? NAMES[s] : s === ME() ? 'You' : 'Your friend');
function seeded(str) {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => { h = (h + 0x6D2B79F5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const send = (token, next, done = false) => { if (onlineOn && ol) sendQ = sendQ.then(() => ol.send(token, next, done)); };

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
  for (let v = 1; v <= seats; v++) {
    const s = (ME() + v) % hands.length;
    const h = hands[s];
    const cx = W * v / (seats + 1);
    const off = Math.min(10, Math.floor((W / (seats + 1) - L.small) / Math.max(1, h.length)));
    h.forEach((c, k) => {
      T.place(c, Math.round(cx - (L.small + off * (h.length - 1)) / 2 + k * off), 4, { up: over, z: 3 + k });
      const el = T.els.get(c); el.style.width = L.small + 'px'; el.style.height = Math.round(L.small * 1.4) + 'px'; el.style.setProperty('--cw', L.small + 'px');
    });
    const lab = labels[v];
    lab.textContent = name(s) + ' · ' + h.length + (h.length === 1 ? ' card' : ' cards');
    lab.style.left = Math.round(cx - 70) + 'px'; lab.style.top = (Math.round(L.small * 1.4) + 10) + 'px'; lab.style.width = '140px';
    lab.classList.toggle('now', turn === s && !over);
    lab.hidden = false;
  }
  labels.forEach((l, v) => { if (v > seats) l.hidden = true; });
  // draw pile and discard in the middle
  const my = Math.round(L.small * 1.4 + 44);
  const px = Math.round(W / 2 - cw - 12), dx = Math.round(W / 2 + 12);
  placeSlot(drawSlot, px, my, cw, ch);
  pile.slice(-3).forEach((c, k) => { const el = T.els.get(c); el.style.width = cw + 'px'; el.style.height = ch + 'px'; el.style.removeProperty('--cw'); T.place(c, px + k * 2, my - k * 2, { up: false, z: 2 + k }); });
  discard.slice(-2).forEach((c, k) => { const el = T.els.get(c); el.style.width = cw + 'px'; el.style.height = ch + 'px'; el.style.removeProperty('--cw'); T.place(c, dx, my, { up: true, z: 5 + k }); });
  $('ce-suit').innerHTML = rank(top()) === 8 || current !== suit(top()) ? 'Suit to play: ' + suitIcon(current, 'ce-ic' + (current === 1 || current === 2 ? ' red' : '')) + ' ' + SUIT_NAMES[current] : '';
  // your hand
  const mine = hands[ME()];
  const step = mine.length > 1 ? Math.min(Math.round(cw * 0.62), Math.floor((W - cw) / (mine.length - 1))) : 0;
  const x0 = Math.round((W - (cw + step * (mine.length - 1))) / 2);
  const yHand = L.H - ch - 4;
  const myTurn = turn === ME() && !busy && !over && !choosing;
  mine.forEach((c, k) => {
    const el = T.els.get(c); el.style.width = cw + 'px'; el.style.height = ch + 'px'; el.style.removeProperty('--cw');
    T.place(c, x0 + k * step, yHand, { up: true, z: 20 + k, tab: myTurn && fits(c), dim: myTurn && !fits(c) });
  });
  labels[0].textContent = 'You · ' + mine.length + (mine.length === 1 ? ' card' : ' cards');
  labels[0].style.left = Math.round(W / 2 - 70) + 'px'; labels[0].style.top = (yHand - 24) + 'px'; labels[0].style.width = '140px';
  labels[0].classList.toggle('now', turn === ME() && !over);
  drawSlot.classList.toggle('drop', myTurn && !drewThisTurn && !playable(ME()).length);
  $('pass-btn').hidden = !(myTurn && drewThisTurn && !playable(ME()).length);
  $('suit-pick').hidden = !choosing;
}
const labels = [0, 1, 2, 3].map(() => { const d = document.createElement('p'); d.className = 'table-note seat'; area.appendChild(d); return d; });

function refill() {
  if (pile.length) return true;
  if (discard.length <= 1) return false;
  const keep = discard.pop();
  pile = shuffle(discard, rand);
  discard = [keep];
  setStatus('Discards shuffled into a new pile', 'neutral');
  return true;
}
function drawCard(s) {
  if (!refill()) return null;
  const c = pile.pop();
  hands[s] = sortHand(hands[s].concat([c]));
  play('flip');
  return c;
}
function playCard(s, c, newSuit) {
  hands[s] = hands[s].filter((x) => x !== c);
  discard.push(c);
  current = rank(c) === 8 ? newSuit : suit(c);
  play(rank(c) === 8 ? 'king' : 'card');
  if (!hands[s].length) return finish(s);
  const mine = s === ME();
  if (hands[s].length === 1) setStatus(name(s) + (mine ? ' have' : ' has') + ' one card left!', mine ? '' : 'cpu');
  else if (rank(c) === 8) setStatus(name(s) + (mine ? ' changed' : ' changes') + ' the suit to ' + SUIT_NAMES[newSuit], mine ? '' : 'cpu');
  nextTurn();
}
function nextTurn() {
  turn = (turn + 1) % hands.length;
  drewThisTurn = false;
  render();
  if (onlineOn) { if (turn !== ME()) setStatus('Waiting for your friend', 'cpu'); else setStatus(playable(ME()).length ? 'Your turn: match the suit or number' : 'No match: tap the pile to draw', ''); return; }
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
  const won = s === ME();
  if (!onlineOn) score.add(won ? 'win' : 'lose');
  const left = hands[ME()].length;
  showResult(won ? 'win' : 'lose', won ? 'You won!' : name(s) + ' won', won ? 'You played your last card first.' : 'You had ' + left + (left === 1 ? ' card' : ' cards') + ' left.');
  setStatus(won ? 'You won!' : name(s) + ' went out first', won ? '' : 'cpu');
  play(won ? 'win' : 'lose', 0.1);
  track('game_end', { game: 'crazy-eights', result: won ? 'win' : 'lose', players: n });
}

function newGame() {
  const room = new URLSearchParams(location.search).get('room');
  rand = onlineOn && room ? seeded(room) : Math.random;
  const players = onlineOn ? 2 : n;
  const d = deck(rand);
  const per = players === 2 ? 7 : 5;
  hands = Array.from({ length: players }, (_, s) => sortHand(d.slice(s * per, s * per + per)));
  pile = d.slice(players * per);
  // the first upcard can't be an eight
  let i = pile.findIndex((c) => rank(c) !== 8);
  discard = [pile.splice(i, 1)[0]];
  current = suit(discard[0]);
  turn = 0; over = false; busy = false; drewThisTurn = false; choosing = null;
  $('result').hidden = true;
  T.hideAll();
  track('game_start', { game: 'crazy-eights', players, online: onlineOn });
  render();
  if (onlineOn) setStatus(turn === ME() ? (playable(ME()).length ? 'Your turn: match the suit or number' : 'No match: tap the pile to draw') : 'Waiting for your friend', turn === ME() ? '' : 'cpu');
  else setStatus(playable(0).length ? 'Your turn: match the suit or number' : 'No match: tap the pile to draw', '');
}

area.addEventListener('click', (e) => {
  const me = ME();
  if (over || busy || turn !== me || choosing) return;
  if (onlineOn && (!ol || !ol.myTurn())) return;
  if (e.target.closest('.stock') || (T.idFrom(e) != null && pile.includes(T.idFrom(e)))) {
    if (drewThisTurn) return;
    if (playable(me).length && (onlineOn || getLevel() !== 'easy')) { setStatus('You have a card you can play', 'neutral'); shake(drawSlot, play); return; }
    const c = drawCard(me);
    drewThisTurn = true;
    if (c == null) { setStatus('No cards left to draw', 'neutral'); send('x', 1 - me); nextTurn(); return; }
    send('d', me);
    setStatus(fits(c) ? 'You drew a card you can play' : 'No luck. Tap Pass', 'neutral');
    return render();
  }
  const c = T.idFrom(e);
  if (c == null || !hands[me].includes(c)) return;
  if (!fits(c)) { shake(T.els.get(c), play); setStatus('Match suit or number, or play an 8', 'neutral'); return; }
  if (rank(c) === 8) { choosing = c; setStatus('Pick the new suit', ''); return render(); }
  playCard(me, c);
  send('p' + c, 1 - me, over);
});
area.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.pc')) { e.preventDefault(); e.target.click(); } });
document.querySelectorAll('[data-suit]').forEach((b) => b.addEventListener('click', () => {
  if (choosing == null) return;
  const c = choosing; choosing = null;
  const me = ME();
  playCard(me, c, Number(b.dataset.suit));
  send('p' + c + ':' + b.dataset.suit, 1 - me, over);
}));
$('pass-btn').addEventListener('click', () => {
  const me = ME();
  if (turn === me && drewThisTurn && !busy) { setStatus('You passed', 'neutral'); send('x', 1 - me); nextTurn(); }
});
document.querySelectorAll('[data-cn]').forEach((b) => {
  b.setAttribute('aria-pressed', String(Number(b.dataset.cn) === n));
  b.addEventListener('click', async () => {
    if (busy || Number(b.dataset.cn) === n || !(await confirmNewGame())) return;
    n = Number(b.dataset.cn); store.set(N_KEY, n);
    document.querySelectorAll('[data-cn]').forEach((x) => x.setAttribute('aria-pressed', String(Number(x.dataset.cn) === n)));
    newGame();
  });
});
$('new-game').addEventListener('click', () => { if (!busy && !onlineOn) newGame(); });
$('new-game').classList.add('online-hide');
$('again').classList.add('online-hide');
// replay a move from the room (the other player's, or every move when rejoining)
function applyToken(tok) {
  const s = turn;
  if (tok === 'd') { drawCard(s); drewThisTurn = true; render(); if (s === ME()) setStatus(playable(s).length ? 'You drew a card you can play' : 'No luck. Tap Pass', 'neutral'); return; }
  if (tok === 'x') { nextTurn(); return; }
  const m = /^p(\d+)(?::(\d))?$/.exec(tok);
  if (m) playCard(s, Number(m[1]), m[2] != null ? Number(m[2]) : undefined);
}
ol = online('crazy-eights', {
  reset: () => newGame(),
  apply: applyToken,
  seatName: (seat) => (seat === 0 ? 'Player 1 (you start)' : 'Player 2'),
  over: () => over,
  onlineChanged: (on) => {
    onlineOn = on; document.body.classList.toggle('online', on);
    // the seat is known only once the room answers: redraw from this player's side
    if (hands && on && hands.length === 2 && !over) { render(); setStatus(turn === ME() ? (playable(ME()).length ? 'Your turn: match the suit or number' : 'No match: tap the pile to draw') : 'Waiting for your friend', turn === ME() ? '' : 'cpu'); }
  }
});
$('again').addEventListener('click', () => { if (!onlineOn) newGame(); });
let raf = 0;
window.addEventListener('resize', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { measure(); render(); }); });
measure();
newGame();
// a game under way (a move made, not finished): changing a setting that starts a new game asks first
gameInProgress(() => !!discard && discard.length > 1 && !over);
