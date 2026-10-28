// Tower of Hanoi: move the whole tower to the right-hand peg, one disc at a time, never a bigger disc on a smaller one.
import { store } from './site.js';
import { setStatus } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { clock, fmt, soloRecord, shake } from './solo.js';

const $ = (id) => document.getElementById(id);
const SAVE = 'bgs-hanoi-game';
const KEY = 'bgs-hanoi-discs';
const pegsEl = [...document.querySelectorAll('.hn-peg')];
const timer = clock($('time'));
const rec = soloRecord('bgs-hanoi-stats', { onPaint: paintRecord });

let n = Math.min(8, Math.max(3, store.get(KEY, 4) | 0));
let pegs, held, moves, started, done, history;
const least = () => 2 ** n - 1;

function render() {
  pegsEl.forEach((el, p) => {
    const stack = el.querySelector('.hn-stack');
    stack.textContent = '';
    pegs[p].forEach((d, k) => {
      const disc = document.createElement('i');
      disc.className = 'hn-disc d' + d + (held && held.from === p && k === pegs[p].length - 1 ? ' up' : '');
      disc.style.setProperty('--w', String(30 + (d / n) * 70));
      stack.appendChild(disc);
    });
    el.classList.toggle('from', !!held && held.from === p);
    el.classList.toggle('ok', !!held && held.from !== p && (!pegs[p].length || pegs[p][pegs[p].length - 1] > held.disc));
    el.setAttribute('aria-label', 'Peg ' + (p + 1) + ': ' + (pegs[p].length ? pegs[p].length + (pegs[p].length === 1 ? ' disc' : ' discs') + ', top disc size ' + pegs[p][pegs[p].length - 1] : 'empty') + (held && held.from === p ? ', lifted' : ''));
    el.disabled = done;
  });
  $('moves').textContent = String(moves);
  $('least').textContent = String(least());
  $('n-discs').textContent = String(n);
  $('fewer').disabled = n <= 3;
  $('more').disabled = n >= 8;
  $('undo').disabled = !history.length || done;
}

function tapPeg(p) {
  if (done) return;
  if (!held) {
    if (!pegs[p].length) return;
    held = { from: p, disc: pegs[p][pegs[p].length - 1] };
    play('select');
    return render();
  }
  if (p === held.from) { held = null; play('flip'); return render(); }
  const top = pegs[p][pegs[p].length - 1];
  if (top !== undefined && top < held.disc) {
    shake(pegsEl[p], play);
    setStatus('A bigger disc can’t go on a smaller one', 'neutral');
    return;
  }
  history.push(pegs.map((s) => s.slice()));
  pegs[p].push(pegs[held.from].pop());
  held = null;
  moves++;
  if (!started) { started = true; timer.start(0); rec.played(); track('game_start', { game: 'tower-of-hanoi', discs: n }); }
  play('place');
  render();
  if (pegs[2].length === n) win();
  else { setStatus(moves === 1 ? '1 move' : moves + ' moves', 'neutral'); save(); }
}

function win() {
  done = true;
  timer.stop();
  const t = timer.elapsed();
  const fewest = store.get('bgs-hanoi-fewest', {});
  const perfect = moves === least();
  if (!fewest[n] || moves < fewest[n]) { fewest[n] = moves; store.set('bgs-hanoi-fewest', fewest); }
  const record = rec.won(String(n), t);
  render();
  store.set(SAVE, null);
  setStatus(perfect ? 'Perfect!' : 'Tower moved!');
  $('result-text').textContent = perfect ? 'Perfect, in the fewest moves!' : 'Tower moved!';
  $('result-sub').textContent = moves + ' moves (fewest possible: ' + least() + ') in ' + fmt(t) + '.' + (record ? ' A new best time for ' + n + ' discs!' : '') + (perfect && n < 8 ? ' Try ' + (n + 1) + ' discs next.' : '');
  $('again').textContent = perfect && n < 8 ? 'Try ' + (n + 1) + ' discs' : 'Play again';
  $('result').hidden = false;
  play('win', 0.1);
  track('game_end', { game: 'tower-of-hanoi', result: 'win', discs: n, moves });
}

function paintRecord(stats) {
  const fewest = store.get('bgs-hanoi-fewest', {});
  const perfect = Object.entries(fewest).filter(([k, v]) => v === 2 ** Number(k) - 1).map(([k]) => Number(k)).sort((a, b) => a - b);
  $('record').textContent = (stats.won || 0) + ((stats.won || 0) === 1 ? ' tower' : ' towers') + ' moved' + (perfect.length ? ' · perfect with ' + perfect.join(', ') + ' discs' : '');
}

function newGame() {
  pegs = [Array.from({ length: n }, (_, k) => n - k), [], []];
  held = null; moves = 0; started = false; done = false; history = [];
  timer.reset();
  $('result').hidden = true;
  store.set(SAVE, null);
  setStatus('Move the tower to the right-hand peg', 'neutral');
  render();
}
function save() { if (started && !done) store.set(SAVE, { n, pegs, moves, elapsed: timer.elapsed() }); }
function resume() {
  const g = store.get(SAVE, null);
  if (!g || g.n !== n || !Array.isArray(g.pegs) || g.pegs.length !== 3 || g.pegs.flat().length !== n) return false;
  pegs = g.pegs; moves = g.moves | 0; held = null; started = true; done = false; history = [];
  timer.start(Number(g.elapsed) || 0);
  setStatus('Welcome back. Your tower is where you left it', 'neutral');
  render();
  return true;
}
window.addEventListener('pagehide', save);

pegsEl.forEach((el, p) => el.addEventListener('click', () => tapPeg(p)));
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea')) return;
  if (/^[1-3]$/.test(e.key)) { e.preventDefault(); tapPeg(Number(e.key) - 1); }
});
$('undo').addEventListener('click', () => { if (!history.length || done) return; pegs = history.pop(); held = null; moves++; play('card'); render(); save(); });
const setN = (k) => { n = Math.min(8, Math.max(3, k)); store.set(KEY, n); newGame(); };
$('fewer').addEventListener('click', () => setN(n - 1));
$('more').addEventListener('click', () => setN(n + 1));
$('new-game').addEventListener('click', () => { play('shuffle'); newGame(); });
$('again').addEventListener('click', () => {
  if (done && moves === least() && n < 8) setN(n + 1); else newGame();
});

if (!resume()) newGame();
