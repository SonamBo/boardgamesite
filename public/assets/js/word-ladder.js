// Word Ladder: change one letter at a time to turn the first word into the last.
import { setStatus, levelSwitch } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { soloRecord, shake } from './solo.js';
import { words, isWord, shuffled } from './word-lib.js';

const $ = (id) => document.getElementById(id);
const LEN = { easy: 3, medium: 4, hard: 5 };
const RANGE = { easy: [3, 4], medium: [4, 6], hard: [5, 7] };
const NAME = { easy: '3 letters', medium: '4 letters', hard: '5 letters' };
const rec = soloRecord('bgs-ladder-stats', { onPaint: paintRecord });

let level, from, to, chain, par, over, started, hints;
const graphs = {};

// Everyday words of one length, and which ones are a letter apart.
function graph(n) {
  if (graphs[n]) return graphs[n];
  const ws = words().filter((w) => w.length === n).slice(0, 3500);
  const set = new Set(ws);
  const nb = new Map();
  for (const w of ws) {
    const out = [];
    for (let i = 0; i < n; i++) for (let c = 97; c < 123; c++) {
      const ch = String.fromCharCode(c);
      if (ch === w[i]) continue;
      const x = w.slice(0, i) + ch + w.slice(i + 1);
      if (set.has(x)) out.push(x);
    }
    nb.set(w, out);
  }
  return (graphs[n] = { ws, nb });
}
function path(a, b, g) {
  const prev = new Map([[a, null]]);
  const q = [a];
  while (q.length) {
    const w = q.shift();
    if (w === b) break;
    for (const x of g.nb.get(w) || []) if (!prev.has(x)) { prev.set(x, w); q.push(x); }
  }
  if (!prev.has(b)) return null;
  const out = [];
  for (let w = b; w; w = prev.get(w)) out.unshift(w);
  return out;
}
const oneApart = (a, b) => a.length === b.length && [...a].filter((ch, i) => ch !== b[i]).length === 1;

function pickPuzzle() {
  const n = LEN[level], g = graph(n), [lo, hi] = RANGE[level];
  const common = g.ws.slice(0, 1200).filter((w) => g.nb.get(w).length);
  for (let t = 0; t < 400; t++) {
    const a = common[Math.floor(Math.random() * common.length)];
    // walk the graph outward and pick something the right distance away
    const dist = new Map([[a, 0]]);
    const q = [a];
    while (q.length) { const w = q.shift(); for (const x of g.nb.get(w)) if (!dist.has(x)) { dist.set(x, dist.get(w) + 1); q.push(x); } }
    const cands = [...dist].filter(([w, d]) => d >= lo && d <= hi && common.includes(w)).map(([w]) => w);
    if (cands.length) { const b = shuffled(cands)[0]; return [a, b, dist.get(b)]; }
  }
  return ['cold', 'warm', 4];
}

function render() {
  const box = $('ld-chain');
  box.textContent = '';
  const row = (w, cls, prev) => {
    const r = document.createElement('div');
    r.className = 'ld-row ' + cls;
    [...w].forEach((ch, i) => {
      const t = document.createElement('span');
      t.textContent = ch;
      if (prev && prev[i] !== ch) t.className = 'chg';
      if (cls.includes('goal') && chain[chain.length - 1][i] === ch) t.className = 'match';
      r.appendChild(t);
    });
    box.appendChild(r);
  };
  chain.forEach((w, i) => row(w, i === 0 ? 'start' : '', chain[i - 1]));
  if (chain[chain.length - 1] !== to) {
    const gap = document.createElement('p');
    gap.className = 'ld-gap';
    const left = par - (chain.length - 1);
    gap.textContent = left > 0 ? 'At least ' + left + (left === 1 ? ' step' : ' steps') + ' to go' : 'Keep going';
    box.appendChild(gap);
    row(to, 'goal');
  }
  $('steps').textContent = String(chain.length - 1);
  $('par').textContent = String(par);
  $('undo').disabled = chain.length < 2 || over;
  $('ld-input').disabled = over;
  $('ld-input').maxLength = LEN[level];
}

function submit(e) {
  e.preventDefault();
  if (over) return;
  const inp = $('ld-input');
  const w = inp.value.trim().toLowerCase();
  const last = chain[chain.length - 1];
  if (w.length !== last.length) { shake(inp, play); setStatus('Use ' + last.length + ' letters', 'neutral'); return; }
  if (!oneApart(w, last)) { shake(inp, play); setStatus('Change exactly one letter of ' + last.toUpperCase(), 'neutral'); return; }
  if (!isWord(w)) { shake(inp, play); setStatus(w.toUpperCase() + ' isn’t in our word list', 'neutral'); return; }
  if (chain.includes(w)) { shake(inp, play); setStatus('You’ve already used ' + w.toUpperCase(), 'neutral'); return; }
  if (!started) { started = true; rec.played(); track('game_start', { game: 'word-ladder', level }); }
  chain.push(w);
  inp.value = '';
  play(w === to ? 'found' : 'place');
  if (w === to) return win();
  setStatus(w.toUpperCase() + '. Next?', '');
  render();
}

function win() {
  over = true;
  const steps = chain.length - 1;
  rec.won(level, steps);
  render();
  const perfect = steps <= par;
  setStatus(perfect ? 'Perfect ladder!' : 'Ladder complete!');
  $('result-text').textContent = perfect ? 'Perfect ladder!' : 'You reached ' + to.toUpperCase() + '!';
  $('result-sub').textContent = steps + (steps === 1 ? ' step' : ' steps') + ' (shortest possible: ' + par + ')' + (hints ? ', with ' + hints + (hints === 1 ? ' hint.' : ' hints.') : '.');
  $('result').hidden = false;
  play('win', 0.1);
  track('game_end', { game: 'word-ladder', result: 'win', level, steps, par });
}

function paintRecord(stats) {
  $('record').textContent = (stats.won || 0) + ((stats.won || 0) === 1 ? ' ladder' : ' ladders') + ' climbed';
}

function newGame() {
  [from, to, par] = pickPuzzle();
  chain = [from]; over = false; started = false; hints = 0;
  $('result').hidden = true;
  $('ld-input').value = '';
  setStatus('Turn ' + from.toUpperCase() + ' into ' + to.toUpperCase(), 'neutral');
  render();
}

$('ld-form').addEventListener('submit', submit);
$('undo').addEventListener('click', () => { if (chain.length < 2 || over) return; chain.pop(); play('card'); render(); });
$('hint').addEventListener('click', () => {
  if (over) return;
  const g = graph(LEN[level]);
  const p = path(chain[chain.length - 1], to, g);
  if (!p || p.length < 2) { setStatus('No route from here. Try Undo', 'neutral'); return; }
  hints++;
  play('king');
  setStatus('Try ' + p[1].toUpperCase(), 'neutral');
  $('ld-input').value = p[1];
  $('ld-input').focus();
});
$('new-game').addEventListener('click', () => { play('shuffle'); newGame(); });
$('again').addEventListener('click', () => { play('shuffle'); newGame(); });
const getLevel = levelSwitch('ladder', (l) => { level = l; newGame(); });
level = getLevel();
newGame();
