// Five-Letter Guess: find the hidden word in six tries. A daily word (the same for everyone) and practice.
import { ANSWERS, GUESSES } from './words-5.js';
import { store } from './site.js';
import { setStatus, MASCOT } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { soloRecord, rng, today, dayNumber, shake } from './solo.js';

const $ = (id) => document.getElementById(id);
const split = (s) => s.match(/.{5}/g);
const answers = split(ANSWERS);
const valid = new Set(split(GUESSES));
answers.forEach((w) => valid.add(w));

const mode = new URLSearchParams(location.search).get('mode') === 'practice' ? 'practice' : 'daily';
const DATE = today();
const DAY = dayNumber(DATE);
const DAILY = 'bgs-wg-daily';     // today's guesses, streak and how many tries each win took
const PRACTICE = 'bgs-wg-practice';
const rec = soloRecord('bgs-wg-stats', { onPaint: paintRecord });

// The daily word: one fixed shuffle of the answer list, a step further each day.
function dailyWord() {
  const order = answers.map((_, i) => i);
  const r = rng(20261028);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  return answers[order[((DAY % order.length) + order.length) % order.length]];
}

const board = $('wg-board');
const rows = [];
for (let r = 0; r < 6; r++) {
  const row = document.createElement('div');
  row.className = 'wg-row';
  row.setAttribute('role', 'row');
  const tiles = [];
  for (let c = 0; c < 5; c++) {
    const t = document.createElement('div');
    t.className = 'wg-tile';
    t.setAttribute('role', 'gridcell');
    row.appendChild(t);
    tiles.push(t);
  }
  board.appendChild(row);
  rows.push({ row, tiles });
}

const KEYS = ['qwertyuiop', 'asdfghjkl', '+zxcvbnm-'];
const keyEls = {};
const kb = $('wg-keys');
KEYS.forEach((line) => {
  const row = document.createElement('div');
  row.className = 'wg-krow';
  for (const ch of line) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wg-key';
    if (ch === '+') { b.textContent = 'Enter'; b.classList.add('wide'); b.dataset.k = 'Enter'; }
    else if (ch === '-') {
      b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 5H9l-6 7 6 7h12z"/><path d="M17 9l-5 6M12 9l5 6"/></svg>';
      b.classList.add('wide'); b.dataset.k = 'Backspace'; b.setAttribute('aria-label', 'Delete letter');
    } else { b.textContent = ch; b.dataset.k = ch; keyEls[ch] = b; }
    row.appendChild(b);
  }
  kb.appendChild(row);
});

let answer, guesses, current, over, busy;

// Score a guess: 2 = right place, 1 = in the word elsewhere, 0 = not in the word. Repeated letters count properly.
function score(guess, target) {
  const res = [0, 0, 0, 0, 0];
  const left = {};
  for (let i = 0; i < 5; i++) {
    if (guess[i] === target[i]) res[i] = 2;
    else left[target[i]] = (left[target[i]] || 0) + 1;
  }
  for (let i = 0; i < 5; i++) {
    if (res[i] !== 2 && left[guess[i]]) { res[i] = 1; left[guess[i]]--; }
  }
  return res;
}
const WORDS = ['not in the word', 'in the word, wrong place', 'in the right place'];

function paintRow(r, word, marks, animate) {
  const { tiles } = rows[r];
  for (let i = 0; i < 5; i++) {
    const t = tiles[i];
    const ch = word[i] || '';
    t.textContent = ch;
    t.classList.toggle('filled', !!ch);
    t.classList.remove('s0', 's1', 's2', 'flip');
    if (marks) {
      const apply = () => { t.classList.add('s' + marks[i]); };
      if (animate) {
        t.style.animationDelay = i * 0.28 + 's';
        t.classList.add('flip');
        setTimeout(apply, i * 280 + 160);
      } else apply();
      t.setAttribute('aria-label', ch.toUpperCase() + ', ' + WORDS[marks[i]]);
    } else t.setAttribute('aria-label', ch ? ch.toUpperCase() : 'empty');
  }
}

function paintKeys() {
  const best = {};
  guesses.forEach((g) => score(g, answer).forEach((m, i) => { best[g[i]] = Math.max(best[g[i]] ?? -1, m); }));
  for (const [ch, b] of Object.entries(keyEls)) {
    b.classList.remove('s0', 's1', 's2');
    if (best[ch] !== undefined) b.classList.add('s' + best[ch]);
    b.setAttribute('aria-label', ch.toUpperCase() + (best[ch] !== undefined ? ', ' + WORDS[best[ch]] : ''));
  }
}

function paintAll() {
  for (let r = 0; r < 6; r++) {
    if (r < guesses.length) paintRow(r, guesses[r], score(guesses[r], answer), false);
    else paintRow(r, r === guesses.length ? current : '', null, false);
  }
  paintKeys();
}

function type(k) {
  if (over || busy) return;
  if (k === 'Enter') return submit();
  if (k === 'Backspace') { current = current.slice(0, -1); paintRow(guesses.length, current); return; }
  if (/^[a-z]$/.test(k) && current.length < 5) {
    current += k;
    paintRow(guesses.length, current);
    const t = rows[guesses.length].tiles[current.length - 1];
    t.classList.remove('pop'); void t.offsetWidth; t.classList.add('pop');
    play('select');
  }
}

function submit() {
  const row = rows[guesses.length].row;
  if (current.length < 5) { setStatus('Not enough letters', 'neutral'); return shake(row, play); }
  if (!valid.has(current)) { setStatus('“' + current.toUpperCase() + '” isn’t in the word list', 'neutral'); return shake(row, play); }
  if (!guesses.length && mode === 'practice') { rec.played(); track('game_start', { game: 'word-guess', mode }); }
  if (!guesses.length && mode === 'daily') { rec.played(); track('game_start', { game: 'word-guess', mode }); }
  const g = current;
  guesses.push(g);
  current = '';
  const marks = score(g, answer);
  busy = true;
  paintRow(guesses.length - 1, g, marks, !reduced());
  [0, 1, 2, 3, 4].forEach((i) => setTimeout(() => play(marks[i] === 2 ? 'place' : marks[i] === 1 ? 'move' : 'flip'), reduced() ? 0 : i * 280 + 160));
  setTimeout(() => {
    busy = false;
    paintKeys();
    const won = g === answer;
    if (won || guesses.length === 6) finish(won);
    else setStatus((6 - guesses.length) + (6 - guesses.length === 1 ? ' guess left' : ' guesses left'), 'neutral');
    save();
  }, reduced() ? 50 : 1600);
}
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const PRAISE = ['Genius!', 'Magnificent!', 'Impressive!', 'Splendid!', 'Great!', 'Phew!'];
function finish(won, quiet) {
  over = true;
  const n = guesses.length;
  if (!quiet) {
    if (won) rec.won(null);
    else rec.lost();
    if (mode === 'daily') {
      const d = store.get(DAILY, {});
      const dist = Array.isArray(d.dist) && d.dist.length === 7 ? d.dist : [0, 0, 0, 0, 0, 0, 0];
      dist[won ? n - 1 : 6]++;
      const streak = won ? (d.lastWon === yesterday() ? (d.streak || 0) + 1 : 1) : 0;
      store.set(DAILY, { date: DATE, guesses, done: true, won, streak, best: Math.max(d.best || 0, streak), lastWon: won ? DATE : d.lastWon || null, dist });
    }
    play(won ? 'win' : 'lose', 0.1);
    track('game_end', { game: 'word-guess', mode, result: won ? 'win' : 'lose', guesses: n });
  }
  setStatus(won ? PRAISE[n - 1] : 'The word was ' + answer.toUpperCase(), won ? '' : 'cpu');
  $('result-img').src = won ? MASCOT.win : MASCOT.lose;
  $('result-text').textContent = won ? 'Got it in ' + n + (n === 1 ? ' guess!' : ' guesses!') : 'The word was ' + answer.toUpperCase();
  $('result-sub').textContent = mode === 'daily' ? 'A new word arrives at midnight.' : '';
  $('share').hidden = mode !== 'daily';
  $('again').textContent = mode === 'daily' ? 'Play practice words' : 'Next word';
  $('result').hidden = false;
  paintStats();
}

function yesterday() {
  const d = new Date(); d.setDate(d.getDate() - 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function paintRecord(stats) {
  $('record').textContent = (stats.won || 0) + ' of ' + (stats.played || 0) + ((stats.played || 0) === 1 ? ' word' : ' words') + ' found';
}
function paintStats() {
  const d = store.get(DAILY, {});
  const live = d.lastWon === DATE || d.lastWon === yesterday();
  $('wg-streak').textContent = String(live ? d.streak || 0 : 0);
  $('wg-best').textContent = String(d.best || 0);
  const dist = Array.isArray(d.dist) ? d.dist : [0, 0, 0, 0, 0, 0, 0];
  const max = Math.max(1, ...dist.slice(0, 6));
  const box = $('wg-dist');
  box.textContent = '';
  for (let i = 0; i < 6; i++) {
    const row = document.createElement('p');
    const mine = mode === 'daily' && over && d.won && d.date === DATE && guesses.length === i + 1;
    row.innerHTML = '<span>' + (i + 1) + '</span><i class="' + (mine ? 'now' : '') + '" style="width:' + Math.max(8, (dist[i] / max) * 100) + '%">' + dist[i] + '</i>';
    box.appendChild(row);
  }
}

// ---------- Share ----------
$('share').addEventListener('click', async () => {
  const d = store.get(DAILY, {});
  const lines = guesses.map((g) => score(g, answer).map((m) => ['⬛', '🟥', '🟨'][m]).join(''));
  const text = 'Five-Letter Guess #' + DAY + ' ' + (d.won ? guesses.length : 'X') + '/6\n\n' + lines.join('\n') + '\n\nboardgamesite.com/play/word-guess';
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ text });
    else { await navigator.clipboard.writeText(text); setStatus('Result copied. Paste it anywhere', 'neutral'); }
  } catch (e) { /* cancelled */ }
});

// ---------- Save and resume ----------
function save() {
  if (mode === 'practice') store.set(PRACTICE, over ? null : { answer, guesses });
  else if (!over) { const d = store.get(DAILY, {}); store.set(DAILY, { ...d, date: DATE, guesses, done: false }); }
}

function start() {
  over = false; busy = false; current = '';
  $('result').hidden = true;
  if (mode === 'daily') {
    answer = dailyWord();
    const d = store.get(DAILY, {});
    guesses = d.date === DATE && Array.isArray(d.guesses) ? d.guesses.filter((g) => typeof g === 'string' && g.length === 5).slice(0, 6) : [];
    paintAll();
    if (d.date === DATE && d.done) return finish(guesses[guesses.length - 1] === answer, true);
    setStatus(guesses.length ? 'Welcome back. ' + (6 - guesses.length) + ' guesses left' : 'Daily word #' + DAY + ': six guesses', 'neutral');
  } else {
    const p = store.get(PRACTICE, null);
    if (p && answers.includes(p.answer) && Array.isArray(p.guesses) && p.guesses.length < 6) {
      answer = p.answer; guesses = p.guesses.filter((g) => typeof g === 'string' && g.length === 5);
    } else {
      answer = answers[Math.floor(Math.random() * answers.length)];
      guesses = [];
    }
    paintAll();
    setStatus(guesses.length ? 'Welcome back. ' + (6 - guesses.length) + ' guesses left' : 'Find the five-letter word', 'neutral');
  }
  paintStats();
}

// ---------- Input ----------
kb.addEventListener('click', (e) => { const b = e.target.closest('[data-k]'); if (b) { type(b.dataset.k); b.blur(); } });
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea, [contenteditable]')) return;
  if (e.target.closest?.('button') && e.key === 'Enter' && !e.target.closest('.wg-keys')) return; // let buttons work
  const k = e.key === 'Enter' || e.key === 'Backspace' ? e.key : e.key.length === 1 ? e.key.toLowerCase() : '';
  if (!k) return;
  if (k === 'Enter' || k === 'Backspace' || /^[a-z]$/.test(k)) { e.preventDefault(); type(k); }
});
$('again').addEventListener('click', () => {
  if (mode === 'daily') { location.href = '/play/word-guess?mode=practice'; return; }
  store.set(PRACTICE, null);
  start();
});
$('new-game').addEventListener('click', () => {
  if (mode === 'daily') { location.href = '/play/word-guess?mode=practice'; return; }
  if (!over && guesses.length) { rec.lost(); }
  store.set(PRACTICE, null);
  start();
});
document.querySelectorAll('[data-mode-link]').forEach((a) => { if (a.dataset.modeLink === mode) a.setAttribute('aria-current', 'page'); });
$('new-game').textContent = mode === 'daily' ? 'Play practice words' : 'New word';

start();
