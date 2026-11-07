// Hangman: guess the hidden word one letter at a time before the drawing is finished.
// Solo (a themed word from the computer), 2 players on one device (one player types a secret word),
// or Send a link: type a word, share a link, and a friend guesses it on their own device.
// The word travels in the link (?w=), lightly scrambled so it isn't readable at a glance.
import { THEMES, themeWords } from './themes.js';
import { store } from './site.js';
import { setStatus, MASCOT } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { soloRecord, shake } from './solo.js';
import { isWord, shuffled } from './word-lib.js';

const $ = (id) => document.getElementById(id);
const MAX = 6;
const MODE_KEY = 'bgs-hang-mode';
const rec = soloRecord('bgs-hang-stats', { onPaint: paintRecord });
const PARTS = [...document.querySelectorAll('.hg-part')];

const MODES = ['solo', 'friend', 'link'];
let mode = MODES.includes(store.get(MODE_KEY, 'solo')) ? store.get(MODE_KEY, 'solo') : 'solo';
const KEY = 'boardgamesite';
const scramble = (w) => btoa([...w].map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ KEY.charCodeAt(i % KEY.length))).join('')).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unscramble = (t) => { try { const b = atob(t.replace(/-/g, '+').replace(/_/g, '/')); return [...b].map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ KEY.charCodeAt(i % KEY.length))).join(''); } catch { return ''; } };
const fromLink = (() => { const w = unscramble(new URLSearchParams(location.search).get('w') || ''); return /^[a-z]{3,14}$/.test(w) ? w : null; })();
let challenge = !!fromLink;   // playing a word a friend sent
let word, theme, guessed, wrong, over, started;

// keyboard
const keys = {};
'qwertyuiop asdfghjkl zxcvbnm'.split(' ').forEach((row) => {
  const r = document.createElement('div');
  r.className = 'wg-krow';
  for (const ch of row) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'wg-key';
    b.textContent = ch;
    b.addEventListener('click', () => guess(ch));
    r.appendChild(b);
    keys[ch] = b;
  }
  $('hg-keys').appendChild(r);
});

function render() {
  const slots = $('hg-word');
  slots.textContent = '';
  for (const ch of word) {
    const s = document.createElement('span');
    s.className = 'hg-slot' + (ch === ' ' || ch === '-' ? ' space' : '');
    const shown = guessed.has(ch) || ch === ' ' || ch === '-' || over;
    s.textContent = shown ? ch : '';
    if (over && !guessed.has(ch)) s.classList.add('missed');
    slots.appendChild(s);
  }
  slots.setAttribute('aria-label', 'The word: ' + [...word].map((ch) => (guessed.has(ch) || over ? ch : 'blank')).join(' '));
  PARTS.forEach((p, k) => p.classList.toggle('on', k < wrong));
  for (const [ch, b] of Object.entries(keys)) {
    const used = guessed.has(ch);
    b.disabled = used || over;
    b.classList.toggle('s2', used && word.includes(ch));
    b.classList.toggle('s0', used && !word.includes(ch));
  }
  $('lives').textContent = String(MAX - wrong);
  $('theme').textContent = theme || 'Your friend’s word';
}

function guess(ch) {
  if (over || guessed.has(ch) || !word) return;
  if (!started) { started = true; if (mode === 'solo') rec.played(); track('game_start', { game: 'hangman', mode }); }
  guessed.add(ch);
  if (word.includes(ch)) {
    const n = [...word].filter((x) => x === ch).length;
    play('place');
    setStatus(n === 1 ? 'Yes, there’s one ' + ch.toUpperCase() : 'Yes, there are ' + n + ' ' + ch.toUpperCase() + 's', '');
  } else {
    wrong++;
    play('error');
    setStatus('No ' + ch.toUpperCase() + '. ' + (MAX - wrong) + (MAX - wrong === 1 ? ' guess left' : ' guesses left'), 'cpu');
  }
  render();
  if ([...word].every((x) => guessed.has(x) || x === ' ' || x === '-')) end(true);
  else if (wrong >= MAX) end(false);
}

function end(won) {
  over = true;
  render();
  if (mode === 'solo' && !challenge) {
    if (won) rec.won(); else rec.lost();
    const s = store.get('bgs-hang-streak', { now: 0, best: 0 });
    s.now = won ? s.now + 1 : 0;
    s.best = Math.max(s.best, s.now);
    store.set('bgs-hang-streak', s);
    paintRecord(rec.stats);
  }
  const who = challenge ? (won ? 'You got your friend’s word!' : 'Your friend stumped you') : mode === 'friend' ? (won ? 'Player 2 wins!' : 'Player 1 wins!') : won ? 'You got it!' : 'Out of guesses';
  setStatus(who, won ? '' : 'cpu');
  $('result-img').src = MASCOT[won ? 'win' : 'lose'];
  $('result-text').textContent = who;
  $('result-sub').textContent = 'The word was ' + word.toUpperCase() + '.' + (won ? ' ' + wrong + (wrong === 1 ? ' wrong guess.' : ' wrong guesses.') : '');
  $('again').textContent = challenge ? 'Send a word back' : 'Play again';
  $('result').hidden = false;
  play(won ? 'win' : 'lose', 0.1);
  track('game_end', { game: 'hangman', mode: challenge ? 'challenge' : mode, result: won ? 'win' : 'lose' });
}

function paintRecord(stats) {
  const s = store.get('bgs-hang-streak', { now: 0, best: 0 });
  $('record').textContent = (stats.won || 0) + ' of ' + (stats.played || 0) + ' words guessed' + (s.best ? ' · best streak ' + s.best : '');
}

function newGame() {
  guessed = new Set(); wrong = 0; over = false; started = false;
  $('result').hidden = true;
  $('setup').hidden = true;
  $('share-box').hidden = true;
  if (challenge) {
    word = fromLink; theme = 'A word from your friend';
    setStatus('Your friend sent you a word. Guess it!', 'neutral');
    render();
  } else if (mode === 'solo') {
    theme = shuffled(Object.keys(THEMES))[0];
    word = shuffled(themeWords(theme).filter((w) => w.length >= 4))[0];
    setStatus('Guess the word, one letter at a time', 'neutral');
    render();
  } else {
    // Player 1 types a secret word first.
    word = ''; theme = '';
    $('setup').hidden = false;
    $('secret').value = '';
    $('secret-msg').textContent = '';
    $('secret-label').textContent = mode === 'link' ? 'Type a word for your friend to guess. We’ll make a link to send them.' : 'Player 1, type a secret word. Player 2, look away!';
    $('secret-go').textContent = mode === 'link' ? 'Make link' : 'Start';
    setStatus(mode === 'link' ? 'Type a word to send to a friend' : 'Player 1: type a secret word', 'neutral');
    PARTS.forEach((p) => p.classList.remove('on'));
    $('hg-word').textContent = '';
    Object.values(keys).forEach((b) => { b.disabled = true; b.classList.remove('s0', 's2'); });
    setTimeout(() => $('secret').focus(), 50);
  }
}

$('setup').addEventListener('submit', (e) => {
  e.preventDefault();
  const w = $('secret').value.trim().toLowerCase();
  if (!/^[a-z]{3,14}$/.test(w)) { $('secret-msg').textContent = 'Use one word of 3 to 14 letters, A to Z only.'; return; }
  if (!isWord(w)) { $('secret-msg').textContent = 'That word isn’t in our word list. Try an everyday word.'; return; }
  $('setup').hidden = true;
  $('secret').value = '';
  if (mode === 'link') {
    const url = location.origin + location.pathname + '?w=' + scramble(w);
    $('share-link').value = url;
    $('share-box').hidden = false;
    setStatus('Send the link to your friend', 'neutral');
    track('hangman_link', {});
    return;
  }
  word = w; theme = '';
  setStatus('Player 2: guess the word', 'neutral');
  render();
});
$('share-copy').addEventListener('click', async () => {
  const url = $('share-link').value;
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: 'Can you guess my word?', text: 'I made you a Hangman word. Can you guess it?', url });
    else { await navigator.clipboard.writeText(url); setStatus('Link copied. Send it to your friend', 'neutral'); }
  } catch (e) { /* cancelled */ }
});
$('share-another').addEventListener('click', () => newGame());

function paintMode() { document.querySelectorAll('[data-hmode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.hmode === mode))); }
document.querySelectorAll('[data-hmode]').forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.hmode === mode && !challenge) return;
  if (challenge) { challenge = false; history.replaceState(null, '', location.pathname); }
  mode = b.dataset.hmode; store.set(MODE_KEY, mode); paintMode(); newGame();
}));
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea')) return;
  const k = e.key.toLowerCase();
  if (/^[a-z]$/.test(k)) { e.preventDefault(); guess(k); }
});
$('new-game').addEventListener('click', () => { play('shuffle'); newGame(); });
$('again').addEventListener('click', () => {
  play('shuffle');
  if (challenge) { challenge = false; history.replaceState(null, '', location.pathname); mode = 'link'; store.set(MODE_KEY, mode); paintMode(); }
  newGame();
});
paintMode();
newGame();
