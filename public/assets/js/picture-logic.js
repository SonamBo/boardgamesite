// Picture Logic (nonograms): use the number clues to fill in the hidden picture.
import * as E from './picture-logic-engine.js';
import { store } from './site.js';
import { setStatus, levelSwitch } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { clock, fmt, soloRecord } from './solo.js';

const $ = (id) => document.getElementById(id);
const SAVE = 'bgs-pic-game';
const LEVEL_NAME = { easy: '5×5', medium: '10×10', hard: '15×15' };
const gridEl = $('pic-grid');
const timer = clock($('time'));
const rec = soloRecord('bgs-pic-stats', { onPaint: paintRecord });

let P, state, history, started, done, level, tool = 'fill';
let cellEls = [], rowClueEls = [], colClueEls = [];

function build() {
  const n = P.n;
  gridEl.textContent = '';
  gridEl.style.setProperty('--n', n);
  gridEl.classList.toggle('big', n >= 15);
  const corner = document.createElement('div');
  corner.className = 'pic-corner';
  gridEl.appendChild(corner);
  colClueEls = P.colClues.map((cl, c) => {
    const d = document.createElement('div');
    d.className = 'pic-clue col' + (c % 5 === 4 && c < n - 1 ? ' edge' : '');
    d.innerHTML = cl.map((v) => '<span>' + v + '</span>').join('');
    d.setAttribute('aria-label', 'Column ' + (c + 1) + ': ' + cl.join(', '));
    gridEl.appendChild(d);
    return d;
  });
  cellEls = []; rowClueEls = [];
  for (let r = 0; r < n; r++) {
    const d = document.createElement('div');
    d.className = 'pic-clue row' + (r % 5 === 4 && r < n - 1 ? ' edge' : '');
    d.innerHTML = P.rowClues[r].map((v) => '<span>' + v + '</span>').join('');
    d.setAttribute('aria-label', 'Row ' + (r + 1) + ': ' + P.rowClues[r].join(', '));
    gridEl.appendChild(d);
    rowClueEls.push(d);
    for (let c = 0; c < n; c++) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pic-cell' + (c % 5 === 4 && c < n - 1 ? ' er' : '') + (r % 5 === 4 && r < n - 1 ? ' eb' : '');
      b.dataset.r = String(r); b.dataset.c = String(c);
      gridEl.appendChild(b);
      cellEls.push(b);
    }
  }
}

const at = (r, c) => state[r * P.n + c];
function render() {
  const n = P.n;
  cellEls.forEach((b, i) => {
    const v = state[i];
    b.classList.toggle('on', v === 1);
    b.classList.toggle('x', v === 2);
    b.setAttribute('aria-label', 'Row ' + (Math.floor(i / n) + 1) + ', column ' + (i % n + 1) + ': ' + (v === 1 ? 'filled' : v === 2 ? 'crossed out' : 'blank'));
    b.disabled = done;
  });
  for (let r = 0; r < n; r++) {
    const line = Array.from({ length: n }, (_, c) => (at(r, c) === 1 ? 1 : 0));
    rowClueEls[r].classList.toggle('ok', E.clues(line).join() === P.rowClues[r].join());
  }
  for (let c = 0; c < n; c++) {
    const line = Array.from({ length: n }, (_, r) => (at(r, c) === 1 ? 1 : 0));
    colClueEls[c].classList.toggle('ok', E.clues(line).join() === P.colClues[c].join());
  }
  $('undo').disabled = !history.length || done;
  gridEl.classList.toggle('done', done);
}

function isSolved() {
  return rowClueEls.every((el) => el.classList.contains('ok')) && colClueEls.every((el) => el.classList.contains('ok'));
}

// ---------- Painting: press on a square, drag across a line to paint the same way ----------
let stroke = null;
gridEl.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.pic-cell');
  if (!b || done || e.button > 0 && e.button !== 2) return;
  e.preventDefault();
  const i = cellEls.indexOf(b);
  const want = e.button === 2 || tool === 'cross' ? 2 : 1;
  const value = state[i] === want ? 0 : want; // tapping the same mark again clears it
  stroke = { value, start: i, axis: null, changed: [], before: state.slice() };
  paint(i);
  try { gridEl.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
});
gridEl.addEventListener('pointermove', (e) => {
  if (!stroke) return;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const b = el && el.closest && el.closest('.pic-cell');
  if (!b) return;
  let i = cellEls.indexOf(b);
  const n = P.n, r0 = Math.floor(stroke.start / n), c0 = stroke.start % n;
  let r = Math.floor(i / n), c = i % n;
  if (!stroke.axis && (r !== r0 || c !== c0)) stroke.axis = r === r0 ? 'row' : c === c0 ? 'col' : Math.abs(r - r0) < Math.abs(c - c0) ? 'row' : 'col';
  if (stroke.axis === 'row') r = r0; else if (stroke.axis === 'col') c = c0;
  // fill every square between the start and here
  const a = stroke.axis === 'row' ? Math.min(c, c0) : Math.min(r, r0), z = stroke.axis === 'row' ? Math.max(c, c0) : Math.max(r, r0);
  for (let k = a; k <= z; k++) paint(stroke.axis === 'row' ? r0 * n + k : k * n + c0);
});
function endStroke() {
  if (!stroke) return;
  const s = stroke;
  stroke = null;
  if (!s.changed.length) return;
  history.push(s.before);
  if (!started) { started = true; timer.start(0); rec.played(); track('game_start', { game: 'picture-logic', level }); }
  render();
  if (isSolved()) win(); else save();
}
gridEl.addEventListener('pointerup', endStroke);
gridEl.addEventListener('pointercancel', endStroke);
gridEl.addEventListener('contextmenu', (e) => e.preventDefault());
function paint(i) {
  if (state[i] === stroke.value) return;
  // a drag that's filling doesn't wipe out crosses, and the reverse
  if (stroke.changed.length && state[i] !== 0 && stroke.value !== 0) return;
  state[i] = stroke.value;
  stroke.changed.push(i);
  play(stroke.value === 1 ? 'select' : 'flip');
  cellEls[i].classList.toggle('on', state[i] === 1);
  cellEls[i].classList.toggle('x', state[i] === 2);
}
// Keyboard: arrow keys between squares, Enter or Space fills, X crosses out.
gridEl.addEventListener('keydown', (e) => {
  const b = e.target.closest('.pic-cell');
  if (!b || done) return;
  const i = cellEls.indexOf(b), n = P.n;
  if (e.key === 'Enter' || e.key === ' ' || e.key === 'x' || e.key === 'X') {
    e.preventDefault();
    const want = e.key === 'x' || e.key === 'X' || tool === 'cross' ? 2 : 1;
    history.push(state.slice());
    state[i] = state[i] === want ? 0 : want;
    if (!started) { started = true; timer.start(0); rec.played(); }
    play('select');
    render();
    if (isSolved()) win(); else save();
    return;
  }
  const d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -n, ArrowDown: n }[e.key];
  if (d) { e.preventDefault(); const j = i + d; if (j >= 0 && j < n * n && !(Math.abs(d) === 1 && Math.floor(j / n) !== Math.floor(i / n))) cellEls[j].focus(); }
});

function win() {
  done = true;
  timer.stop();
  const t = timer.elapsed();
  const record = rec.won(level, t);
  // clear the crosses to show the finished picture
  state = state.map((v) => (v === 1 ? 1 : 0));
  render();
  store.set(SAVE, null);
  setStatus('Picture complete!');
  $('result-text').textContent = 'Picture complete!';
  $('result-sub').textContent = LEVEL_NAME[level] + ' in ' + fmt(t) + '.' + (record ? ' A new best time!' : '');
  $('result').hidden = false;
  play('win', 0.1);
  track('game_end', { game: 'picture-logic', result: 'win', level, seconds: Math.round(t / 1000) });
}

function paintRecord(stats, best) {
  const parts = [(stats.won || 0) + ((stats.won || 0) === 1 ? ' picture' : ' pictures') + ' solved'];
  ['easy', 'medium', 'hard'].forEach((l) => { if (best[l]) parts.push(LEVEL_NAME[l] + ' best ' + fmt(best[l])); });
  $('record').textContent = parts.join(' · ');
}

function newGame() {
  P = E.generate(Math.random, level);
  state = new Array(P.n * P.n).fill(0);
  history = []; started = false; done = false;
  timer.reset();
  $('result').hidden = true;
  store.set(SAVE, null);
  build();
  setStatus('Fill in the hidden picture', 'neutral');
  render();
}
function save() { if (started && !done) store.set(SAVE, { level, P, state, elapsed: timer.elapsed() }); }
function resume() {
  const g = store.get(SAVE, null);
  if (!g || g.level !== level || !g.P || !Array.isArray(g.state) || g.state.length !== g.P.n * g.P.n) return false;
  P = g.P; state = g.state; history = []; started = true; done = false;
  build();
  timer.start(Number(g.elapsed) || 0);
  setStatus('Welcome back. Your picture is where you left it', 'neutral');
  render();
  return true;
}
window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { save(); if (timer.running) timer.stop(); }
  else if (started && !done && !timer.running) timer.start(timer.elapsed());
});

function paintTool() { document.querySelectorAll('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tool === tool))); }
document.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => { tool = b.dataset.tool; paintTool(); play('select'); }));
$('undo').addEventListener('click', () => { if (!history.length || done) return; state = history.pop(); play('card'); render(); save(); });
$('clear').addEventListener('click', () => { if (done || !state.some(Boolean)) return; history.push(state.slice()); state = state.map(() => 0); play('shuffle'); render(); save(); });
$('new-game').addEventListener('click', () => { play('shuffle'); newGame(); });
$('again').addEventListener('click', () => { play('shuffle'); newGame(); });
const getLevel = levelSwitch('pic', (l) => { level = l; newGame(); });
level = getLevel();
paintTool();
if (!resume()) newGame();
