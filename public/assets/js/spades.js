// Spades: you and North are partners against West and East. Bid how many tricks your team will take;
// spades are always trumps. Make your bid to score 10 a trick, plus 1 for each extra (bags). First to 250.
import { setStatus, levelSwitch, record, showResult } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { shake } from './solo.js';
import { deck, suit, rank } from './cards.js';
import { TrickTable, sortHand, trickWinner, rankHi, SEAT_NAMES } from './tricks.js';
import { wait } from './dice-ui.js';

const $ = (id) => document.getElementById(id);
const GOAL = 250, SPADE = 0;
const score = record('spades');
const getLevel = levelSwitch('spades', () => {});
const table = new TrickTable($('area'));
const team = (s) => s % 2; // 0: you + North, 1: West + East

let hands, bids, tricks, totals, bags, dealer, phase, trick, turn, broken, busy, over, myBid, history, seen;

function legal(seat) {
  const h = hands[seat];
  if (trick.length) {
    const led = suit(trick[0].card);
    const f = h.filter((c) => suit(c) === led);
    return f.length ? f : h;
  }
  if (!broken) { const ns = h.filter((c) => suit(c) !== SPADE); if (ns.length) return ns; }
  return h;
}
const teamBid = (t) => bids.reduce((a, b, s) => a + (team(s) === t && b != null ? b : 0), 0);
const teamTricks = (t) => tricks.reduce((a, b, s) => a + (team(s) === t ? b : 0), 0);

function draw() {
  table.draw({
    hands, trick, legal: phase === 'play' && turn === 0 && !busy ? new Set(legal(0)) : new Set(),
    active: phase === 'play' && turn === 0 && !busy,
    labels: SEAT_NAMES.map((n, s) => n + (bids[s] != null ? ' · bid ' + bids[s] + ' · won ' + tricks[s] : '')),
    turn: phase === 'play' ? turn : -1,
    winning: trick.length ? trickWinner(trick, SPADE) : -1
  });
  $('bid-box').hidden = phase !== 'bid' || turn !== 0;
  $('bid-n').textContent = String(myBid);
  $('next-round').hidden = phase !== 'between';
  $('t0').textContent = totals[0] + ' (bags ' + bags[0] + ')';
  $('t1').textContent = totals[1] + ' (bags ' + bags[1] + ')';
  $('b0').textContent = phase === 'bid' && bids[0] == null ? '–' : teamTricks(0) + ' of ' + teamBid(0);
  $('b1').textContent = phase === 'bid' && (bids[1] == null || bids[3] == null) ? '–' : teamTricks(1) + ' of ' + teamBid(1);
}

// count likely tricks: high cards in side suits, and spades
function aiBid(h) {
  let t = 0;
  for (let s = 1; s <= 3; s++) {
    const cs = h.filter((c) => suit(c) === s).map(rankHi);
    if (cs.includes(14)) t += 1;
    if (cs.includes(13) && cs.length >= 2) t += 0.8;
    if (cs.includes(12) && cs.length >= 3) t += 0.4;
    if (cs.length <= 1) t += 0.4; // short suits let spades trump
  }
  const sp = h.filter((c) => suit(c) === SPADE).map(rankHi);
  t += sp.filter((r) => r >= 12).length * 0.9 + Math.max(0, sp.length - 3) * 0.8;
  return Math.max(1, Math.min(13, Math.round(t)));
}

function newRound() {
  const d = deck();
  hands = [0, 1, 2, 3].map((s) => sortHand(d.slice(s * 13, s * 13 + 13)));
  bids = [null, null, null, null]; tricks = [0, 0, 0, 0]; trick = []; broken = false; seen = new Set();
  phase = 'bid';
  turn = (dealer + 1) % 4;
  myBid = Math.max(1, Math.min(13, aiBid(hands[0])));
  draw();
  nextBid();
}
async function nextBid() {
  if (bids.every((b) => b != null)) {
    phase = 'starting';
    turn = (dealer + 1) % 4;
    setStatus('Your team bid ' + teamBid(0) + '. They bid ' + teamBid(1), 'neutral');
    draw();
    await wait(800);
    phase = 'play';
    return nextPlay();
  }
  if (bids[turn] != null) { turn = (turn + 1) % 4; return nextBid(); }
  if (turn === 0) { setStatus('Your bid: how many tricks will you take? North bid ' + (bids[2] ?? '–'), ''); draw(); return; }
  busy = true; draw();
  await wait(500);
  busy = false;
  bids[turn] = aiBid(hands[turn]);
  setStatus(SEAT_NAMES[turn] + ' bids ' + bids[turn], team(turn) ? 'cpu' : '');
  turn = (turn + 1) % 4;
  draw();
  setTimeout(nextBid, 400);
}

async function nextPlay() {
  if (over) return;
  if (turn === 0) { setStatus(trick.length ? 'Your turn: follow suit if you can' : 'Your lead', ''); draw(); return; }
  busy = true; draw();
  await wait(550);
  busy = false;
  playCard(turn, aiPlay(turn));
}

function aiPlay(seat) {
  const opts = legal(seat), lvl = getLevel();
  if (lvl === 'easy' && Math.random() < 0.3) return opts[Math.floor(Math.random() * opts.length)];
  const hi = (a) => a.slice().sort((x, y) => (suit(y) === SPADE) - (suit(x) === SPADE) || rankHi(y) - rankHi(x));
  const lo = (a) => a.slice().sort((x, y) => (suit(x) === SPADE) - (suit(y) === SPADE) || rankHi(x) - rankHi(y));
  const t = team(seat);
  const needMore = teamTricks(t) < teamBid(t);
  if (!trick.length) {
    const aces = opts.filter((c) => suit(c) !== SPADE && rankHi(c) === 14);
    if (aces.length) return aces[0];
    if (broken && lvl === 'hard') { const sp = opts.filter((c) => suit(c) === SPADE && rankHi(c) >= 13); if (sp.length) return sp[0]; }
    return lo(opts)[0];
  }
  const winner = trickWinner(trick, SPADE);
  const winCard = trick.find((p) => p.seat === winner).card;
  const partnerWinning = team(winner) === t;
  const beats = (c) => trickWinner(trick.concat([{ seat, card: c }]), SPADE) === seat;
  const winners = opts.filter(beats);
  if (partnerWinning && (trick.length === 3 || rankHi(winCard) >= 13 || suit(winCard) === SPADE)) return lo(opts)[0];
  if (winners.length && (needMore || lvl === 'easy')) {
    // win as cheaply as possible
    return winners.sort((a, b) => (suit(a) === SPADE) - (suit(b) === SPADE) || rankHi(a) - rankHi(b))[0];
  }
  return lo(opts)[0];
}

async function playCard(seat, c) {
  hands[seat] = hands[seat].filter((x) => x !== c);
  trick.push({ seat, card: c });
  seen.add(c);
  if (suit(c) === SPADE) broken = true;
  play(suit(c) === SPADE && trick.length > 1 && suit(trick[0].card) !== SPADE ? 'capture' : 'card');
  draw();
  if (trick.length < 4) { turn = (turn + 1) % 4; return nextPlay(); }
  busy = true;
  await wait(900);
  const w = trickWinner(trick, SPADE);
  tricks[w]++;
  trick = []; turn = w; busy = false;
  draw();
  if (!hands[0].length) return endRound();
  nextPlay();
}

function endRound() {
  const add = [0, 1].map((t) => {
    const b = teamBid(t), got = teamTricks(t);
    if (got >= b) { bags[t] += got - b; return 10 * b + (got - b); }
    return -10 * b;
  });
  [0, 1].forEach((t) => { if (bags[t] >= 10) { bags[t] -= 10; add[t] -= 100; } });
  totals = totals.map((v, t) => v + add[t]);
  history.push(add);
  const made = teamTricks(0) >= teamBid(0);
  setStatus('Your team ' + (made ? 'made' : 'missed') + ' its bid: ' + (add[0] >= 0 ? '+' : '') + add[0] + '. They scored ' + (add[1] >= 0 ? '+' : '') + add[1], made ? '' : 'cpu');
  play(made ? 'found' : 'lose');
  dealer = (dealer + 1) % 4;
  if ((totals[0] >= GOAL || totals[1] >= GOAL) && totals[0] !== totals[1]) return finish();
  phase = 'between';
  draw();
}

function finish() {
  over = true; phase = 'over';
  draw();
  const won = totals[0] > totals[1];
  score.add(won ? 'win' : 'lose');
  showResult(won ? 'win' : 'lose', won ? 'Your team won!' : 'West and East won', 'You and North ' + totals[0] + ', West and East ' + totals[1] + '.');
  play(won ? 'win' : 'lose', 0.1);
  track('game_end', { game: 'spades', result: won ? 'win' : 'lose' });
}

function newGame() {
  totals = [0, 0]; bags = [0, 0]; dealer = 3; over = false; busy = false; history = [];
  $('result').hidden = true;
  track('game_start', { game: 'spades' });
  newRound();
}

$('area').addEventListener('click', (e) => {
  const c = table.idFrom(e);
  if (c == null || !hands[0].includes(c) || phase !== 'play' || turn !== 0 || busy || over) return;
  if (!legal(0).includes(c)) { shake(table.els().get(c), play); setStatus(trick.length ? 'You must follow suit' : 'Spades aren’t broken yet', 'neutral'); return; }
  playCard(0, c);
});
$('area').addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.pc')) { e.preventDefault(); e.target.click(); } });
$('bid-down').addEventListener('click', () => { myBid = Math.max(1, myBid - 1); draw(); });
$('bid-up').addEventListener('click', () => { myBid = Math.min(13, myBid + 1); draw(); });
$('bid-btn').addEventListener('click', () => {
  if (phase !== 'bid' || turn !== 0) return;
  bids[0] = myBid; play('place');
  turn = 1; draw(); setTimeout(nextBid, 300);
});
$('next-round').addEventListener('click', () => { if (phase === 'between') newRound(); });
$('new-game').addEventListener('click', () => { if (!busy) newGame(); });
$('again').addEventListener('click', newGame);
let raf = 0;
window.addEventListener('resize', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { table.measure(); draw(); }); });
newGame();
void rank;
