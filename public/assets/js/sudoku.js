// Sudoku page: pick a square, then a number. Notes, undo, hints, a daily puzzle and saved games.
import * as S from './sudoku-engine.js';
import { store } from './site.js';
import { setStatus, levelSwitch } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { clock, fmt, soloRecord, rng, seedFrom, today, dayNumber, shake } from './solo.js';

const $ = (id) => document.getElementById(id);
const mode = new URLSearchParams(location.search).get('mode') === 'daily' ? 'daily' : 'classic';
const DATE = today();
const SAVE = mode === 'daily' ? 'bgs-sdk-daily-game' : 'bgs-sdk-game';
const DAILY = 'bgs-sdk-daily';
const LEVEL_NAME = { easy: 'Easy', medium: 'Medium', hard: 'Hard', daily: 'Daily' };

const gridEl = $('grid');
const padEl = $('pad');
const timer = clock($('time'));
const rec = soloRecord('bgs-sdk-stats', { onPaint: paintRecord });

let puzzle, solution, grid, notes, history, sel, notesOn = false, level, started, done, hints;

// ---------- Board ----------
const boxes = Array.from({ length: 9 }, () => {
  const d = document.createElement('div');
  d.className = 'sdk-box';
  gridEl.appendChild(d);
  return d;
});
const cells = [];
for (let i = 0; i < 81; i++) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'sdk-cell';
  b.dataset.i = String(i);
  b.addEventListener('click', () => select(i));
  boxes[S.BOX(i)].appendChild(b);
  cells.push(b);
}
const padBtns = [];
for (let v = 1; v <= 9; v++) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'pad-num';
  b.innerHTML = '<b>' + v + '</b><small></small>';
  b.setAttribute('aria-label', 'Enter ' + v);
  b.addEventListener('click', () => enter(v));
  padEl.appendChild(b);
  padBtns.push(b);
}

function render() {
  const bad = S.conflicts(grid);
  const selVal = sel != null ? grid[sel] : 0;
  for (let i = 0; i < 81; i++) {
    const b = cells[i];
    const v = grid[i];
    const given = puzzle[i] !== 0;
    b.classList.toggle('given', given);
    b.classList.toggle('mine', !given && !!v);
    b.classList.toggle('bad', bad.has(i) && !given);
    b.classList.toggle('sel', i === sel);
    b.classList.toggle('peer', sel != null && i !== sel && S.PEERS[sel].includes(i));
    b.classList.toggle('same', !!selVal && v === selVal && i !== sel);
    if (v) {
      b.textContent = String(v);
    } else if (notes[i]) {
      let h = '<span class="notes">';
      for (let n = 1; n <= 9; n++) h += '<i>' + (notes[i] & (1 << n) ? n : '') + '</i>';
      b.innerHTML = h + '</span>';
    } else {
      b.textContent = '';
    }
    const rc = 'row ' + (S.ROW(i) + 1) + ', column ' + (S.COL(i) + 1);
    b.setAttribute('aria-label', v ? rc + ': ' + v + (given ? '' : (bad.has(i) ? ', clashes' : '')) : rc + ': empty');
    b.setAttribute('aria-pressed', String(i === sel));
  }
  const used = new Array(10).fill(0);
  grid.forEach((v, i) => { if (v && v === solution[i]) used[v]++; });
  padBtns.forEach((b, k) => {
    const left = 9 - used[k + 1];
    b.querySelector('small').textContent = left > 0 ? String(left) : '';
    b.classList.toggle('used-up', left <= 0);
  });
  $('notes-btn').setAttribute('aria-pressed', String(notesOn));
  $('notes-btn').querySelector('small').textContent = notesOn ? 'On' : 'Off';
  $('undo').disabled = !history.length || done;
  $('hint').disabled = done;
  $('erase').disabled = done;
  gridEl.classList.toggle('notes-mode', notesOn);
  $('hints-used').textContent = String(hints);
}

function select(i) {
  if (done) return;
  sel = i;
  play('select');
  render();
}

function startClock() {
  if (started) return;
  started = true;
  rec.played();
  timer.start(0);
  track('game_start', { game: 'sudoku', level, mode });
}

function setCell(i, v, n) {
  history.push({ i, v: grid[i], n: notes[i], peers: S.PEERS[i].map((j) => notes[j]) });
  grid[i] = v;
  notes[i] = n;
}

function enter(v) {
  if (done) return;
  if (sel == null) { setStatus('Pick a square first'); return; }
  if (puzzle[sel]) { shake(cells[sel], play); return; }
  startClock();
  if (notesOn) {
    if (grid[sel]) return shake(cells[sel], play);
    setCell(sel, 0, notes[sel] ^ (1 << v));
    play('flip');
  } else {
    if (grid[sel] === v) return;
    setCell(sel, v, 0);
    // Clear that number from the notes it now rules out.
    for (const j of S.PEERS[sel]) notes[j] &= ~(1 << v);
    play(S.conflicts(grid).has(sel) ? 'error' : 'place');
  }
  afterMove();
}

function erase() {
  if (done || sel == null || puzzle[sel] || (!grid[sel] && !notes[sel])) return;
  setCell(sel, 0, 0);
  play('flip');
  afterMove();
}

function undo() {
  const h = history.pop();
  if (!h || done) return;
  grid[h.i] = h.v;
  notes[h.i] = h.n;
  S.PEERS[h.i].forEach((j, k) => { notes[j] = h.peers[k]; });
  sel = h.i;
  play('card');
  afterMove();
}

function hint() {
  if (done) return;
  let i = sel;
  if (i == null || puzzle[i] || grid[i] === solution[i]) {
    // the empty (or wrong) square with the fewest possibilities
    const wrong = grid.findIndex((v, k) => v && v !== solution[k] && !puzzle[k]);
    if (wrong >= 0) i = wrong;
    else {
      let best = -1, bestN = 10;
      for (let k = 0; k < 81; k++) {
        if (grid[k]) continue;
        const seen = new Set(S.PEERS[k].map((j) => grid[j]).filter(Boolean));
        if (9 - seen.size < bestN) { bestN = 9 - seen.size; best = k; }
      }
      i = best;
    }
  }
  if (i < 0) return;
  startClock();
  sel = i;
  hints++;
  setCell(i, solution[i], 0);
  for (const j of S.PEERS[i]) notes[j] &= ~(1 << solution[i]);
  play('king');
  setStatus('Hint: ' + solution[i] + ' goes in row ' + (S.ROW(i) + 1) + ', column ' + (S.COL(i) + 1));
  afterMove(true);
}

function afterMove(keepStatus) {
  if (S.isSolved(grid, solution)) return win();
  if (!keepStatus) {
    const filled = grid.every(Boolean);
    if (filled) setStatus('Every square is full, but something clashes', 'neutral');
    else setStatus(mode === 'daily' ? 'Daily puzzle #' + dayNumber(DATE) : LEVEL_NAME[level] + ' puzzle');
  }
  render();
  save();
}

function win() {
  done = true;
  timer.stop();
  const t = timer.elapsed();
  const lvl = mode === 'daily' ? 'daily' : level;
  const record = rec.won(lvl, t);
  sel = null;
  render();
  store.set(SAVE, null);
  let sub = 'Solved in ' + fmt(t) + (hints ? ' with ' + hints + (hints === 1 ? ' hint' : ' hints') : '') + '.';
  if (mode === 'daily') {
    const d = store.get(DAILY, {});
    const streak = d.lastSolved === yesterday() ? (d.streak || 0) + 1 : d.lastSolved === DATE ? d.streak || 1 : 1;
    store.set(DAILY, { lastSolved: DATE, streak, time: t });
    sub += ' Streak: ' + streak + (streak === 1 ? ' day' : ' days') + '. A new puzzle arrives at midnight.';
  } else if (record) sub += ' A new best time for ' + LEVEL_NAME[level] + '!';
  setStatus('Solved!');
  $('result-text').textContent = mode === 'daily' ? 'Daily puzzle solved!' : 'Puzzle solved!';
  $('result-sub').textContent = sub;
  $('result').hidden = false;
  $('again').textContent = mode === 'daily' ? 'Play a classic puzzle' : 'New puzzle';
  play('win', 0.1);
  track('game_end', { game: 'sudoku', result: 'win', level: lvl, seconds: Math.round(t / 1000), hints });
}

function yesterday() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function paintRecord(stats, best) {
  const el = $('record');
  if (!el) return;
  const parts = [stats.won + (stats.won === 1 ? ' puzzle' : ' puzzles') + ' solved'];
  ['easy', 'medium', 'hard'].forEach((l) => { if (best[l]) parts.push(LEVEL_NAME[l] + ' best ' + fmt(best[l])); });
  el.textContent = parts.join(' · ');
}

// ---------- New game, save and resume ----------
function newGame() {
  const made = mode === 'daily'
    ? S.generate(rng(seedFrom('sudoku-' + DATE)), 'medium')
    : S.generate(Math.random, level);
  puzzle = made.puzzle; solution = made.solution;
  grid = puzzle.slice();
  notes = new Array(81).fill(0);
  history = []; sel = null; started = false; done = false; hints = 0;
  timer.reset();
  $('result').hidden = true;
  store.set(SAVE, null);
  afterMove();
}

function save() {
  if (done || !started) return;
  store.set(SAVE, { date: DATE, level, puzzle, solution, grid, notes, hints, elapsed: timer.elapsed(), history: history.slice(-200) });
}
const valid = (a) => Array.isArray(a) && a.length === 81 && a.every((v) => Number.isInteger(v) && v >= 0 && v <= 9);
function resume() {
  const g = store.get(SAVE, null);
  if (!g || !valid(g.puzzle) || !valid(g.solution) || !valid(g.grid) || !Array.isArray(g.notes)) return false;
  if (mode === 'daily' && g.date !== DATE) return false;
  if (mode === 'classic' && g.level && g.level !== level) return false;
  puzzle = g.puzzle; solution = g.solution; grid = g.grid;
  notes = g.notes.map((n) => n | 0);
  history = Array.isArray(g.history) ? g.history : [];
  hints = g.hints | 0;
  sel = null; done = false; started = true;
  timer.start(Number(g.elapsed) || 0);
  afterMove();
  setStatus('Welcome back. Your puzzle is where you left it');
  return true;
}
window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { save(); if (timer.running) timer.stop(); }
  else if (started && !done && !timer.running) timer.start(timer.elapsed());
});

// ---------- Controls ----------
$('notes-btn').addEventListener('click', () => { notesOn = !notesOn; play('select'); render(); });
$('erase').addEventListener('click', erase);
$('undo').addEventListener('click', undo);
$('hint').addEventListener('click', hint);
$('new-game').addEventListener('click', () => { if (mode === 'daily') location.href = '/play/sudoku'; else newGame(); });
$('again').addEventListener('click', () => { if (mode === 'daily') location.href = '/play/sudoku'; else newGame(); });

document.addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return;
  if (done) return;
  const k = e.key;
  if (/^[1-9]$/.test(k)) { e.preventDefault(); enter(Number(k)); return; }
  if (k === 'Backspace' || k === 'Delete' || k === '0') { e.preventDefault(); erase(); return; }
  if (k === 'n' || k === 'N') { notesOn = !notesOn; render(); return; }
  if (k === 'z' || k === 'u') { undo(); return; }
  const move = { ArrowUp: -9, ArrowDown: 9, ArrowLeft: -1, ArrowRight: 1 }[k];
  if (move) {
    e.preventDefault();
    if (sel == null) sel = 40;
    else {
      const r = S.ROW(sel), c = S.COL(sel);
      if (move === -9) sel = ((r + 8) % 9) * 9 + c;
      if (move === 9) sel = ((r + 1) % 9) * 9 + c;
      if (move === -1) sel = r * 9 + (c + 8) % 9;
      if (move === 1) sel = r * 9 + (c + 1) % 9;
    }
    cells[sel].focus({ preventScroll: true });
    render();
  }
});

// ---------- Mode ----------
document.querySelectorAll('[data-mode-link]').forEach((a) => {
  if (a.dataset.modeLink === mode) a.setAttribute('aria-current', 'page');
});
$('level-box').hidden = mode === 'daily';
$('daily-panel').hidden = mode !== 'daily';
if (mode === 'daily') {
  const d = store.get(DAILY, {});
  const streak = d.lastSolved === DATE || d.lastSolved === yesterday() ? d.streak || 0 : 0;
  $('daily-streak').textContent = streak + (streak === 1 ? ' day' : ' days');
  $('daily-title').textContent = 'Daily puzzle #' + dayNumber(DATE);
}
const getLevel = levelSwitch('sdk', (l) => { level = l; newGame(); });
level = getLevel();

if (mode === 'daily' && store.get(DAILY, {}).lastSolved === DATE) {
  // Already solved today: show the finished grid.
  const made = S.generate(rng(seedFrom('sudoku-' + DATE)), 'medium');
  puzzle = made.puzzle; solution = made.solution; grid = solution.slice();
  notes = new Array(81).fill(0); history = []; sel = null; done = true; started = true; hints = 0;
  timer.reset();
  $('time').textContent = fmt(store.get(DAILY, {}).time || 0);
  render();
  setStatus('Solved today. Come back tomorrow');
  $('result-text').textContent = 'You’ve solved today’s puzzle';
  $('result-sub').textContent = 'A new daily puzzle arrives at midnight. Until then, try a classic puzzle.';
  $('again').textContent = 'Play a classic puzzle';
  $('result').hidden = false;
} else if (!resume()) newGame();
