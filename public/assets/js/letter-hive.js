// Letter Hive: make words from seven letters. Every word must use the centre letter.
import { store } from './site.js';
import { setStatus } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { soloRecord, rng, seedFrom, today, dayNumber, shake } from './solo.js';
import { words, shuffled } from './word-lib.js';

const $ = (id) => document.getElementById(id);
const mode = new URLSearchParams(location.search).get('mode') === 'practice' ? 'practice' : 'daily';
const DATE = today();
const SAVE = mode === 'daily' ? 'bgs-hive-daily' : 'bgs-hive-practice';
const RANKS = [['Starter', 0], ['Warming up', 0.05], ['Rolling', 0.12], ['Good', 0.22], ['Strong', 0.35], ['Superb', 0.5], ['Brilliant', 0.7], ['Hive mind', 1]];
const WIN_RANK = 'Brilliant';
const rec = soloRecord('bgs-hive-stats', { onPaint: paintRecord });

let P, found, typed, outer, wonOnce, started;

// ---------- Making a puzzle ----------
const letterSet = (w) => [...new Set(w)].sort().join('');
function candidates() {
  return words().slice(0, 20000).filter((w) => w.length >= 7 && !w.includes('s') && new Set(w).size === 7);
}
function wordsFor(letters, centre) {
  const ok = new Set(letters);
  return words().filter((w) => w.length >= 4 && w.includes(centre) && [...w].every((ch) => ok.has(ch)));
}
const points = (w, letters) => (w.length === 4 ? 1 : w.length) + (new Set(w).size === 7 && [...letters].every((ch) => w.includes(ch)) ? 7 : 0);
function make(rand) {
  const pool = candidates();
  for (let t = 0; t < 300; t++) {
    const pan = pool[Math.floor(rand() * pool.length)];
    const letters = letterSet(pan);
    const centres = shuffled([...letters], rand);
    for (const centre of centres) {
      const list = wordsFor(letters, centre);
      if (list.length >= 18 && list.length <= 60) {
        const total = list.reduce((a, w) => a + points(w, letters), 0);
        return { letters, centre, list, total };
      }
    }
  }
  const letters = letterSet('playing'), centre = 'a', list = wordsFor(letters, centre);
  return { letters, centre, list, total: list.reduce((a, w) => a + points(w, letters), 0) };
}

// ---------- Display ----------
function score() { return found.reduce((a, w) => a + points(w, P.letters), 0); }
function rankOf(s) {
  let r = RANKS[0][0];
  for (const [name, f] of RANKS) if (s >= Math.ceil(P.total * f)) r = name;
  return r;
}
function render() {
  const hexes = document.querySelectorAll('.hv-hex');
  hexes[0].textContent = P.centre;
  hexes[0].dataset.ch = P.centre;
  outer.forEach((ch, i) => { hexes[i + 1].textContent = ch; hexes[i + 1].dataset.ch = ch; });
  const t = $('hv-typed');
  t.innerHTML = [...typed].map((ch) => '<span class="' + (ch === P.centre ? 'c' : P.letters.includes(ch) ? '' : 'x') + '">' + ch + '</span>').join('') + '<i class="caret"></i>';
  const s = score();
  $('hv-score').textContent = String(s);
  $('hv-rank').textContent = rankOf(s);
  $('hv-count').textContent = found.length + ' of ' + P.list.length + ' words';
  // progress dots
  const bar = $('hv-bar');
  bar.textContent = '';
  RANKS.forEach(([name, f]) => {
    const d = document.createElement('i');
    d.title = name + ': ' + Math.ceil(P.total * f);
    d.className = s >= Math.ceil(P.total * f) ? 'on' : '';
    bar.appendChild(d);
  });
  bar.style.setProperty('--p', Math.min(1, s / Math.ceil(P.total * 0.7)));
  const list = $('hv-found');
  list.textContent = '';
  found.slice().sort().forEach((w) => {
    const li = document.createElement('li');
    li.textContent = w;
    if (points(w, P.letters) > w.length || (w.length > 4 && new Set(w).size === 7)) li.className = 'pan';
    list.appendChild(li);
  });
}

function type(ch) {
  if (typed.length >= 19) return;
  typed += ch;
  play('select');
  render();
}
function submit() {
  const w = typed;
  const fail = (msg) => { setStatus(msg, 'neutral'); shake($('hv-typed'), play); typed = ''; setTimeout(render, 300); };
  if (!w) return;
  if (w.length < 4) return fail('Too short: words need 4 or more letters');
  if (!w.includes(P.centre)) return fail('Every word must use ' + P.centre.toUpperCase());
  if ([...w].some((ch) => !P.letters.includes(ch))) return fail('Use only the letters in the hive');
  if (found.includes(w)) return fail('Already found');
  if (!P.list.includes(w)) return fail('Not in our word list');
  if (!started) { started = true; rec.played(); track('game_start', { game: 'letter-hive', mode }); }
  found.push(w);
  typed = '';
  const pts = points(w, P.letters);
  const pangram = new Set(w).size === 7;
  play(pangram ? 'king' : 'found');
  setStatus(pangram ? 'Pangram! +' + pts : (w.length >= 7 ? 'Brilliant word! ' : w.length >= 5 ? 'Nice! ' : 'Good! ') + '+' + pts);
  const before = wonOnce;
  if (!wonOnce && score() >= Math.ceil(P.total * 0.7)) { wonOnce = true; rec.won(); }
  render();
  save();
  if (!before && wonOnce) celebrate('You reached ' + WIN_RANK + '!', 'Keep going to find every word and become a Hive mind.');
  if (found.length === P.list.length) { celebrate('Hive mind!', 'You found all ' + P.list.length + ' words.'); play('win', 0.1); }
}
function celebrate(text, sub) {
  $('result-text').textContent = text;
  $('result-sub').textContent = sub;
  $('result').hidden = false;
  play('win', 0.1);
  track('game_end', { game: 'letter-hive', mode, rank: rankOf(score()) });
}

function paintRecord(stats) {
  $('record').textContent = (stats.won || 0) + ((stats.won || 0) === 1 ? ' hive' : ' hives') + ' reached ' + WIN_RANK;
}

// ---------- Save and start ----------
function save() {
  store.set(SAVE, { date: mode === 'daily' ? DATE : null, letters: P.letters, centre: P.centre, found, wonOnce });
}
function load() {
  const g = store.get(SAVE, null);
  if (mode === 'daily') {
    P = make(rng(seedFrom('hive-' + DATE)));
    found = g && g.date === DATE && Array.isArray(g.found) ? g.found.filter((w) => P.list.includes(w)) : [];
    wonOnce = !!(g && g.date === DATE && g.wonOnce);
  } else if (g && typeof g.letters === 'string' && g.letters.length === 7 && g.centre) {
    const list = wordsFor(g.letters, g.centre);
    P = { letters: g.letters, centre: g.centre, list, total: list.reduce((a, w) => a + points(w, g.letters), 0) };
    found = (g.found || []).filter((w) => list.includes(w));
    wonOnce = !!g.wonOnce;
  } else newPractice();
  started = found.length > 0;
  outer = shuffled([...P.letters].filter((ch) => ch !== P.centre));
  typed = '';
  $('result').hidden = true;
  setStatus(mode === 'daily' ? 'Daily hive #' + dayNumber(DATE) + (found.length ? ': welcome back' : '') : found.length ? 'Welcome back' : 'Make words with the centre letter', 'neutral');
  render();
}
function newPractice() {
  P = make(Math.random);
  found = []; wonOnce = false;
}

// ---------- Input ----------
document.querySelectorAll('.hv-hex').forEach((h) => h.addEventListener('click', () => type(h.dataset.ch)));
$('hv-enter').addEventListener('click', submit);
$('hv-del').addEventListener('click', () => { typed = typed.slice(0, -1); play('flip'); render(); });
$('hv-shuffle').addEventListener('click', () => { outer = shuffled(outer); play('shuffle'); render(); });
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea')) return;
  if (e.key === 'Enter') { if (e.target.closest?.('button') && !e.target.closest('.hv-hex')) return; e.preventDefault(); submit(); return; }
  if (e.key === 'Backspace') { e.preventDefault(); typed = typed.slice(0, -1); render(); return; }
  if (e.key === ' ') { e.preventDefault(); outer = shuffled(outer); render(); return; }
  const k = e.key.toLowerCase();
  if (/^[a-z]$/.test(k)) { e.preventDefault(); type(k); }
});
$('new-game').addEventListener('click', () => {
  if (mode === 'daily') { location.href = '/play/letter-hive?mode=practice'; return; }
  play('shuffle'); newPractice(); store.set(SAVE, null); load(); save();
});
$('again').addEventListener('click', () => { $('result').hidden = true; });
document.querySelectorAll('[data-mode-link]').forEach((a) => { if (a.dataset.modeLink === mode) a.setAttribute('aria-current', 'page'); });
$('new-game').textContent = mode === 'daily' ? 'Play practice hives' : 'New hive';
load();
