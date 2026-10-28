// Ludo: race your four counters round the board and into your home. Roll a 6 to bring a counter out.
// Land on an opponent to send them back to base (not on the starred safe squares).
import { store } from './site.js';
import { setStatus, record, showResult } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { makeDie, paintDie, tumble, wait, d6 } from './dice-ui.js';

const $ = (id) => document.getElementById(id);
const score = record('ludo');
const OPP_KEY = 'bgs-ludo-opp', N_KEY = 'bgs-ludo-n';
let opp = store.get(OPP_KEY, 'cpu') === 'friend' ? 'friend' : 'cpu';
let n = store.get(N_KEY, 4) === 2 ? 2 : 4;

// The 52-square track, clockwise, starting at red's first square.
const TRACK = [];
const run = (r, c, dr, dc, k) => { for (let i = 0; i < k; i++) TRACK.push([r + dr * i, c + dc * i]); };
run(6, 1, 0, 1, 5); run(5, 6, -1, 0, 6); run(0, 7, 0, 1, 2); run(1, 8, 1, 0, 5); run(6, 9, 0, 1, 6); run(7, 14, 1, 0, 2);
run(8, 13, 0, -1, 5); run(9, 8, 1, 0, 6); run(14, 7, 0, -1, 2); run(13, 6, -1, 0, 5); run(8, 5, 0, -1, 6); run(7, 0, -1, 0, 2);
const COLOURS = [
  { name: 'Red', fill: '#B0405F', light: '#E8B7C4', start: 0, home: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]], base: [1, 1] },
  { name: 'Green', fill: '#4E9A8F', light: '#B6DCD6', start: 13, home: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]], base: [1, 10] },
  { name: 'Yellow', fill: '#CFAA62', light: '#F0DEB4', start: 26, home: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]], base: [10, 10] },
  { name: 'Blue', fill: '#5B83B5', light: '#BFD0E6', start: 39, home: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]], base: [10, 1] }
];
const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
const END = 56; // 0–50 track, 51–55 home column, 56 home

let seats, tokens, turn, rolled, sixes, over, busy, started, place;
const die = makeDie($('lu-die'));
const human = (s) => opp === 'friend' || s === 0;
const label = (s) => (opp === 'cpu' ? (s === 0 ? 'You' : COLOURS[seats[s]].name) : COLOURS[seats[s]].name);

function cellOf(c, p, k) {
  const col = COLOURS[c];
  if (p < 0) { const [r0, c0] = col.base; return [r0 + 1 + Math.floor(k / 2) * 2, c0 + 1 + (k % 2) * 2]; }
  if (p <= 50) return TRACK[(col.start + p) % 52];
  if (p <= 55) return col.home[p - 51];
  return [7, 7];
}

function drawBoard() {
  let h = '';
  const cell = (r, c, fill, cls = '') => { h += '<rect x="' + c * 10 + '" y="' + r * 10 + '" width="10" height="10" fill="' + fill + '" class="' + cls + '"/>'; };
  for (let r = 0; r < 15; r++) for (let c = 0; c < 15; c++) if ((r >= 6 && r <= 8) || (c >= 6 && c <= 8)) cell(r, c, '#F7F0E4', 'trk');
  COLOURS.forEach((col, ci) => {
    const [r0, c0] = col.base;
    const x = (c0 - 1) * 10, y = (r0 - 1) * 10;
    h += '<rect x="' + x + '" y="' + y + '" width="60" height="60" fill="' + col.fill + '"/>';
    h += '<rect x="' + (x + 8) + '" y="' + (y + 8) + '" width="44" height="44" rx="6" fill="#F7F0E4"/>';
    for (let k = 0; k < 4; k++) { const [rr, cc] = cellOf(ci, -1, k); h += '<circle cx="' + (cc * 10 + 5) + '" cy="' + (rr * 10 + 5) + '" r="6.5" fill="' + col.light + '"/>'; }
    col.home.forEach(([r, c]) => cell(r, c, col.light));
    const [sr, sc] = TRACK[col.start];
    cell(sr, sc, col.light);
  });
  for (const i of SAFE) { const [r, c] = TRACK[i]; h += '<text x="' + (c * 10 + 5) + '" y="' + (r * 10 + 7.6) + '" class="star">★</text>'; }
  // centre home triangles
  h += '<polygon points="60,60 75,75 60,90" fill="' + COLOURS[0].fill + '"/><polygon points="60,60 75,75 90,60" fill="' + COLOURS[1].fill + '"/>';
  h += '<polygon points="90,60 75,75 90,90" fill="' + COLOURS[2].fill + '"/><polygon points="60,90 75,75 90,90" fill="' + COLOURS[3].fill + '"/>';
  for (let r = 0; r <= 15; r++) h += '';
  h += '<g id="lu-tokens"></g>';
  $('lu-board').innerHTML = h;
}

function movable(s, v) {
  return tokens[s].map((p, k) => {
    if (p === END) return -1;
    if (p < 0) return v === 6 ? k : -1;
    return p + v <= END ? k : -1;
  }).filter((k) => k >= 0);
}

function drawTokens() {
  const g = document.getElementById('lu-tokens');
  const can = rolled && human(turn) && !busy && !over ? movable(turn, rolled) : [];
  // group counters that share a square
  const at = new Map();
  seats.forEach((c, s) => tokens[s].forEach((p, k) => {
    const [r, cc] = cellOf(c, p, k);
    const key = r * 15 + cc;
    if (!at.has(key)) at.set(key, []);
    at.get(key).push([s, k]);
  }));
  let h = '';
  for (const [key, list] of at) {
    const r = Math.floor(key / 15), c = key % 15;
    list.forEach(([s, k], idx) => {
      const off = list.length > 1 ? (idx - (list.length - 1) / 2) * 2.6 : 0;
      const live = s === turn && can.includes(k);
      h += '<g class="tok' + (live ? ' can' : '') + '" data-s="' + s + '" data-k="' + k + '" role="button" tabindex="' + (live ? 0 : -1) + '" aria-label="' + COLOURS[seats[s]].name + ' counter ' + (k + 1) + '">' +
        '<circle cx="' + (c * 10 + 5 + off) + '" cy="' + (r * 10 + 5) + '" r="3.6" fill="' + COLOURS[seats[s]].fill + '"/>' +
        '<circle cx="' + (c * 10 + 5 + off) + '" cy="' + (r * 10 + 5) + '" r="1.5" fill="#fff" opacity=".55"/></g>';
    });
  }
  g.innerHTML = h;
  $('roll').disabled = over || busy || !human(turn) || !!rolled;
  $('lu-players').innerHTML = seats.map((c, s) => '<p class="' + (s === turn && !over ? 'now' : '') + '"><i style="background:' + COLOURS[c].fill + '"></i><b>' + label(s) + '</b><span>' + tokens[s].filter((p) => p === END).length + ' / 4 home</span></p>').join('');
  paintDie(die, rolled || 0);
}

async function roll() {
  if (over || busy || rolled) return;
  if (!started) { started = true; track('game_start', { game: 'ludo', players: n, opponent: opp }); }
  busy = true;
  const v = d6();
  await tumble((vv) => paintDie(die, vv[0]), [0], [v]);
  rolled = v;
  busy = false;
  sixes = v === 6 ? sixes + 1 : 0;
  const can = movable(turn, v);
  if (sixes === 3) { setStatus(label(turn) + ' rolled three 6s in a row: turn over', 'neutral'); await wait(1000); return endTurn(true); }
  if (!can.length) {
    setStatus(label(turn) + ' rolled ' + v + (tokens[turn].every((p) => p < 0) ? '. Need a 6 to start' : '. No move'), 'neutral');
    drawTokens();
    await wait(1000);
    return endTurn(true);
  }
  if (!human(turn)) { drawTokens(); await wait(500); return move(cpuPick(can, v)); }
  if (can.length === 1 && (tokens[turn][can[0]] >= 0 || tokens[turn].filter((p) => p < 0).length === 1)) { drawTokens(); await wait(250); return move(can[0]); }
  setStatus(label(turn) + ' rolled ' + v + ': pick a counter to move', '');
  drawTokens();
}

async function move(k) {
  const s = turn, v = rolled, c = seats[s];
  busy = true;
  let p = tokens[s][k];
  if (p < 0) { tokens[s][k] = 0; play('place'); drawTokens(); await wait(200); }
  else {
    for (let i = 0; i < v; i++) { tokens[s][k]++; play('select'); drawTokens(); await wait(120); }
  }
  p = tokens[s][k];
  let captured = false;
  if (p <= 50) {
    const sq = (COLOURS[c].start + p) % 52;
    if (!SAFE.has(sq)) {
      seats.forEach((oc, os) => {
        if (os === s) return;
        tokens[os].forEach((op, ok) => {
          if (op >= 0 && op <= 50 && (COLOURS[oc].start + op) % 52 === sq) { tokens[os][ok] = -1; captured = true; }
        });
      });
    }
  }
  if (captured) { play('capture'); setStatus(label(s) + ' sent a counter back to base!', s && opp === 'cpu' ? 'cpu' : ''); }
  if (p === END) { play('king'); setStatus(label(s) + ' got a counter home!', ''); }
  busy = false;
  drawTokens();
  if (tokens[s].every((x) => x === END)) return finish(s);
  await wait(captured || p === END ? 700 : 250);
  endTurn(v !== 6 && !captured && p !== END);
}

function endTurn(pass) {
  rolled = 0;
  if (pass) { turn = (turn + 1) % seats.length; sixes = 0; }
  drawTokens();
  if (over) return;
  if (!human(turn)) { setStatus(label(turn) + '’s turn', 'cpu'); setTimeout(roll, 700); }
  else setStatus((opp === 'cpu' ? 'Your' : label(turn) + '’s') + (pass ? ' turn: roll' : ' extra roll!'), '');
}

// The computer: capture if it can, then get home, then bring a counter out, then stay safe, then move the leader.
function cpuPick(can, v) {
  const s = turn, c = seats[s];
  let best = can[0], bestV = -Infinity;
  for (const k of can) {
    const p = tokens[s][k], q = p < 0 ? 0 : p + v;
    let val = q;
    if (q === END) val += 60;
    if (p < 0) val += 40;
    if (q <= 50) {
      const sq = (COLOURS[c].start + q) % 52;
      const hit = seats.some((oc, os) => os !== s && tokens[os].some((op) => op >= 0 && op <= 50 && (COLOURS[oc].start + op) % 52 === sq));
      if (hit && !SAFE.has(sq)) val += 80;
      if (SAFE.has(sq)) val += 15;
      // danger: an opponent within six squares behind
      const danger = seats.some((oc, os) => os !== s && tokens[os].some((op) => op >= 0 && op <= 50 && ((sq - (COLOURS[oc].start + op) % 52 + 52) % 52) <= 6 && ((sq - (COLOURS[oc].start + op) % 52 + 52) % 52) > 0));
      if (danger && !SAFE.has(sq)) val -= 25;
    } else val += 20;
    if (val > bestV) { bestV = val; best = k; }
  }
  return best;
}

function finish(s) {
  over = true;
  drawTokens();
  if (opp === 'cpu') {
    const res = s === 0 ? 'win' : 'lose';
    score.add(res);
    showResult(res, s === 0 ? 'You won!' : label(s) + ' won', s === 0 ? 'All four of your counters are home.' : 'You got ' + tokens[0].filter((p) => p === END).length + ' of 4 counters home.');
    play(res === 'win' ? 'win' : 'lose', 0.1);
    track('game_end', { game: 'ludo', result: res });
  } else { showResult('win', label(s) + ' wins!', 'All four counters home.'); play('win', 0.1); }
  setStatus(label(s) + (s === 0 && opp === 'cpu' ? ' win!' : ' wins!'));
}

function newGame() {
  seats = n === 2 ? [0, 2] : [0, 1, 2, 3];
  tokens = seats.map(() => [-1, -1, -1, -1]);
  turn = 0; rolled = 0; sixes = 0; over = false; busy = false; started = false;
  $('result').hidden = true;
  drawTokens();
  setStatus((opp === 'cpu' ? 'Your' : 'Red’s') + ' turn: roll. A 6 brings a counter out', '');
}

$('lu-board').addEventListener('click', (e) => {
  const t = e.target.closest('.tok.can');
  if (!t || busy) return;
  move(Number(t.dataset.k));
});
$('lu-board').addEventListener('keydown', (e) => {
  const t = e.target.closest('.tok.can');
  if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); move(Number(t.dataset.k)); }
});
function paintSegs() {
  document.querySelectorAll('[data-lopp]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lopp === opp)));
  document.querySelectorAll('[data-ln]').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.ln) === n)));
}
document.querySelectorAll('[data-lopp]').forEach((b) => b.addEventListener('click', () => { if (busy) return; opp = b.dataset.lopp; store.set(OPP_KEY, opp); paintSegs(); newGame(); }));
document.querySelectorAll('[data-ln]').forEach((b) => b.addEventListener('click', () => { if (busy) return; n = Number(b.dataset.ln); store.set(N_KEY, n); paintSegs(); newGame(); }));
$('roll').addEventListener('click', () => { if (human(turn)) roll(); });
document.addEventListener('keydown', (e) => { if ((e.key === 'r') && !e.target.closest?.('input')) { if (human(turn)) roll(); } });
$('new-game').addEventListener('click', () => { if (!busy) newGame(); });
$('again').addEventListener('click', newGame);
drawBoard();
paintSegs();
newGame();
