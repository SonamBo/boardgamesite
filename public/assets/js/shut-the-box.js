// Shut the Box: roll two dice, then shut tiles that add up to the roll. Shut all nine to win.
import { store } from './site.js';
import { setStatus, MASCOT } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { soloRecord, shake } from './solo.js';
import { makeDie, paintDie, tumble, d6 } from './dice-ui.js';

const $ = (id) => document.getElementById(id);
const LOW = 'bgs-box9-low';
const rec = soloRecord('bgs-box9-stats', { onPaint: paintRecord });
const dice = [makeDie($('sb-dice')), makeDie($('sb-dice'))];
const tiles = [...document.querySelectorAll('.sb-tile')];

let open, roll, picked, vals, over, busy, started;

// Can some set of open tiles add up to n?
function canMake(n, from = open) {
  const nums = [...from];
  const go = (i, left) => left === 0 || (i < nums.length && left > 0 && (go(i + 1, left - nums[i]) || go(i + 1, left)));
  return go(0, n);
}
const sum = (s) => [...s].reduce((a, b) => a + b, 0);
const oneDieOk = () => !open.has(7) && !open.has(8) && !open.has(9);

function render() {
  tiles.forEach((t) => {
    const n = Number(t.dataset.n);
    t.classList.toggle('shut', !open.has(n));
    t.classList.toggle('pick', picked.has(n));
    t.disabled = over || busy || !roll || !open.has(n);
    t.setAttribute('aria-pressed', String(picked.has(n)));
    t.setAttribute('aria-label', 'Tile ' + n + (open.has(n) ? (picked.has(n) ? ', picked' : ', open') : ', shut'));
  });
  dice.forEach((d, i) => { paintDie(d, vals[i]); d.hidden = i === 1 && vals.length < 2; });
  $('sb-roll').disabled = over || busy || !!roll;
  $('sb-one').hidden = !oneDieOk() || over;
  $('sb-one').disabled = over || busy || !!roll;
  $('sb-need').textContent = roll ? String(roll - sum(picked)) : '–';
  $('sb-left').textContent = String(sum(open));
}

async function doRoll(n) {
  if (over || busy || roll) return;
  if (!started) { started = true; rec.played(); track('game_start', { game: 'shut-the-box' }); }
  busy = true;
  const v = Array.from({ length: n }, d6);
  await tumble((vv) => { vals = vv; render(); }, v.map((_, i) => i), v);
  vals = v;
  roll = v.reduce((a, b) => a + b, 0);
  busy = false;
  picked = new Set();
  if (!canMake(roll)) return finish();
  setStatus('You rolled ' + roll + '. Shut tiles that add up to ' + roll, '');
  render();
}

function tap(n) {
  if (!roll || over || !open.has(n)) return;
  if (picked.has(n)) { picked.delete(n); play('flip'); return render(); }
  if (sum(picked) + n > roll) { shake(tiles[n - 1], play); setStatus('That’s more than ' + roll, 'neutral'); return; }
  // stop picks that can't lead to the roll
  const rest = new Set([...open].filter((x) => !picked.has(x) && x !== n));
  const left = roll - sum(picked) - n;
  if (left > 0 && !canMake(left, rest)) { shake(tiles[n - 1], play); setStatus('No other tiles can make up the rest', 'neutral'); return; }
  picked.add(n);
  play('select');
  if (sum(picked) === roll) {
    picked.forEach((x) => open.delete(x));
    picked = new Set(); roll = 0;
    play('place');
    if (!open.size) return finish();
    setStatus('Roll again' + (oneDieOk() ? '. You can roll one die now' : ''), '');
  } else setStatus((roll - sum(picked)) + ' more to shut', '');
  render();
}

function finish() {
  over = true;
  const left = sum(open);
  const low = store.get(LOW, null);
  const newLow = low == null || left < low;
  if (newLow) store.set(LOW, left);
  if (!left) rec.won(); else rec.lost();
  render();
  setStatus(left ? 'No tiles add up to ' + roll + '. Score: ' + left : 'You shut the box!', left ? 'neutral' : '');
  $('result-img').src = MASCOT[!left ? 'win' : left <= 6 ? 'draw' : 'lose'];
  $('result-text').textContent = left ? 'Score: ' + left : 'You shut the box!';
  $('result-sub').textContent = left ? 'The tiles left open add up to ' + left + '. Lower is better.' + (newLow && low != null ? ' A new best!' : '') : 'Every tile shut. A perfect game.';
  $('result').hidden = false;
  play(left ? 'lose' : 'win', 0.1);
  track('game_end', { game: 'shut-the-box', result: left ? 'lose' : 'win', score: left });
}

function paintRecord(stats) {
  const low = store.get(LOW, null);
  $('record').textContent = (stats.won || 0) + ' of ' + (stats.played || 0) + ' boxes shut' + (low != null ? ' · best score ' + low : '');
}

function newGame() {
  open = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9]); roll = 0; picked = new Set(); vals = [0, 0]; over = false; busy = false; started = false;
  $('result').hidden = true;
  setStatus('Roll the dice', '');
  render();
}
tiles.forEach((t) => t.addEventListener('click', () => tap(Number(t.dataset.n))));
$('sb-roll').addEventListener('click', () => doRoll(2));
$('sb-one').addEventListener('click', () => doRoll(1));
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea')) return;
  if (/^[1-9]$/.test(e.key)) { e.preventDefault(); tap(Number(e.key)); }
  if (e.key === 'r' || (e.key === ' ' && !e.target.closest?.('button'))) { e.preventDefault(); doRoll(2); }
});
$('new-game').addEventListener('click', () => { play('shuffle'); newGame(); });
$('again').addEventListener('click', () => { play('shuffle'); newGame(); });
newGame();
