// Unscramble: put the mixed-up letters back in order to make a word. Ten words a round.
import { store } from './site.js';
import { setStatus, levelSwitch, MASCOT } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { soloRecord, shake } from './solo.js';
import { words, isWord, shuffled } from './word-lib.js';

const $ = (id) => document.getElementById(id);
const LEVELS = { easy: [4, 5], medium: [5, 6], hard: [7, 8] };
const NAME = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const ROUND = 10;
const rec = soloRecord('bgs-unscr-stats', { onPaint: paintRecord });

let level, list, k, letters, picked, score, hintsUsed, solved, over, started, busy = false;
const sortLetters = (w) => [...w].sort().join('');

function pickWords() {
  const [lo, hi] = LEVELS[level];
  const pool = words().slice(0, 9000).filter((w) => w.length >= lo && w.length <= hi && !w.endsWith('s'));
  return shuffled(pool).slice(0, ROUND);
}
function scramble(w) {
  let s;
  do { s = shuffled([...w]); } while (s.join('') === w && new Set(w).size > 1);
  return s;
}

function showWord() {
  const w = list[k];
  letters = scramble(w).map((ch, i) => ({ ch, id: i }));
  picked = [];
  hintsUsed = 0;
  render();
  setStatus('Word ' + (k + 1) + ' of ' + ROUND, 'neutral');
}

function render() {
  const pool = $('un-pool'), ans = $('un-answer');
  pool.textContent = ''; ans.textContent = '';
  letters.forEach((t) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'un-tile' + (picked.includes(t.id) ? ' used' : '');
    b.textContent = t.ch;
    b.disabled = picked.includes(t.id) || over;
    b.setAttribute('aria-label', 'Letter ' + t.ch.toUpperCase());
    b.addEventListener('click', () => pick(t.id));
    pool.appendChild(b);
  });
  for (let i = 0; i < list[k].length; i++) {
    const s = document.createElement('button');
    s.type = 'button';
    s.className = 'un-slot' + (i < hintsUsed ? ' fixed' : '');
    const t = letters.find((x) => x.id === picked[i]);
    s.textContent = t ? t.ch : '';
    s.disabled = !t || i < hintsUsed || over;
    s.addEventListener('click', () => unpick(i));
    ans.appendChild(s);
  }
  $('score').textContent = String(score);
  $('wordno').textContent = Math.min(k + 1, ROUND) + ' / ' + ROUND;
}

function pick(id) {
  if (over || busy || picked.includes(id) || picked.length >= list[k].length) return;
  start();
  picked.push(id);
  play('select');
  render();
  if (picked.length === list[k].length) check();
}
function unpick(i) {
  if (over || i < hintsUsed) return;
  picked.splice(i, 1);
  play('flip');
  render();
}
function start() { if (!started) { started = true; rec.played(); track('game_start', { game: 'unscramble', level }); } }

function check() {
  const guess = picked.map((id) => letters.find((x) => x.id === id).ch).join('');
  const w = list[k];
  if (guess === w || (sortLetters(guess) === sortLetters(w) && isWord(guess))) {
    const pts = Math.max(2, 10 - hintsUsed * 3);
    score += pts; solved++;
    play('found');
    setStatus((guess === w ? '' : 'That works too! ') + guess.toUpperCase() + ' +' + pts);
    $('un-answer').classList.add('right');
    busy = true;
    setTimeout(() => { busy = false; next(); }, 900);
  } else {
    shake($('un-answer'), play);
    setStatus('Not a word. Tap a letter in the answer to take it back', 'neutral');
  }
}

function next() {
  $('un-answer').classList.remove('right');
  k++;
  if (k >= ROUND) return finish();
  showWord();
}

function finish() {
  over = true;
  k = ROUND - 1;
  const record = rec.score(score, level);
  if (solved === ROUND) rec.won(); else rec.lost();
  render();
  setStatus('Round over: ' + score + ' points');
  $('result-img').src = MASCOT[solved >= 7 ? 'win' : solved >= 4 ? 'draw' : 'lose'];
  $('result-text').textContent = solved + ' of ' + ROUND + ' words, ' + score + ' points';
  $('result-sub').textContent = (record ? 'A new best score for ' + NAME[level] + '! ' : rec.best[level] ? 'Your best on ' + NAME[level] + ': ' + rec.best[level] + '. ' : '');
  $('result').hidden = false;
  play(solved >= 7 ? 'win' : 'lose', 0.1);
  track('game_end', { game: 'unscramble', level, score, solved });
}

function paintRecord(stats, best) {
  const parts = [(stats.played || 0) + ((stats.played || 0) === 1 ? ' round' : ' rounds') + ' played'];
  Object.keys(NAME).forEach((l) => { if (best[l]) parts.push(NAME[l] + ' best ' + best[l]); });
  $('record').textContent = parts.join(' · ');
}

function newGame() {
  list = pickWords(); k = 0; score = 0; solved = 0; over = false; started = false;
  $('result').hidden = true;
  showWord();
}

$('hint').addEventListener('click', () => {
  if (over) return;
  const w = list[k];
  if (hintsUsed >= w.length - 1) return;
  start();
  // put the right letters at the front, one more each time
  picked = [];
  const avail = letters.slice();
  for (let i = 0; i <= hintsUsed; i++) {
    const t = avail.find((x) => x.ch === w[i] && !picked.includes(x.id));
    picked.push(t.id);
  }
  hintsUsed++;
  play('king');
  render();
  setStatus('Starts with ' + w.slice(0, hintsUsed).toUpperCase() + '…', 'neutral');
});
$('shuffle').addEventListener('click', () => { if (over) return; letters = shuffled(letters); play('shuffle'); render(); });
$('skip').addEventListener('click', () => {
  if (over || busy) return;
  start();
  setStatus('The word was ' + list[k].toUpperCase(), 'neutral');
  play('flip');
  if (busy) return;
  busy = true;
  const used = [];
  picked = [...list[k]].map((ch) => { const t = letters.find((x) => x.ch === ch && !used.includes(x.id)); used.push(t.id); return t.id; });
  render();
  setTimeout(() => { busy = false; next(); }, 1100);
});
document.addEventListener('keydown', (e) => {
  if (over || e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea')) return;
  const ch = e.key.toLowerCase();
  if (e.key === 'Backspace') { e.preventDefault(); if (picked.length > hintsUsed) unpick(picked.length - 1); return; }
  if (/^[a-z]$/.test(ch)) {
    const t = letters.find((x) => x.ch === ch && !picked.includes(x.id));
    if (t) { e.preventDefault(); pick(t.id); }
  }
});
$('new-game').addEventListener('click', () => { play('shuffle'); newGame(); });
$('again').addEventListener('click', () => { play('shuffle'); newGame(); });
const getLevel = levelSwitch('unscr', (l) => { level = l; newGame(); });
level = getLevel();
newGame();
