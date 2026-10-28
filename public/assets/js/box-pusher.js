// Box Pusher: push every box onto a target. You can push, but never pull, and only one box at a time.
import { LEVELS } from './box-levels.js';
import { store } from './site.js';
import { setStatus } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { soloRecord } from './solo.js';

const $ = (id) => document.getElementById(id);
const PROGRESS = 'bgs-box-progress';   // { solved: { "1": pushes, ... } }
const SAVE = 'bgs-box-game';
const boardEl = $('box-board');
const rec = soloRecord('bgs-box-stats', { onPaint: paintRecord });

let lv, W, H, walls, goals, boxes, player, history, moves, pushes, done, started, facing = 'down';

function load(k) {
  lv = Math.max(0, Math.min(LEVELS.length - 1, k));
  const rows = LEVELS[lv].map.split('|');
  H = rows.length; W = Math.max(...rows.map((r) => r.length));
  walls = new Set(); goals = new Set(); boxes = new Set(); player = 0;
  const outside = new Set();
  rows.forEach((row, r) => {
    for (let c = 0; c < W; c++) {
      const ch = row[c] || ' ', i = r * W + c;
      if (ch === '#') walls.add(i);
      if (ch === '.' || ch === '*' || ch === '+') goals.add(i);
      if (ch === '$' || ch === '*') boxes.add(i);
      if (ch === '@' || ch === '+') player = i;
    }
  });
  history = []; moves = 0; pushes = 0; done = false; started = false; facing = 'down';
  build(rows);
  $('result').hidden = true;
  setStatus('Level ' + (lv + 1) + ': push every box onto a target', 'neutral');
  render();
}

let cellEls = [], boxEls = [], playerEl;
function build(rows) {
  boardEl.textContent = '';
  // keep tall levels on screen
  boardEl.parentElement.style.maxWidth = Math.round(Math.min(560, 470 * W / H)) + 'px';
  document.querySelector('[data-max-root]').style.setProperty('--board-ratio', String(W / H * 0.88));
  boardEl.style.setProperty('--w', W);
  boardEl.style.setProperty('--h', H);
  // floor squares are the ones the player can reach without walls (plus anything inside)
  const inside = new Set();
  const stack = [player];
  while (stack.length) {
    const i = stack.pop();
    if (inside.has(i) || walls.has(i) || i < 0 || i >= W * H) continue;
    inside.add(i);
    const c = i % W;
    stack.push(i - W, i + W);
    if (c > 0) stack.push(i - 1);
    if (c < W - 1) stack.push(i + 1);
  }
  cellEls = [];
  for (let i = 0; i < W * H; i++) {
    const d = document.createElement('i');
    d.className = 'bx-cell' + (walls.has(i) ? ' wall' : inside.has(i) ? ' floor' : '') + (goals.has(i) ? ' goal' : '');
    d.style.setProperty('--x', i % W);
    d.style.setProperty('--y', Math.floor(i / W));
    boardEl.appendChild(d);
    cellEls.push(d);
  }
  boxEls = [...boxes].map(() => {
    const b = document.createElement('i');
    b.className = 'bx-box';
    boardEl.appendChild(b);
    return b;
  });
  playerEl = document.createElement('i');
  playerEl.className = 'bx-player';
  playerEl.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="9" cy="10" r="1.4" class="eye"/><circle cx="15" cy="10" r="1.4" class="eye"/></svg>';
  boardEl.appendChild(playerEl);
}

function render() {
  [...boxes].sort((a, b) => a - b).forEach((i, k) => {
    const b = boxEls[k];
    b.style.setProperty('--x', i % W);
    b.style.setProperty('--y', Math.floor(i / W));
    b.classList.toggle('home', goals.has(i));
  });
  playerEl.style.setProperty('--x', player % W);
  playerEl.style.setProperty('--y', Math.floor(player / W));
  playerEl.dataset.face = facing;
  $('moves').textContent = String(moves);
  $('pushes').textContent = String(pushes);
  $('level').textContent = (lv + 1) + ' / ' + LEVELS.length;
  $('undo').disabled = !history.length || done;
  $('prev').disabled = lv === 0;
  $('next').disabled = lv >= LEVELS.length - 1 || lv + 1 > highestOpen();
  const left = [...boxes].filter((i) => !goals.has(i)).length;
  boardEl.setAttribute('aria-label', 'Level ' + (lv + 1) + '. ' + left + (left === 1 ? ' box' : ' boxes') + ' still off target.');
}

// You can play any level up to one past the furthest you've solved.
function highestOpen() {
  const solved = store.get(PROGRESS, {}).solved || {};
  let k = 0;
  while (solved[k + 1]) k++;
  return Math.min(LEVELS.length - 1, k);
}

const DIRS = { up: -1, down: 1, left: -1, right: 1 };
function step(dir) {
  if (done) return;
  const d = dir === 'up' ? -W : dir === 'down' ? W : DIRS[dir];
  const to = player + d;
  facing = dir;
  if (walls.has(to)) { play('error'); render(); return; }
  if (boxes.has(to)) {
    const beyond = to + d;
    if (walls.has(beyond) || boxes.has(beyond)) { play('error'); render(); return; }
    history.push({ player, boxes: [...boxes], moves, pushes });
    boxes.delete(to); boxes.add(beyond);
    pushes++;
    play(goals.has(beyond) ? 'found' : 'place');
  } else {
    history.push({ player, boxes: [...boxes], moves, pushes });
    play('select');
  }
  player = to;
  moves++;
  if (!started) { started = true; rec.played(); track('game_start', { game: 'box-pusher', level: lv + 1 }); }
  render();
  if ([...boxes].every((i) => goals.has(i))) win(); else save();
}

function win() {
  done = true;
  const p = store.get(PROGRESS, {});
  p.solved = p.solved || {};
  const first = !p.solved[lv + 1];
  if (first || pushes < p.solved[lv + 1]) p.solved[lv + 1] = pushes;
  store.set(PROGRESS, p);
  if (first) rec.won(); else rec.lost();
  store.set(SAVE, null);
  render();
  const par = LEVELS[lv].pushes;
  setStatus('Level ' + (lv + 1) + ' solved!');
  $('result-text').textContent = 'Level ' + (lv + 1) + ' solved!';
  $('result-sub').textContent = moves + ' moves, ' + pushes + ' pushes' + (pushes <= par ? '. The fewest pushes possible!' : ' (fewest possible: ' + par + ').');
  $('again').textContent = lv < LEVELS.length - 1 ? 'Next level' : 'Play again';
  $('result').hidden = false;
  play('win', 0.1);
  track('game_end', { game: 'box-pusher', result: 'win', level: lv + 1, moves, pushes });
}

function paintRecord() {
  const solved = Object.keys((store.get(PROGRESS, {}).solved) || {}).length;
  $('record').textContent = solved + ' of ' + LEVELS.length + ' levels solved';
}

function save() { if (started && !done) store.set(SAVE, { lv, player, boxes: [...boxes], moves, pushes }); }
function resume() {
  const g = store.get(SAVE, null);
  if (!g || typeof g.lv !== 'number' || !LEVELS[g.lv] || !Array.isArray(g.boxes)) return false;
  load(g.lv);
  if (g.boxes.length !== boxes.size) return false;
  boxes = new Set(g.boxes); player = g.player | 0; moves = g.moves | 0; pushes = g.pushes | 0; started = true;
  setStatus('Welcome back to level ' + (lv + 1), 'neutral');
  render();
  return true;
}
window.addEventListener('pagehide', save);

// ---------- Input: arrow keys, swipes, on-screen arrows ----------
const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea')) return;
  if (KEYS[e.key]) { e.preventDefault(); step(KEYS[e.key]); }
  else if (e.key === 'z' || e.key === 'u' || e.key === 'Backspace') { e.preventDefault(); undo(); }
  else if (e.key === 'r') { load(lv); }
});
let touch = null;
boardEl.addEventListener('pointerdown', (e) => { touch = { x: e.clientX, y: e.clientY }; });
boardEl.addEventListener('pointerup', (e) => {
  if (!touch) return;
  const dx = e.clientX - touch.x, dy = e.clientY - touch.y;
  touch = null;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) {
    // a tap: step toward it
    const rect = boardEl.getBoundingClientRect();
    const cx = Math.floor((e.clientX - rect.left) / rect.width * W), cy = Math.floor((e.clientY - rect.top) / rect.height * H);
    const px = player % W, py = Math.floor(player / W);
    const ddx = cx - px, ddy = cy - py;
    if (!ddx && !ddy) return;
    step(Math.abs(ddx) > Math.abs(ddy) ? (ddx > 0 ? 'right' : 'left') : (ddy > 0 ? 'down' : 'up'));
    return;
  }
  step(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
});
document.querySelectorAll('[data-dir]').forEach((b) => b.addEventListener('click', () => step(b.dataset.dir)));
function undo() {
  const h = history.pop();
  if (!h || done) return;
  player = h.player; boxes = new Set(h.boxes); moves = h.moves; pushes = h.pushes;
  play('card');
  render(); save();
}
$('undo').addEventListener('click', undo);
$('restart').addEventListener('click', () => { play('shuffle'); load(lv); });
$('prev').addEventListener('click', () => { store.set(SAVE, null); load(lv - 1); });
$('next').addEventListener('click', () => { store.set(SAVE, null); load(lv + 1); });
$('new-game').addEventListener('click', () => { play('shuffle'); load(lv); });
$('again').addEventListener('click', () => load(lv < LEVELS.length - 1 ? lv + 1 : lv));

if (!resume()) load(highestOpen());
