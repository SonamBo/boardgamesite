// Cryptogram: every letter of a saying has been swapped for another. Work out the code.
import { store } from './site.js';
import { setStatus, levelSwitch } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { clock, fmt, soloRecord } from './solo.js';
import { shuffled } from './word-lib.js';

const $ = (id) => document.getElementById(id);
// Proverbs and sayings in the public domain.
const SAYINGS = [
  ['Actions speak louder than words.', 'Proverb'],
  ['A journey of a thousand miles begins with a single step.', 'Proverb'],
  ['Well done is better than well said.', 'Benjamin Franklin'],
  ['Where there is a will there is a way.', 'Proverb'],
  ['Every cloud has a silver lining.', 'Proverb'],
  ['The early bird catches the worm.', 'Proverb'],
  ['Practice makes perfect.', 'Proverb'],
  ['Fortune favours the bold.', 'Proverb'],
  ['A picture is worth a thousand words.', 'Proverb'],
  ['Rome was not built in a day.', 'Proverb'],
  ['Better late than never.', 'Proverb'],
  ['Honesty is the best policy.', 'Proverb'],
  ['Laughter is the best medicine.', 'Proverb'],
  ['Knowledge is power.', 'Francis Bacon'],
  ['Slow and steady wins the race.', 'Aesop'],
  ['Look before you leap.', 'Proverb'],
  ['Many hands make light work.', 'Proverb'],
  ['The pen is mightier than the sword.', 'Edward Bulwer-Lytton'],
  ['All that glitters is not gold.', 'William Shakespeare'],
  ['Brevity is the soul of wit.', 'William Shakespeare'],
  ['To be or not to be, that is the question.', 'William Shakespeare'],
  ['An apple a day keeps the doctor away.', 'Proverb'],
  ['Do not count your chickens before they hatch.', 'Proverb'],
  ['When in Rome, do as the Romans do.', 'Proverb'],
  ['You can lead a horse to water, but you cannot make it drink.', 'Proverb'],
  ['A friend in need is a friend indeed.', 'Proverb'],
  ['Great minds think alike.', 'Proverb'],
  ['Time and tide wait for no man.', 'Proverb'],
  ['Necessity is the mother of invention.', 'Proverb'],
  ['The best things in life are free.', 'Proverb'],
  ['Variety is the spice of life.', 'William Cowper'],
  ['Hope springs eternal.', 'Alexander Pope'],
  ['A watched pot never boils.', 'Proverb'],
  ['Two heads are better than one.', 'Proverb'],
  ['Still waters run deep.', 'Proverb'],
  ['Every dog has its day.', 'Proverb'],
  ['Tomorrow is another day.', 'Proverb'],
  ['Little strokes fell great oaks.', 'Benjamin Franklin'],
  ['An investment in knowledge pays the best interest.', 'Benjamin Franklin'],
  ['It always seems impossible until it is done.', 'Proverb'],
  ['The squeaky wheel gets the grease.', 'Proverb'],
  ['Birds of a feather flock together.', 'Proverb'],
  ['There is no place like home.', 'Proverb'],
  ['Patience is a virtue.', 'Proverb'],
  ['Curiosity killed the cat, but satisfaction brought it back.', 'Proverb'],
  ['The grass is always greener on the other side of the fence.', 'Proverb'],
  ['Kind words can be short and easy to speak, but their echoes are endless.', 'Proverb'],
  ['Do not judge a book by its cover.', 'Proverb'],
  ['Absence makes the heart grow fonder.', 'Proverb'],
  ['If at first you do not succeed, try, try again.', 'Proverb']
];
const LEVELS = { easy: { reveal: 3, max: 40 }, medium: { reveal: 1, max: 55 }, hard: { reveal: 0, max: 99 } };
const NAME = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const SAVE = 'bgs-crypto-game';
const timer = clock($('time'));
const rec = soloRecord('bgs-crypto-stats', { onPaint: paintRecord });
const A = 'abcdefghijklmnopqrstuvwxyz';

let level, text, author, code, guess, given, sel, started, done, hints;

function makeCode() {
  // every letter maps to a different one, never to itself
  let perm;
  do { perm = shuffled([...A]); } while (perm.some((ch, i) => ch === A[i]));
  const c = {};
  [...A].forEach((ch, i) => { c[ch] = perm[i]; });
  return c;
}

function build() {
  const box = $('cg-text');
  box.textContent = '';
  text.split(' ').forEach((word) => {
    const w = document.createElement('span');
    w.className = 'cg-word';
    for (const ch of word.toLowerCase()) {
      if (A.includes(ch)) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'cg-cell';
        b.dataset.c = code[ch];
        b.innerHTML = '<b></b><small>' + code[ch] + '</small>';
        b.addEventListener('click', () => { sel = b.dataset.c; play('select'); render(); });
        w.appendChild(b);
      } else {
        const p = document.createElement('span');
        p.className = 'cg-punct';
        p.textContent = ch;
        w.appendChild(p);
      }
    }
    box.appendChild(w);
  });
  $('cg-author').textContent = author;
}

function render() {
  // a plain letter used for two code letters is a clash
  const used = {};
  Object.entries(guess).forEach(([c, p]) => { if (p) (used[p] = used[p] || []).push(c); });
  document.querySelectorAll('.cg-cell').forEach((b) => {
    const c = b.dataset.c;
    const p = guess[c] || '';
    b.querySelector('b').textContent = p;
    b.classList.toggle('sel', c === sel && !done);
    b.classList.toggle('given', given.has(c));
    b.classList.toggle('clash', !!p && used[p].length > 1);
    b.classList.toggle('same', c === sel);
    b.setAttribute('aria-label', 'Code letter ' + c.toUpperCase() + (p ? ', guessed ' + p.toUpperCase() : ', empty'));
    b.disabled = done;
  });
  $('cg-keys').querySelectorAll('.wg-key[data-k]').forEach((k) => {
    const ch = k.dataset.k;
    if (ch.length !== 1) return;
    k.classList.toggle('s0', !!used[ch]);
  });
  const total = new Set(Object.values(code).filter((c) => [...text.toLowerCase()].some((ch) => code[ch] === c))).size;
  const filled = Object.keys(guess).filter((c) => guess[c] && inText(c)).length;
  $('left').textContent = String(total - filled);
  $('hints').textContent = String(hints);
}
const inText = (c) => [...text.toLowerCase()].some((ch) => code[ch] === c);

function set(p) {
  if (done || !sel || given.has(sel)) return;
  if (!started) { started = true; timer.start(0); rec.played(); track('game_start', { game: 'cryptogram', level }); }
  guess[sel] = p;
  play(p ? 'place' : 'flip');
  // move to the next empty code letter in reading order
  if (p) {
    const order = [...document.querySelectorAll('.cg-cell')].map((b) => b.dataset.c);
    const i = order.indexOf(sel);
    const next = order.slice(i + 1).concat(order.slice(0, i)).find((c) => !guess[c]);
    if (next) sel = next;
  }
  render();
  check();
  save();
}

function check() {
  const ok = [...text.toLowerCase()].every((ch) => !A.includes(ch) || guess[code[ch]] === ch);
  if (ok) win();
  else if ([...document.querySelectorAll('.cg-cell')].every((b) => guess[b.dataset.c])) setStatus('Every letter is filled, but something’s not right', 'neutral');
}

function win() {
  done = true;
  timer.stop();
  const t = timer.elapsed();
  const record = rec.won(level, t);
  sel = null;
  render();
  store.set(SAVE, null);
  setStatus('Code cracked!');
  $('result-text').textContent = 'Code cracked!';
  $('result-sub').textContent = '“' + text + '” ' + NAME[level] + ' in ' + fmt(t) + (hints ? ' with ' + hints + (hints === 1 ? ' hint' : ' hints') : '') + '.' + (record ? ' A new best time!' : '');
  $('result').hidden = false;
  play('win', 0.1);
  track('game_end', { game: 'cryptogram', result: 'win', level, seconds: Math.round(t / 1000), hints });
}

function paintRecord(stats, best) {
  const parts = [(stats.won || 0) + ((stats.won || 0) === 1 ? ' code' : ' codes') + ' cracked'];
  Object.keys(NAME).forEach((l) => { if (best[l]) parts.push(NAME[l] + ' best ' + fmt(best[l])); });
  $('record').textContent = parts.join(' · ');
}

function newGame() {
  const L = LEVELS[level];
  const pool = SAYINGS.filter(([t]) => t.length <= L.max && (level !== 'hard' || t.length > 30));
  [text, author] = shuffled(pool)[0];
  code = makeCode();
  guess = {}; given = new Set(); sel = null; started = false; done = false; hints = 0;
  // reveal the most common letters on easier levels
  const counts = {};
  for (const ch of text.toLowerCase()) if (A.includes(ch)) counts[ch] = (counts[ch] || 0) + 1;
  Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, L.reveal).forEach((ch) => { guess[code[ch]] = ch; given.add(code[ch]); });
  timer.reset();
  $('result').hidden = true;
  store.set(SAVE, null);
  build();
  sel = [...document.querySelectorAll('.cg-cell')].map((b) => b.dataset.c).find((c) => !given.has(c));
  setStatus('Crack the code', 'neutral');
  render();
}
function save() { if (started && !done) store.set(SAVE, { level, text, author, code, guess, given: [...given], hints, elapsed: timer.elapsed() }); }
function resume() {
  const g = store.get(SAVE, null);
  if (!g || g.level !== level || typeof g.text !== 'string' || !g.code) return false;
  ({ text, author, code, guess, hints } = g);
  given = new Set(g.given || []); sel = null; started = true; done = false;
  build();
  timer.start(Number(g.elapsed) || 0);
  setStatus('Welcome back. Your code is where you left it', 'neutral');
  render();
  return true;
}
window.addEventListener('pagehide', save);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') { save(); if (timer.running) timer.stop(); }
  else if (started && !done && !timer.running) timer.start(timer.elapsed());
});

// keyboard
'qwertyuiop asdfghjkl -zxcvbnm'.split(' ').forEach((row) => {
  const r = document.createElement('div');
  r.className = 'wg-krow';
  for (const ch of row) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wg-key';
    if (ch === '-') { b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 5H9l-6 7 6 7h12z"/><path d="M17 9l-5 6M12 9l5 6"/></svg>'; b.classList.add('wide'); b.dataset.k = 'del'; b.setAttribute('aria-label', 'Clear letter'); }
    else { b.textContent = ch; b.dataset.k = ch; }
    b.addEventListener('click', () => set(ch === '-' ? '' : ch));
    r.appendChild(b);
  }
  $('cg-keys').appendChild(r);
});
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea') || done) return;
  const k = e.key.toLowerCase();
  if (/^[a-z]$/.test(k)) { e.preventDefault(); set(k); }
  else if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); set(''); }
  else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
    e.preventDefault();
    const order = [...new Set([...document.querySelectorAll('.cg-cell')].map((b) => b.dataset.c))];
    const i = order.indexOf(sel);
    sel = order[(i + (e.key === 'ArrowRight' ? 1 : order.length - 1)) % order.length];
    render();
  }
});
$('hint').addEventListener('click', () => {
  if (done) return;
  const plain = Object.fromEntries(Object.entries(code).map(([p, c]) => [c, p]));
  let c = sel && guess[sel] !== plain[sel] ? sel : null;
  if (!c) c = [...document.querySelectorAll('.cg-cell')].map((b) => b.dataset.c).find((x) => guess[x] !== plain[x]);
  if (!c) return;
  if (!started) { started = true; timer.start(0); rec.played(); }
  // clear any other code letter using that plain letter
  Object.keys(guess).forEach((x) => { if (guess[x] === plain[c] && x !== c) guess[x] = ''; });
  guess[c] = plain[c]; given.add(c); hints++;
  sel = c;
  play('king');
  render(); check(); save();
});
$('new-game').addEventListener('click', () => { play('shuffle'); newGame(); });
$('again').addEventListener('click', () => { play('shuffle'); newGame(); });
const getLevel = levelSwitch('crypto', (l) => { level = l; newGame(); });
level = getLevel();
if (!resume()) newGame();
