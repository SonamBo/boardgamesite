// Hearts: avoid taking hearts (1 point each) and the Queen of spades (13). Or take them all to shoot the moon.
// You against three computer players; the game ends when someone reaches 100, and the lowest score wins.
import { setStatus, levelSwitch, record, showResult } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { shake } from './solo.js';
import { deck, suit, rank, short } from './cards.js';
import { TrickTable, sortHand, trickWinner, rankHi, SEAT_NAMES } from './tricks.js';
import { wait } from './dice-ui.js';

const $ = (id) => document.getElementById(id);
const QS = 11; // queen of spades: suit 0, rank 12 → id 11
const TWO_C = 3 * 13 + 1;
const GOAL = 100;
const score = record('hearts');
const getLevel = levelSwitch('hearts', () => {});
const table = new TrickTable($('area'));
const PASS_DIR = ['left', 'right', 'across', 'none'];

let hands, totals, roundPts, round, phase, trick, leader, turn, broken, picked, seen, busy, over, firstTrick, history;

const pts = (c) => (suit(c) === 1 ? 1 : c === QS ? 13 : 0);
function legal(seat) {
  const h = hands[seat];
  if (trick.length) {
    const led = suit(trick[0].card);
    const follow = h.filter((c) => suit(c) === led);
    if (follow.length) return follow;
    if (firstTrick) { const safe = h.filter((c) => !pts(c)); if (safe.length) return safe; }
    return h;
  }
  if (firstTrick) return h.includes(TWO_C) ? [TWO_C] : h;
  if (!broken) { const nh = h.filter((c) => suit(c) !== 1); if (nh.length) return nh; }
  return h;
}

function draw() {
  const lg = phase === 'play' && turn === 0 && !busy ? new Set(legal(0)) : phase === 'pass' ? new Set(hands[0]) : new Set();
  table.draw({
    hands, trick, legal: lg, picked, active: (phase === 'play' && turn === 0 && !busy) || phase === 'pass',
    labels: SEAT_NAMES.map((n, s) => n + ' · ' + totals[s] + (roundPts[s] ? ' (+' + roundPts[s] + ')' : '')),
    turn: phase === 'play' ? turn : -1,
    winning: trick.length ? trickWinner(trick) : -1
  });
  $('pass-btn').hidden = phase !== 'pass';
  $('pass-btn').disabled = picked.size !== 3;
  $('pass-btn').textContent = picked.size === 3 ? 'Pass these 3 ' + PASS_DIR[(round - 1) % 4] : 'Pick 3 cards to pass ' + PASS_DIR[(round - 1) % 4];
  const body = $('score-body');
  body.innerHTML = history.map((r, i) => '<tr><td>' + (i + 1) + '</td>' + r.map((v) => '<td>' + v + '</td>').join('') + '</tr>').join('');
  $('score-foot').innerHTML = '<td>Total</td>' + totals.map((v) => '<td>' + v + '</td>').join('');
}

function newRound() {
  const d = deck();
  hands = [0, 1, 2, 3].map((s) => sortHand(d.slice(s * 13, s * 13 + 13)));
  roundPts = [0, 0, 0, 0]; trick = []; broken = false; picked = new Set(); seen = new Set(); firstTrick = true;
  const dir = PASS_DIR[(round - 1) % 4];
  if (dir === 'none') { phase = 'play'; startPlay(); }
  else { phase = 'pass'; setStatus('Round ' + round + ': pick 3 cards to pass ' + dir, ''); draw(); }
}

// computer passing: the dangerous spades, then high hearts, then high cards, emptying a short suit if it can
function aiPass(h) {
  const out = [];
  const spades = h.filter((c) => suit(c) === 0);
  for (const c of [QS, 0, 12]) if (h.includes(c) && spades.length < 5) out.push(c); // Q, A, K of spades
  const byHigh = h.slice().sort((a, b) => rankHi(b) - rankHi(a));
  for (const s of [3, 2]) { const cs = h.filter((c) => suit(c) === s); if (cs.length && cs.length <= 3 - out.length) cs.forEach((c) => out.includes(c) || out.push(c)); }
  for (const c of byHigh.filter((c) => suit(c) === 1)) if (out.length < 3 && !out.includes(c) && rankHi(c) >= 10) out.push(c);
  for (const c of byHigh) if (out.length < 3 && !out.includes(c)) out.push(c);
  return out.slice(0, 3);
}
function doPass() {
  const dir = PASS_DIR[(round - 1) % 4];
  const off = dir === 'left' ? 1 : dir === 'right' ? 3 : 2;
  const gives = [0, 1, 2, 3].map((s) => (s === 0 ? [...picked] : aiPass(hands[s])));
  gives.forEach((g, s) => { hands[s] = hands[s].filter((c) => !g.includes(c)); });
  gives.forEach((g, s) => { const to = (s + off) % 4; hands[to] = sortHand(hands[to].concat(g)); });
  const got = gives[(4 - off) % 4];
  picked = new Set(got);
  play('shuffle');
  phase = 'passed';
  setStatus('You received ' + got.map(short).join(', '), 'neutral');
  draw();
  setTimeout(() => { picked = new Set(); startPlay(); }, 1600);
}

function startPlay() {
  phase = 'play';
  leader = hands.findIndex((h) => h.includes(TWO_C));
  turn = leader;
  draw();
  next();
}

async function next() {
  if (over) return;
  if (turn === 0) { setStatus(trick.length ? 'Your turn: follow suit if you can' : firstTrick ? 'Lead the 2 of clubs' : 'Your lead', ''); draw(); return; }
  busy = true; draw();
  await wait(550);
  busy = false;
  playCard(turn, aiPlay(turn));
}

// The computer: duck under the winning card when it can, dump points when it can't follow.
function aiPlay(seat) {
  const opts = legal(seat);
  const lvl = getLevel();
  if (lvl === 'easy' && Math.random() < 0.35) return opts[Math.floor(Math.random() * opts.length)];
  const hi = (a) => a.slice().sort((x, y) => rankHi(y) - rankHi(x));
  const lo = (a) => hi(a).reverse();
  if (!trick.length) {
    // lead low from the suit where we're safest; avoid leading spades while the queen is out and we hold high spades
    const qOut = !seen.has(QS) && !hands[seat].includes(QS);
    const pool = opts.filter((c) => !(suit(c) === 0 && qOut && rankHi(c) >= 12) && c !== QS);
    return lo(pool.length ? pool : opts)[0];
  }
  const led = suit(trick[0].card);
  const following = suit(opts[0]) === led && opts.every((c) => suit(c) === led);
  const win = trick.reduce((b, p) => (suit(p.card) === led && rankHi(p.card) > rankHi(b) ? p.card : b), trick[0].card);
  const trickPts = trick.reduce((a, p) => a + pts(p.card), 0);
  if (following) {
    const under = opts.filter((c) => rankHi(c) < rankHi(win));
    if (under.length) return hi(under)[0];
    // must win: if last to play and nothing nasty, win big; else win as low as we can
    if (trick.length === 3 && trickPts === 0) return hi(opts.filter((c) => c !== QS))[0] ?? hi(opts)[0];
    return lo(opts.filter((c) => c !== QS))[0] ?? opts[0];
  }
  // can't follow: dump the queen, then high hearts, then the highest card
  if (opts.includes(QS)) return QS;
  const hearts = hi(opts.filter((c) => suit(c) === 1));
  if (hearts.length && lvl !== 'easy') return hearts[0];
  return hi(opts)[0];
}

async function playCard(seat, c) {
  hands[seat] = hands[seat].filter((x) => x !== c);
  trick.push({ seat, card: c });
  seen.add(c);
  if (suit(c) === 1) broken = true;
  play(c === QS ? 'error' : 'card');
  draw();
  if (trick.length < 4) { turn = (turn + 1) % 4; return next(); }
  busy = true;
  await wait(900);
  const w = trickWinner(trick);
  const p = trick.reduce((a, x) => a + pts(x.card), 0);
  roundPts[w] += p;
  if (p) setStatus((w === 0 ? 'You take ' : SEAT_NAMES[w] + ' takes ') + p + (p === 1 ? ' point' : ' points'), w === 0 ? 'cpu' : 'neutral');
  trick = []; firstTrick = false; turn = w; busy = false;
  draw();
  if (!hands[0].length) return endRound();
  next();
}

function endRound() {
  let add = roundPts.slice();
  const moon = add.findIndex((v) => v === 26);
  if (moon >= 0) { add = add.map((v, s) => (s === moon ? 0 : 26)); setStatus((moon === 0 ? 'You shot' : SEAT_NAMES[moon] + ' shot') + ' the moon!', moon === 0 ? '' : 'cpu'); play('king'); }
  totals = totals.map((t, s) => t + add[s]);
  history.push(add);
  roundPts = [0, 0, 0, 0];
  draw();
  if (Math.max(...totals) >= GOAL) return finish();
  round++;
  phase = 'between';
  $('next-round').hidden = false;
  if (moon < 0) setStatus('Round over. You took ' + add[0] + (add[0] === 1 ? ' point' : ' points'), add[0] ? 'neutral' : '');
}

function finish() {
  over = true;
  const low = Math.min(...totals);
  const won = totals[0] === low;
  score.add(won ? 'win' : 'lose');
  const order = [0, 1, 2, 3].sort((a, b) => totals[a] - totals[b]);
  showResult(won ? 'win' : 'lose', won ? 'You won!' : SEAT_NAMES[order[0]] + ' won', 'Final scores: ' + order.map((s) => SEAT_NAMES[s] + ' ' + totals[s]).join(', ') + '.');
  setStatus(won ? 'You won with ' + totals[0] + '!' : 'Game over', won ? '' : 'cpu');
  play(won ? 'win' : 'lose', 0.1);
  track('game_end', { game: 'hearts', result: won ? 'win' : 'lose' });
}

function newGame() {
  totals = [0, 0, 0, 0]; round = 1; over = false; busy = false; history = [];
  $('result').hidden = true; $('next-round').hidden = true;
  track('game_start', { game: 'hearts' });
  newRound();
}

$('area').addEventListener('click', (e) => {
  const c = table.idFrom(e);
  if (c == null || !hands[0].includes(c)) return;
  if (phase === 'pass') {
    if (picked.has(c)) picked.delete(c); else if (picked.size < 3) picked.add(c); else return shake(table.els().get(c), play);
    play('select'); return draw();
  }
  if (phase !== 'play' || turn !== 0 || busy || over) return;
  if (!legal(0).includes(c)) {
    shake(table.els().get(c), play);
    setStatus(firstTrick && !trick.length ? 'The 2 of clubs leads the first trick' : trick.length ? 'You must follow suit' : 'Hearts aren’t broken yet', 'neutral');
    return;
  }
  playCard(0, c);
});
$('area').addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.pc')) { e.preventDefault(); e.target.click(); } });
$('pass-btn').addEventListener('click', () => { if (picked.size === 3 && phase === 'pass') doPass(); });
$('next-round').addEventListener('click', () => { $('next-round').hidden = true; newRound(); });
$('new-game').addEventListener('click', () => { if (!busy) newGame(); });
$('again').addEventListener('click', newGame);
let raf = 0;
window.addEventListener('resize', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { table.measure(); draw(); }); });
newGame();
