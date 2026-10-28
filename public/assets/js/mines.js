// Mines: uncover every safe square. Numbers say how many of the 8 neighbours hide a mine.
// Tap to dig, long-press or right-click (or switch to Flag) to flag. Tap a number to clear around it.
import { setStatus, levelSwitch, MASCOT } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { clock, fmt, soloRecord } from './solo.js';

const $ = (id) => document.getElementById(id);
const LEVELS = {
  easy: { w: 9, h: 9, mines: 10, name: 'Easy' },
  medium: { w: 16, h: 16, mines: 40, name: 'Medium' },
  hard: { w: 30, h: 16, mines: 99, name: 'Hard' }
};
const FLAG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 21V4"/><path d="M7 4h10l-2.5 4L17 12H7" class="cloth"/></svg>';
const MINE = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5.5"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>';

const field = $('field');
const timer = clock($('time'));
const rec = soloRecord('bgs-mines-stats', { onPaint: paintRecord });

let L, W, H, mines, open, flags, cells, started, over, opened, flagMode = false, levelKey;

function neighbours(i) {
  const x = i % W, y = Math.floor(i / W), out = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (!dx && !dy) continue;
    const nx = x + dx, ny = y + dy;
    if (nx >= 0 && ny >= 0 && nx < W && ny < H) out.push(ny * W + nx);
  }
  return out;
}
const count = (i) => neighbours(i).filter((j) => mines[j]).length;
const flagCount = () => flags.filter(Boolean).length;

function newGame() {
  L = LEVELS[levelKey];
  // Hard is 30 wide; on a narrow screen it turns on its side so the squares stay big enough to tap.
  const room = field.parentElement.clientWidth || 600;
  const tall = L.w > L.h && room / L.w < 22;
  W = tall ? L.h : L.w; H = tall ? L.w : L.h;
  mines = new Array(W * H).fill(false);
  open = new Array(W * H).fill(false);
  flags = new Array(W * H).fill(false);
  started = false; over = false; opened = 0;
  timer.reset();
  $('result').hidden = true;
  field.style.setProperty('--cols', W);
  field.style.setProperty('--rows', H);
  document.querySelector('.mines-fit').style.setProperty('--board-ratio', String(W / H));
  document.querySelector('[data-max-root]').style.setProperty('--board-ratio', String(Math.min(1.9, W / H * 1.02)));
  field.classList.toggle('wide', W >= 30);
  field.textContent = '';
  cells = [];
  for (let i = 0; i < W * H; i++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'mn';
    b.dataset.i = String(i);
    field.appendChild(b);
    cells.push(b);
  }
  setStatus(L.name + ': ' + L.mines + ' mines hidden', 'neutral');
  fitText();
  render();
}
function fitText() {
  const cell = field.clientWidth / W;
  field.style.setProperty('--fs', Math.max(10, Math.min(24, Math.round(cell * 0.56))) + 'px');
}

function layMines(safe) {
  // Keep the first square and its neighbours clear, so the first tap always opens an area.
  const keep = new Set([safe, ...neighbours(safe)]);
  const spots = [];
  for (let i = 0; i < W * H; i++) if (!keep.has(i)) spots.push(i);
  for (let k = 0; k < L.mines; k++) {
    const j = k + Math.floor(Math.random() * (spots.length - k));
    [spots[k], spots[j]] = [spots[j], spots[k]];
    mines[spots[k]] = true;
  }
}

function dig(i) {
  if (over || flags[i]) return;
  if (open[i]) return chord(i);
  if (!started) {
    started = true;
    layMines(i);
    timer.start(0);
    rec.played();
    track('game_start', { game: 'mines', level: levelKey });
  }
  if (mines[i]) return lose(i);
  const n = flood(i);
  play(n > 1 ? 'shuffle' : 'flip');
  after();
}

function flood(start) {
  const stack = [start];
  let n = 0;
  while (stack.length) {
    const i = stack.pop();
    if (open[i] || flags[i]) continue;
    open[i] = true; opened++; n++;
    if (count(i) === 0) neighbours(i).forEach((j) => { if (!open[j] && !mines[j]) stack.push(j); });
  }
  return n;
}

// Tapping an opened number whose flags are all placed opens the rest of its neighbours.
function chord(i) {
  const c = count(i);
  if (!c) return;
  const ns = neighbours(i);
  if (ns.filter((j) => flags[j]).length !== c) { play('error'); return; }
  let hit = -1, n = 0;
  for (const j of ns) {
    if (open[j] || flags[j]) continue;
    if (mines[j]) { hit = j; continue; }
    n += flood(j);
  }
  if (hit >= 0) return lose(hit);
  if (n) { play('shuffle'); after(); }
}

function flag(i) {
  if (over || open[i]) return;
  flags[i] = !flags[i];
  play(flags[i] ? 'place' : 'flip');
  if (navigator.vibrate) try { navigator.vibrate(15); } catch (e) { /* ignore */ }
  render();
}

function after() {
  if (opened === W * H - L.mines) return win();
  render();
}

function win() {
  over = true;
  timer.stop();
  const t = timer.elapsed();
  // Flag the rest for the player.
  mines.forEach((m, i) => { if (m) flags[i] = true; });
  const record = rec.won(levelKey, t);
  render();
  setStatus('Cleared in ' + fmt(t) + '!');
  showResult('win', 'Field cleared!', L.name + ' in ' + fmt(t) + '.' + (record ? ' A new best time!' : ''));
  play('win', 0.1);
  track('game_end', { game: 'mines', result: 'win', level: levelKey, seconds: Math.round(t / 1000) });
}

function lose(i) {
  over = true;
  timer.stop();
  rec.lost();
  render(i);
  setStatus('Boom! You hit a mine', 'cpu');
  const left = W * H - L.mines - opened;
  showResult('lose', 'You hit a mine', left + (left === 1 ? ' safe square was' : ' safe squares were') + ' left to uncover.');
  play('lose');
  track('game_end', { game: 'mines', result: 'lose', level: levelKey });
}

function showResult(kind, text, sub) {
  $('result-img').src = MASCOT[kind];
  $('result-text').textContent = text;
  $('result-sub').textContent = sub;
  $('result').hidden = false;
}

function render(boom = -1) {
  for (let i = 0; i < W * H; i++) {
    const b = cells[i];
    let cls = 'mn', html = '', label;
    const x = i % W + 1, y = Math.floor(i / W) + 1;
    if (open[i]) {
      const c = count(i);
      cls += ' open';
      if (c) { cls += ' n' + c; html = String(c); }
      label = c ? c + (c === 1 ? ' mine' : ' mines') + ' nearby' : 'clear';
    } else if (over && mines[i] && !flags[i]) {
      cls += ' mine' + (i === boom ? ' boom' : '');
      html = MINE;
      label = 'mine';
    } else if (flags[i]) {
      cls += ' flag' + (over && !mines[i] ? ' wrong' : '');
      html = FLAG;
      label = 'flagged';
    } else label = 'hidden';
    if (b.className !== cls) b.className = cls;
    if (b.innerHTML !== html) b.innerHTML = html;
    b.setAttribute('aria-label', 'Row ' + y + ', column ' + x + ': ' + label);
    b.disabled = over;
  }
  $('left').textContent = String(L.mines - flagCount());
  field.classList.toggle('flagging', flagMode);
}

function paintRecord(stats, best) {
  const parts = [stats.won + ' of ' + stats.played + (stats.played === 1 ? ' game' : ' games') + ' won'];
  ['easy', 'medium', 'hard'].forEach((l) => { if (best[l]) parts.push(LEVELS[l].name + ' best ' + fmt(best[l])); });
  $('record').textContent = parts.join(' · ');
}

// ---------- Input: tap, long-press, right-click, keyboard ----------
let press = null;
field.addEventListener('contextmenu', (e) => {
  const b = e.target.closest('.mn');
  e.preventDefault();
  if (press && press.touch) return; // a long press on a touch screen is handled below
  if (b) flag(Number(b.dataset.i));
});
field.addEventListener('pointerdown', (e) => {
  const b = e.target.closest('.mn');
  if (!b || e.button > 0 || over) return;
  const i = Number(b.dataset.i);
  press = { i, x: e.clientX, y: e.clientY, longDone: false, touch: e.pointerType !== 'mouse' };
  if (e.pointerType !== 'mouse') {
    press.t = setTimeout(() => {
      if (!press || press.i !== i) return;
      press.longDone = true;
      if (open[i]) chord(i); else if (flagMode) dig(i); else flag(i);
    }, 420);
  }
});
field.addEventListener('pointermove', (e) => {
  if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 12) { clearTimeout(press.t); press = null; }
});
field.addEventListener('pointerup', (e) => {
  if (!press) return;
  clearTimeout(press.t);
  const p = press;
  press = null;
  if (p.longDone || e.button > 0) return;
  const b = e.target.closest('.mn');
  if (!b || Number(b.dataset.i) !== p.i) return;
  if (open[p.i]) chord(p.i);
  else if (flagMode) flag(p.i);
  else dig(p.i);
});
field.addEventListener('pointercancel', () => { if (press) clearTimeout(press.t); press = null; });
field.addEventListener('keydown', (e) => {
  const b = e.target.closest('.mn');
  if (!b) return;
  const i = Number(b.dataset.i);
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (flagMode) flag(i); else dig(i); return; }
  if (e.key === 'f' || e.key === 'F') { e.preventDefault(); flag(i); return; }
  const d = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -W, ArrowDown: W }[e.key];
  if (d) {
    e.preventDefault();
    const j = i + d;
    if (j >= 0 && j < W * H && !(Math.abs(d) === 1 && Math.floor(j / W) !== Math.floor(i / W))) cells[j].focus();
  }
});

function paintMode() {
  document.querySelectorAll('[data-tool]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.tool === 'flag') === flagMode)));
}
document.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => {
  flagMode = b.dataset.tool === 'flag';
  paintMode();
  play('select');
  render();
}));
document.addEventListener('keydown', (e) => {
  if ((e.key === 'm' || e.key === 'M') && !e.target.closest?.('input, textarea')) { flagMode = !flagMode; paintMode(); render(); }
});

$('new-game').addEventListener('click', () => { play('shuffle'); newGame(); });
$('again').addEventListener('click', () => { play('shuffle'); newGame(); });
const getLevel = levelSwitch('mines', (l) => { levelKey = l; newGame(); });
levelKey = getLevel();
paintMode();
newGame();
// A game in progress keeps its shape; between games, re-fit Hard to the screen.
window.addEventListener('resize', () => { if (!started && levelKey === 'hard') newGame(); else fitText(); });
