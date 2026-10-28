// Peg Solitaire (English board, 33 holes): jump pegs over each other until one is left.
import { store } from './site.js';
import { setStatus, MASCOT } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { clock, fmt, soloRecord, shake } from './solo.js';

const $ = (id) => document.getElementById(id);
const SAVE = 'bgs-peg-game';
const FEWEST = 'bgs-peg-fewest';
const boardEl = $('peg-board');
const timer = clock($('time'));
const rec = soloRecord('bgs-peg-stats', { onPaint: paintRecord });

const ON = (r, c) => r >= 0 && c >= 0 && r < 7 && c < 7 && (r >= 2 && r <= 4 || c >= 2 && c <= 4);
const CENTRE = 3 * 7 + 3;
let pegs, sel, history, started, done;

const holes = [];
for (let i = 0; i < 49; i++) {
  const r = Math.floor(i / 7), c = i % 7;
  const b = document.createElement(ON(r, c) ? 'button' : 'span');
  if (ON(r, c)) {
    b.type = 'button';
    b.className = 'peg-hole';
    b.innerHTML = '<i></i>';
    b.addEventListener('click', () => tap(i));
  } else b.className = 'peg-off';
  boardEl.appendChild(b);
  holes.push(b);
}

// Jumps from one hole: over a neighbour into the empty hole beyond.
function jumpsFrom(i, p = pegs) {
  if (!p[i]) return [];
  const r = Math.floor(i / 7), c = i % 7, out = [];
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const r1 = r + dr, c1 = c + dc, r2 = r + 2 * dr, c2 = c + 2 * dc;
    if (ON(r2, c2) && p[r1 * 7 + c1] && !p[r2 * 7 + c2]) out.push({ over: r1 * 7 + c1, to: r2 * 7 + c2 });
  }
  return out;
}
const anyMove = () => pegs.some((v, i) => v && jumpsFrom(i).length);
const count = () => pegs.filter(Boolean).length;

function render() {
  const targets = sel != null ? jumpsFrom(sel).map((j) => j.to) : [];
  holes.forEach((b, i) => {
    if (!b.classList.contains('peg-hole')) return;
    b.classList.toggle('on', !!pegs[i]);
    b.classList.toggle('sel', i === sel);
    b.classList.toggle('target', targets.includes(i));
    b.classList.toggle('can', !done && !!pegs[i] && jumpsFrom(i).length > 0);
    const r = Math.floor(i / 7) + 1, c = i % 7 + 1;
    b.setAttribute('aria-label', 'Row ' + r + ', column ' + c + ': ' + (pegs[i] ? 'peg' : 'empty') + (targets.includes(i) ? ', jump here' : '') + (i === sel ? ', selected' : ''));
    b.disabled = done;
  });
  $('left').textContent = String(count());
  $('undo').disabled = !history.length || done;
}

function tap(i) {
  if (done) return;
  if (pegs[i]) {
    if (!jumpsFrom(i).length) { shake(holes[i], play); setStatus('That peg has no jump', 'neutral'); return; }
    sel = sel === i ? null : i;
    // only one way to go: jump straight away
    play('select');
    render();
    return;
  }
  if (sel == null) return;
  const j = jumpsFrom(sel).find((m) => m.to === i);
  if (!j) { sel = null; render(); return; }
  history.push(pegs.slice());
  pegs[sel] = false; pegs[j.over] = false; pegs[i] = true;
  if (!started) { started = true; timer.start(0); rec.played(); track('game_start', { game: 'peg-solitaire' }); }
  // keep jumping with the same peg if it can
  sel = jumpsFrom(i).length ? i : null;
  play('capture');
  render();
  if (!anyMove()) finish();
  else { setStatus(count() + ' pegs left', 'neutral'); save(); }
}

function finish() {
  done = true;
  timer.stop();
  const n = count();
  const t = timer.elapsed();
  const fewest = store.get(FEWEST, null);
  if (fewest == null || n < fewest) store.set(FEWEST, n);
  let kind = 'lose', text, sub;
  if (n === 1) {
    rec.won('one', t);
    kind = 'win';
    text = pegs[CENTRE] ? 'Perfect! One peg, in the centre' : 'One peg left!';
    sub = pegs[CENTRE] ? 'The hardest finish of all, in ' + fmt(t) + '.' : 'Solved in ' + fmt(t) + '. Now try to finish in the centre hole.';
  } else {
    rec.lost();
    if (n <= 3) kind = 'draw';
    text = n + ' pegs left';
    sub = n <= 3 ? 'So close. No more jumps are possible.' : 'No more jumps are possible. Try leaving fewer.';
  }
  sel = null;
  render();
  store.set(SAVE, null);
  setStatus(text, kind === 'win' ? '' : 'neutral');
  $('result-img').src = MASCOT[kind];
  $('result-text').textContent = text;
  $('result-sub').textContent = sub;
  $('result').hidden = false;
  play(kind === 'win' ? 'win' : 'lose', 0.1);
  track('game_end', { game: 'peg-solitaire', result: kind, pegs: n });
}

function paintRecord(stats, best) {
  const f = store.get(FEWEST, null);
  $('record').textContent = (stats.won || 0) + ((stats.won || 0) === 1 ? ' time' : ' times') + ' down to one peg' + (f != null ? ' · fewest left ' + f : '') + (best.one ? ' · best time ' + fmt(best.one) : '');
}

function newGame() {
  pegs = new Array(49).fill(false).map((_, i) => ON(Math.floor(i / 7), i % 7) && i !== CENTRE);
  sel = null; history = []; started = false; done = false;
  timer.reset();
  $('result').hidden = true;
  store.set(SAVE, null);
  setStatus('Jump pegs until only one is left', 'neutral');
  render();
}
function save() { if (started && !done) store.set(SAVE, { pegs, elapsed: timer.elapsed() }); }
function resume() {
  const g = store.get(SAVE, null);
  if (!g || !Array.isArray(g.pegs) || g.pegs.length !== 49) return false;
  pegs = g.pegs.map(Boolean); sel = null; history = []; started = true; done = false;
  timer.start(Number(g.elapsed) || 0);
  setStatus('Welcome back. Your game is where you left it', 'neutral');
  render();
  if (!anyMove()) finish();
  return true;
}
window.addEventListener('pagehide', save);

$('undo').addEventListener('click', () => {
  if (!history.length || done) return;
  pegs = history.pop(); sel = null;
  play('card');
  setStatus(count() + ' pegs left', 'neutral');
  render(); save();
});
$('new-game').addEventListener('click', () => { play('shuffle'); newGame(); });
$('again').addEventListener('click', () => { play('shuffle'); newGame(); });
// Keyboard: arrow keys move between holes.
boardEl.addEventListener('keydown', (e) => {
  const b = e.target.closest('.peg-hole');
  if (!b) return;
  const i = holes.indexOf(b), r = Math.floor(i / 7), c = i % 7;
  const d = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key];
  if (!d) return;
  e.preventDefault();
  for (let k = 1; k < 7; k++) {
    const rr = r + d[0] * k, cc = c + d[1] * k;
    if (rr < 0 || cc < 0 || rr > 6 || cc > 6) break;
    if (ON(rr, cc)) { holes[rr * 7 + cc].focus(); break; }
  }
});

if (!resume()) newGame();
