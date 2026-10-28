// Snakes and Ladders: race from 1 to 100. Ladders take you up, snakes take you down.
import { store } from './site.js';
import { setStatus, record, showResult } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { makeDie, paintDie, tumble, wait, d6 } from './dice-ui.js';

const $ = (id) => document.getElementById(id);
const score = record('snakes');
// Our own board: ladders go up, snakes go down.
const LADDERS = { 3: 22, 8: 30, 21: 42, 28: 76, 36: 57, 50: 67, 71: 92, 80: 99 };
const SNAKES = { 32: 10, 48: 26, 62: 18, 74: 53, 88: 24, 95: 56, 97: 78, 44: 23 };
const COLOURS = ['#CFAA62', '#EFE6D8', '#5FA39A', '#8FB8E8'];
const OPP_KEY = 'bgs-snakes-opp', N_KEY = 'bgs-snakes-n';

let opp = store.get(OPP_KEY, 'cpu') === 'friend' ? 'friend' : 'cpu';
let n = [2, 3, 4].includes(store.get(N_KEY, 2)) ? store.get(N_KEY, 2) : 2;
let pos, turn, over, busy, started;
const die = makeDie($('sl-die'));
const names = () => Array.from({ length: n }, (_, p) => (opp === 'cpu' ? (p ? 'Computer ' + (n > 2 ? p : '').toString().trim() : 'You') : 'Player ' + (p + 1)).replace(/ $/, ''));
const human = (p) => opp === 'friend' || p === 0;

// square number (1–100) → x, y on a 10×10 grid, snaking back and forth from the bottom left
function xy(sq) {
  const i = sq - 1, row = Math.floor(i / 10), col = row % 2 ? 9 - (i % 10) : i % 10;
  return [col * 10 + 5, (9 - row) * 10 + 5];
}

function drawBoard() {
  const svg = $('sl-board');
  let h = '';
  for (let sq = 1; sq <= 100; sq++) {
    const [x, y] = xy(sq);
    const dark = (Math.floor((sq - 1) / 10) + (sq - 1) % 10) % 2;
    h += '<rect x="' + (x - 5) + '" y="' + (y - 5) + '" width="10" height="10" class="' + (dark ? 'sq2' : 'sq1') + '"/>';
    h += '<text x="' + (x - 4.2) + '" y="' + (y - 2.2) + '" class="num">' + sq + '</text>';
  }
  for (const [a, b] of Object.entries(LADDERS)) {
    const [x1, y1] = xy(+a), [x2, y2] = xy(b);
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy), ox = -dy / len * 1.6, oy = dx / len * 1.6;
    h += '<g class="ladder"><line x1="' + (x1 + ox) + '" y1="' + (y1 + oy) + '" x2="' + (x2 + ox) + '" y2="' + (y2 + oy) + '"/><line x1="' + (x1 - ox) + '" y1="' + (y1 - oy) + '" x2="' + (x2 - ox) + '" y2="' + (y2 - oy) + '"/>';
    for (let t = 0.12; t < 1; t += 0.12) h += '<line class="rung" x1="' + (x1 + dx * t + ox) + '" y1="' + (y1 + dy * t + oy) + '" x2="' + (x1 + dx * t - ox) + '" y2="' + (y1 + dy * t - oy) + '"/>';
    h += '</g>';
  }
  for (const [a, b] of Object.entries(SNAKES)) {
    const [x1, y1] = xy(+a), [x2, y2] = xy(b);
    const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, dx = x2 - x1, dy = y2 - y1;
    const c1x = mx - dy * 0.25 + dx * -0.15, c1y = my + dx * 0.25, c2x = mx + dy * 0.25, c2y = my - dx * 0.25 + dy * 0.15;
    const d = 'M' + x1 + ' ' + y1 + ' C' + c1x + ' ' + c1y + ' ' + c2x + ' ' + c2y + ' ' + x2 + ' ' + y2;
    h += '<g class="snake"><path class="body" d="' + d + '"/><path class="stripe" d="' + d + '"/><circle cx="' + x1 + '" cy="' + y1 + '" r="2.3"/><circle class="eye" cx="' + (x1 - 0.7) + '" cy="' + (y1 - 0.6) + '" r=".45"/><circle class="eye" cx="' + (x1 + 0.7) + '" cy="' + (y1 - 0.6) + '" r=".45"/></g>';
  }
  h += '<g id="sl-tokens"></g>';
  svg.innerHTML = h;
}

function drawTokens() {
  const g = document.getElementById('sl-tokens');
  g.innerHTML = pos.map((sq, p) => {
    if (!sq) return '';
    const [x, y] = xy(sq);
    const same = pos.map((s, q) => (s === sq ? q : -1)).filter((q) => q >= 0);
    const k = same.indexOf(p), off = same.length > 1 ? (k - (same.length - 1) / 2) * 2.4 : 0;
    return '<circle class="tok' + (p === turn && !over ? ' now' : '') + '" cx="' + (x + off) + '" cy="' + (y + 1.2) + '" r="2.4" fill="' + COLOURS[p] + '"/>';
  }).join('');
  const list = $('sl-players');
  list.innerHTML = names().map((nm, p) => '<p class="' + (p === turn && !over ? 'now' : '') + '"><i style="background:' + COLOURS[p] + '"></i><b>' + nm + '</b><span>' + (pos[p] ? 'Square ' + pos[p] : 'Start') + '</span></p>').join('');
  $('roll').disabled = over || busy || !human(turn);
}

async function step(p, to) {
  const from = pos[p];
  const dir = to > from ? 1 : -1;
  for (let s = from + dir; dir > 0 ? s <= to : s >= to; s += dir) {
    pos[p] = s; drawTokens(); play('select'); await wait(140);
  }
}

async function roll() {
  if (over || busy) return;
  if (!started) { started = true; track('game_start', { game: 'snakes-and-ladders', players: n, opponent: opp }); }
  busy = true;
  drawTokens();
  const p = turn, v = d6();
  await tumble((vv) => paintDie(die, vv[0], { p2: false }), [0], [v]);
  paintDie(die, v);
  const nm = names()[p];
  let target = pos[p] + v;
  if (target > 100) {
    // need the exact number to finish: bounce back off 100
    await step(p, 100);
    target = 200 - target;
    await step(p, target);
  } else await step(p, target);
  if (LADDERS[pos[p]]) {
    setStatus(nm + ' climbed a ladder!', p && opp === 'cpu' ? 'cpu' : '');
    play('king'); await wait(300);
    pos[p] = LADDERS[pos[p]]; drawTokens(); await wait(400);
  } else if (SNAKES[pos[p]]) {
    setStatus('Oh no! ' + nm + ' slid down a snake', p && opp === 'cpu' ? 'cpu' : 'neutral');
    play('error'); await wait(300);
    pos[p] = SNAKES[pos[p]]; drawTokens(); await wait(400);
  } else setStatus(nm + ' rolled ' + v, p && opp === 'cpu' ? 'cpu' : '');
  if (pos[p] === 100) { busy = false; return finish(p); }
  // a 6 earns another roll
  if (v !== 6) turn = (turn + 1) % n;
  else setStatus(nm + ' rolled a 6: roll again!', p && opp === 'cpu' ? 'cpu' : '');
  busy = false;
  drawTokens();
  if (!human(turn)) { await wait(700); roll(); }
  else if (opp === 'friend' || v !== 6) setStatus((human(turn) && opp === 'cpu' ? 'Your' : names()[turn] + '’s') + ' turn: roll', '');
}

function finish(p) {
  over = true;
  drawTokens();
  const nm = names()[p];
  if (opp === 'cpu') {
    const res = p === 0 ? 'win' : 'lose';
    score.add(res);
    showResult(res, p === 0 ? 'You won!' : nm + ' won', p === 0 ? 'First to square 100.' : 'You reached square ' + pos[0] + '.');
    play(p === 0 ? 'win' : 'lose', 0.1);
    track('game_end', { game: 'snakes-and-ladders', result: res });
  } else {
    showResult('win', nm + ' wins!', 'First to square 100.');
    play('win', 0.1);
  }
  setStatus(nm + (p === 0 && opp === 'cpu' ? ' win!' : ' wins!'));
}

function newGame() {
  pos = new Array(n).fill(1); turn = 0; over = false; busy = false; started = false;
  $('result').hidden = true;
  paintDie(die, 0);
  drawTokens();
  setStatus((opp === 'cpu' ? 'Your' : 'Player 1’s') + ' turn: roll', '');
}
function paintSegs() {
  document.querySelectorAll('[data-sopp]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.sopp === opp)));
  document.querySelectorAll('[data-sn]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.sn) === n)));
}
document.querySelectorAll('[data-sopp]').forEach((b) => b.addEventListener('click', () => { if (busy) return; opp = b.dataset.sopp; store.set(OPP_KEY, opp); paintSegs(); newGame(); }));
document.querySelectorAll('[data-sn]').forEach((b) => b.addEventListener('click', () => { if (busy) return; n = Number(b.dataset.sn); store.set(N_KEY, n); paintSegs(); newGame(); }));
$('roll').addEventListener('click', () => { if (human(turn)) roll(); });
document.addEventListener('keydown', (e) => { if ((e.key === 'r' || e.key === ' ') && !e.target.closest?.('button, input')) { e.preventDefault(); if (human(turn)) roll(); } });
$('new-game').addEventListener('click', () => { if (!busy) newGame(); });
$('again').addEventListener('click', newGame);
drawBoard();
paintSegs();
newGame();
