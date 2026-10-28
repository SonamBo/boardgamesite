// Light Switch: every tap flips a light and its four neighbours. Turn them all off.
import { store } from './site.js';
import { setStatus, levelSwitch } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { clock, fmt, soloRecord } from './solo.js';

const $ = (id) => document.getElementById(id);
const SIZES = { easy: 3, medium: 5, hard: 7 };
const PRESSES = { easy: 4, medium: 9, hard: 18 };
const NAME = { easy: '3×3', medium: '5×5', hard: '7×7' };
const SAVE = 'bgs-lights-game';
const gridEl = $('ls-grid');
const timer = clock($('time'));
const rec = soloRecord('bgs-lights-stats', { onPaint: paintRecord });

let N, lights, moves, par, started, done, level, hintAt = -1;
let els = [];

const around = (i) => {
  const r = Math.floor(i / N), c = i % N, out = [i];
  if (r > 0) out.push(i - N);
  if (r < N - 1) out.push(i + N);
  if (c > 0) out.push(i - 1);
  if (c < N - 1) out.push(i + 1);
  return out;
};

// The fewest taps that turn everything off (Gaussian elimination over 0/1, trying every free choice).
function solve(state) {
  const n = N * N;
  const rows = [];
  for (let i = 0; i < n; i++) {
    const row = new Array(n + 1).fill(0);
    around(i).forEach((j) => { row[j] = 1; });
    row[n] = state[i] ? 1 : 0;
    rows.push(row);
  }
  const pivotCol = [];
  let r = 0;
  for (let c = 0; c < n && r < n; c++) {
    let p = rows.findIndex((row, k) => k >= r && row[c]);
    if (p < 0) continue;
    [rows[r], rows[p]] = [rows[p], rows[r]];
    for (let k = 0; k < n; k++) if (k !== r && rows[k][c]) for (let m = c; m <= n; m++) rows[k][m] ^= rows[r][m];
    pivotCol.push(c);
    r++;
  }
  for (let k = r; k < n; k++) if (rows[k][n]) return null; // can't be solved
  const free = [];
  for (let c = 0; c < n; c++) if (!pivotCol.includes(c)) free.push(c);
  let best = null;
  for (let mask = 0; mask < 1 << free.length; mask++) {
    const x = new Array(n).fill(0);
    free.forEach((c, k) => { x[c] = (mask >> k) & 1; });
    pivotCol.forEach((c, k) => {
      let v = rows[k][n];
      free.forEach((f) => { if (rows[k][f]) v ^= x[f]; });
      x[c] = v;
    });
    if (!best || x.filter(Boolean).length < best.filter(Boolean).length) best = x;
  }
  return best;
}

function build() {
  gridEl.textContent = '';
  gridEl.style.setProperty('--n', N);
  els = [];
  for (let i = 0; i < N * N; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ls-light';
    b.addEventListener('click', () => press(i));
    gridEl.appendChild(b);
    els.push(b);
  }
}

function render() {
  els.forEach((b, i) => {
    b.classList.toggle('on', !!lights[i]);
    b.classList.toggle('hint', i === hintAt);
    b.setAttribute('aria-label', 'Row ' + (Math.floor(i / N) + 1) + ', column ' + (i % N + 1) + ': ' + (lights[i] ? 'on' : 'off'));
    b.setAttribute('aria-pressed', String(!!lights[i]));
    b.disabled = done;
  });
  $('moves').textContent = String(moves);
  $('par').textContent = String(par);
  $('lit').textContent = String(lights.filter(Boolean).length);
}

function press(i) {
  if (done) return;
  around(i).forEach((j) => { lights[j] = !lights[j]; });
  moves++;
  hintAt = -1;
  if (!started) { started = true; timer.start(0); rec.played(); track('game_start', { game: 'light-switch', level }); }
  play(lights[i] ? 'place' : 'flip');
  render();
  if (!lights.some(Boolean)) win(); else save();
}

function win() {
  done = true;
  timer.stop();
  const t = timer.elapsed();
  const record = rec.won(level, t);
  render();
  store.set(SAVE, null);
  const perfect = moves <= par;
  setStatus('Lights out!');
  $('result-text').textContent = perfect ? 'Lights out, in the fewest moves!' : 'Lights out!';
  $('result-sub').textContent = moves + ' moves (fewest possible: ' + par + ') in ' + fmt(t) + '.' + (record ? ' A new best time!' : '');
  $('result').hidden = false;
  play('win', 0.1);
  track('game_end', { game: 'light-switch', result: 'win', level, moves, par });
}

function paintRecord(stats, best) {
  const parts = [(stats.won || 0) + ((stats.won || 0) === 1 ? ' puzzle' : ' puzzles') + ' solved'];
  Object.keys(SIZES).forEach((l) => { if (best[l]) parts.push(NAME[l] + ' best ' + fmt(best[l])); });
  $('record').textContent = parts.join(' · ');
}

function newGame() {
  N = SIZES[level];
  build();
  // Start from dark and press random squares, so every puzzle can be solved.
  do {
    lights = new Array(N * N).fill(false);
    const picks = new Set();
    while (picks.size < PRESSES[level]) picks.add(Math.floor(Math.random() * N * N));
    picks.forEach((i) => around(i).forEach((j) => { lights[j] = !lights[j]; }));
  } while (!lights.some(Boolean));
  par = solve(lights).filter(Boolean).length;
  moves = 0; started = false; done = false; hintAt = -1;
  timer.reset();
  $('result').hidden = true;
  store.set(SAVE, null);
  setStatus('Turn every light off', 'neutral');
  render();
}
function save() { if (started && !done) store.set(SAVE, { level, lights, moves, par, elapsed: timer.elapsed() }); }
function resume() {
  const g = store.get(SAVE, null);
  if (!g || g.level !== level || !Array.isArray(g.lights) || g.lights.length !== SIZES[level] ** 2) return false;
  N = SIZES[level];
  build();
  lights = g.lights.map(Boolean); moves = g.moves | 0; par = g.par | 0; started = true; done = false; hintAt = -1;
  timer.start(Number(g.elapsed) || 0);
  setStatus('Welcome back. Your puzzle is where you left it', 'neutral');
  render();
  return true;
}
window.addEventListener('pagehide', save);

$('hint').addEventListener('click', () => {
  if (done) return;
  const x = solve(lights);
  if (!x) return;
  const opts = x.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  hintAt = opts[Math.floor(Math.random() * opts.length)];
  setStatus('Try the glowing ring', 'neutral');
  play('king');
  render();
  els[hintAt].focus();
});
$('new-game').addEventListener('click', () => { play('shuffle'); newGame(); });
$('again').addEventListener('click', () => { play('shuffle'); newGame(); });
gridEl.addEventListener('keydown', (e) => {
  const i = els.indexOf(e.target);
  if (i < 0) return;
  const d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -N, ArrowDown: N }[e.key];
  if (!d) return;
  e.preventDefault();
  const j = i + d;
  if (j >= 0 && j < N * N && !(Math.abs(d) === 1 && Math.floor(j / N) !== Math.floor(i / N))) els[j].focus();
});
const getLevel = levelSwitch('lights', (l) => { level = l; newGame(); });
level = getLevel();
if (!resume()) newGame();
