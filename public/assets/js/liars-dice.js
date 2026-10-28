// Liar's Dice: everyone rolls in secret, then bids on how many of a number are on the whole table.
// Ones are wild. Call "Liar!" on a bid you don't believe. Lose a challenge, lose a die. Last player with dice wins.
import { store } from './site.js';
import { setStatus, levelSwitch, record, showResult } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { shake } from './solo.js';
import { makeDie, paintDie, wait, d6 } from './dice-ui.js';

const $ = (id) => document.getElementById(id);
const score = record('liars');
const getLevel = levelSwitch('liars', () => newGame());
const SEATS_KEY = 'bgs-liars-seats';
const NAMES = ['You', 'Rosa', 'Otto', 'Mei'];

let seats = [2, 3].includes(store.get(SEATS_KEY, 3)) ? store.get(SEATS_KEY, 3) : 3; // computer players
let counts, hands, turn, bid, log, over, busy, revealed, started, qty, face;

const myDice = [0, 1, 2, 3, 4].map(() => makeDie($('ld-mine')));
const alive = () => counts.map((n, p) => (n > 0 ? p : -1)).filter((p) => p >= 0);
const totalDice = () => counts.reduce((a, b) => a + b, 0);
const nextAlive = (p) => { let q = p; do { q = (q + 1) % counts.length; } while (counts[q] === 0); return q; };
const higher = (a, b) => !b || a.q > b.q || (a.q === b.q && a.f > b.f);
const countOf = (f) => hands.flat().filter((v) => v === f || v === 1).length;

// Chance that at least k of n unknown dice show face f (with 1s wild, p = 1/3).
function atLeast(k, n) {
  if (k <= 0) return 1;
  if (k > n) return 0;
  let p = 0, c = 1;
  for (let i = 0; i <= n; i++) {
    if (i > 0) c = c * (n - i + 1) / i;
    if (i >= k) p += c * Math.pow(1 / 3, i) * Math.pow(2 / 3, n - i);
  }
  return p;
}

function render() {
  hands[0].forEach((v, j) => { paintDie(myDice[j], v); myDice[j].hidden = false; });
  myDice.forEach((el, j) => { el.hidden = j >= counts[0]; });
  const box = $('ld-seats');
  box.textContent = '';
  for (let p = 1; p < counts.length; p++) {
    const s = document.createElement('div');
    s.className = 'ld-seat' + (turn === p && !over && !revealed ? ' now' : '') + (counts[p] === 0 ? ' out' : '');
    let dice = '';
    for (let j = 0; j < counts[p]; j++) {
      const v = revealed ? hands[p][j] : 0;
      dice += '<i class="' + (revealed && bid && (v === bid.f || v === 1) ? 'hit' : '') + '">' + (v || '') + '</i>';
    }
    s.innerHTML = '<b>' + NAMES[p] + '</b><span class="cup">' + (counts[p] ? dice : 'Out') + '</span>';
    box.appendChild(s);
  }
  $('ld-total').textContent = String(totalDice());
  $('ld-bid').innerHTML = bid ? '<b>' + bid.q + '</b> × <span class="pip">' + bid.f + '</span><small>by ' + NAMES[bid.by] + '</small>' : '<small>No bid yet</small>';
  const mine = turn === 0 && !over && !busy && !revealed && counts[0] > 0;
  $('qty').textContent = String(qty);
  document.querySelectorAll('[data-face]').forEach((b) => { b.setAttribute('aria-pressed', String(Number(b.dataset.face) === face)); b.disabled = !mine; });
  $('q-down').disabled = !mine; $('q-up').disabled = !mine;
  $('do-bid').disabled = !mine || !higher({ q: qty, f: face }, bid);
  $('do-liar').disabled = !mine || !bid;
  const lg = $('ld-log');
  lg.innerHTML = log.slice(-6).map((l) => '<li>' + l + '</li>').join('');
}

function minBid() {
  if (!bid) return { q: 1, f: 2 };
  return bid.f < 6 ? { q: bid.q, f: bid.f + 1 } : { q: bid.q + 1, f: 2 };
}

function makeBid(p, q, f) {
  bid = { q, f, by: p };
  log.push(NAMES[p] + ': ' + q + ' × ' + f + (q === 1 ? '' : 's'));
  play('place');
  turn = nextAlive(p);
  if (turn === 0) { const m = minBid(); qty = Math.max(qty, m.q); face = bid.q === qty ? Math.max(face, m.f) : face; if (!higher({ q: qty, f: face }, bid)) { qty = m.q; face = m.f; } }
  render();
  setStatus(NAMES[p] + ' bid ' + q + ' × ' + f + '. ' + (turn === 0 ? 'Raise or call Liar!' : NAMES[turn] + ' is thinking'), p ? 'cpu' : '');
  if (turn !== 0) cpuTurn();
}

async function callLiar(p) {
  busy = true;
  const target = bid.by;
  log.push(NAMES[p] + ': Liar!');
  setStatus(NAMES[p] + ' calls ' + NAMES[target] + ' a liar!', 'cpu');
  play('error');
  revealed = true;
  render();
  await wait(900);
  const actual = countOf(bid.f);
  const bidderRight = actual >= bid.q;
  const loser = bidderRight ? p : target;
  counts[loser]--;
  log.push('There were ' + actual + ' × ' + bid.f + '. ' + NAMES[loser] + (loser === 0 ? ' lose' : ' loses') + ' a die');
  setStatus('There were ' + actual + ' (with 1s). ' + (loser === 0 ? 'You lose' : NAMES[loser] + ' loses') + ' a die', loser === 0 ? 'cpu' : '');
  play(loser === 0 ? 'lose' : 'capture');
  render();
  await wait(2300);
  busy = false;
  if (counts[0] === 0) return finish(false);
  if (alive().length === 1) return finish(true);
  newRound(counts[loser] > 0 ? loser : nextAlive(loser));
}

// The computer weighs the bid against what it can see and what's likely in the cups it can't.
async function cpuTurn() {
  busy = true;
  render();
  await wait(900 + Math.random() * 700);
  busy = false;
  if (over) return;
  const p = turn, lvl = getLevel();
  const mine = hands[p];
  const unknown = totalDice() - counts[p];
  const have = (f) => mine.filter((v) => v === f || v === 1).length;
  const chance = (b) => atLeast(b.q - have(b.f), unknown);
  if (bid) {
    const c = chance(bid);
    const doubt = lvl === 'easy' ? 0.25 + Math.random() * 0.25 : lvl === 'medium' ? 0.4 : 0.48;
    if (c < doubt) return callLiar(p);
  }
  // raise: the face it holds most of, at the lowest legal quantity, sometimes a little bluff
  const faces = [2, 3, 4, 5, 6].sort((a, b) => have(b) - have(a) || b - a);
  let pick = null;
  for (const f of faces) {
    let q = bid ? (f > bid.f ? bid.q : bid.q + 1) : Math.max(1, Math.round(have(f) + unknown / 3 - (lvl === 'hard' ? 1 : 0)));
    if (lvl === 'easy' && Math.random() < 0.3) q++;
    const b = { q, f };
    if (!higher(b, bid)) continue;
    const c = chance(b);
    if (!pick || c > pick.c) pick = { ...b, c };
  }
  if (!pick || (bid && pick.c < 0.3 && lvl !== 'easy')) return callLiar(p);
  makeBid(p, pick.q, pick.f);
}

function newRound(start) {
  hands = counts.map((n) => Array.from({ length: n }, d6).sort());
  bid = null; revealed = false; turn = start;
  qty = 1; face = 2;
  log.push('New round: ' + totalDice() + ' dice on the table');
  if (started) play('shuffle');
  render();
  setStatus(turn === 0 ? 'Your bid to open the round' : NAMES[turn] + ' opens the bidding', turn ? 'cpu' : '');
  if (turn !== 0) cpuTurn();
}

function finish(won) {
  over = true; revealed = true;
  render();
  score.add(won ? 'win' : 'lose');
  showResult(won ? 'win' : 'lose', won ? 'You won!' : 'You’re out of dice', won ? 'You’re the last player with dice.' : 'Better luck next time. Bluff a little more, or call a little sooner.');
  setStatus(won ? 'You won!' : 'You’re out', won ? '' : 'cpu');
  play(won ? 'win' : 'lose', 0.1);
  track('game_end', { game: 'liars-dice', result: won ? 'win' : 'lose' });
}

function newGame() {
  counts = new Array(seats + 1).fill(5); log = []; over = false; busy = false; started = false;
  $('result').hidden = true;
  newRound(0);
}

document.querySelectorAll('[data-face]').forEach((b) => b.addEventListener('click', () => { face = Number(b.dataset.face); play('select'); render(); }));
$('q-down').addEventListener('click', () => { qty = Math.max(1, qty - 1); render(); });
$('q-up').addEventListener('click', () => { qty = Math.min(totalDice(), qty + 1); render(); });
$('do-bid').addEventListener('click', () => {
  if (turn !== 0 || busy || over) return;
  if (!higher({ q: qty, f: face }, bid)) { shake($('ld-controls'), play); return; }
  if (!started) { started = true; track('game_start', { game: 'liars-dice', seats }); }
  makeBid(0, qty, face);
});
$('do-liar').addEventListener('click', () => { if (turn === 0 && bid && !busy && !over) callLiar(0); });
document.querySelectorAll('[data-seats]').forEach((b) => {
  b.setAttribute('aria-pressed', String(Number(b.dataset.seats) === seats));
  b.addEventListener('click', () => {
    seats = Number(b.dataset.seats); store.set(SEATS_KEY, seats);
    document.querySelectorAll('[data-seats]').forEach((x) => x.setAttribute('aria-pressed', String(Number(x.dataset.seats) === seats)));
    newGame();
  });
});
$('new-game').addEventListener('click', () => { if (!busy) newGame(); });
$('again').addEventListener('click', newGame);
newGame();
