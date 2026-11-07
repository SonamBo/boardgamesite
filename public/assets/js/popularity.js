// Animated "bar chart race" of Google search interest in board games and puzzles, 2004 to now.
// Data: /assets/data/popularity.json (quarterly Google Trends averages; see the article for the method).
const root = document.getElementById('race');
const COLORS = {
  Chess: '#7C2236', Solitaire: '#2E7D5B', Sudoku: '#3B6FB6', Wordle: '#5E9E3B', Crossword: '#8A5A2B',
  Mahjong: '#C2410C', Scrabble: '#B7791F', Monopoly: '#C53030', Checkers: '#4A3B8F', Ludo: '#D69E2E',
  Minesweeper: '#4A5568', Dominoes: '#2D3748', Backgammon: '#6B4A2E', Battleship: '#2C5282',
  'Connect 4': '#D53F8C', Catan: '#DD6B20', Mancala: '#975A16', Yahtzee: '#E53E3E', Jenga: '#B7791F',
};
const EVENTS = {
  '2004 Q1': 'In 2004, chess is the most-searched game on this list.',
  '2005 Q3': 'Sudoku mania: the number puzzle sweeps the world and shoots to number one.',
  '2008 Q4': 'Christmas every year: Monopoly searches rise each December.',
  '2009 Q4': 'Mahjong takes the lead. Searches include the tile-matching solitaire version played online.',
  '2012 Q1': 'Scrabble has its biggest year on Google.',
  '2012 Q2': 'A Battleship film reaches cinemas, and searches for the word jump too.',
  '2013 Q4': 'Crossword takes the lead and keeps climbing for years.',
  '2020 Q2': 'Lockdown: searches for Ludo nearly triple as families play online.',
  '2020 Q4': 'The Queen’s Gambit streams on Netflix, and chess searches jump.',
  '2022 Q1': 'Wordle goes viral and smashes every record on this chart.',
  '2023 Q1': 'A chess boom: searches reach a new all-time high.',
  '2025 Q2': 'Mahjong makes a comeback.',
  '2026 Q2': 'Chess hits its highest level yet.',
};
const TOP = 10, PER = 0.55; // bars shown, seconds per quarter
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

const data = await fetch('/assets/data/popularity.json').then((r) => r.json());
const Q = data.quarters, names = Object.keys(data.series), last = Q.length - 1;

root.innerHTML = `
  <div class="pr-head">
    <div><p class="pr-kicker">Google search interest, worldwide</p><p class="pr-sub">Top 10 board games and puzzles, every quarter since 2004</p></div>
    <p class="pr-year" aria-live="off"><span class="pr-y"></span><span class="pr-q"></span></p>
  </div>
  <div class="pr-bars" role="img" aria-label="Animated bar chart of Google search interest in board games and puzzles from 2004 to 2026"></div>
  <p class="pr-event" aria-live="polite"></p>
  <div class="pr-controls">
    <button type="button" class="btn btn-gold pr-play" aria-label="Pause">Pause</button>
    <input type="range" class="pr-scrub" min="0" max="${last}" step="0.01" value="0" aria-label="Year">
  </div>
  <p class="pr-note">Search interest relative to Wordle’s peak in early 2022 (= 100). Source: Google Trends.</p>`;
const bars = root.querySelector('.pr-bars'), yEl = root.querySelector('.pr-y'), qEl = root.querySelector('.pr-q');
const evEl = root.querySelector('.pr-event'), playBtn = root.querySelector('.pr-play'), scrub = root.querySelector('.pr-scrub');

const rows = {};
for (const n of names) {
  const el = document.createElement('div');
  el.className = 'pr-row';
  el.innerHTML = `<span class="pr-name">${n}</span><span class="pr-track"><span class="pr-bar" style="background:${COLORS[n] || '#888'}"></span><span class="pr-val"></span></span>`;
  bars.appendChild(el);
  rows[n] = { el, bar: el.querySelector('.pr-bar'), val: el.querySelector('.pr-val') };
}

let t = 0, playing = false, lastTs = 0, shownEvent = '';
const valueAt = (n, x) => {
  const s = data.series[n], i = Math.floor(x), f = x - i;
  return i >= last ? s[last] : s[i] + (s[i + 1] - s[i]) * f;
};
function draw() {
  const vals = names.map((n) => [n, valueAt(n, t)]).sort((a, b) => b[1] - a[1]);
  const max = Math.max(vals[0][1], 1);
  vals.forEach(([n, v], rank) => {
    const r = rows[n];
    const on = rank < TOP;
    r.el.style.transform = `translateY(${(on ? rank : TOP) * 100}%)`;
    r.el.style.opacity = on ? 1 : 0;
    r.bar.style.width = (v / max) * 100 + '%';
    r.val.textContent = v >= 10 ? Math.round(v) : v.toFixed(1);
  });
  const qi = Math.min(last, Math.floor(t + 0.001));
  const [y, q] = Q[qi].split(' ');
  yEl.textContent = y; qEl.textContent = ' ' + q;
  scrub.value = t;
  // the latest event at or before this quarter, shown for about two years
  let ev = '';
  for (let i = qi; i >= 0 && i > qi - 8; i--) if (EVENTS[Q[i]]) { ev = EVENTS[Q[i]]; break; }
  if (ev !== shownEvent) { shownEvent = ev; evEl.textContent = ev; evEl.classList.toggle('on', !!ev); }
}
function frame(ts) {
  if (!playing) return;
  if (lastTs) t = Math.min(last, t + (ts - lastTs) / 1000 / PER);
  lastTs = ts;
  draw();
  if (t >= last) { setPlaying(false); playBtn.textContent = 'Replay'; playBtn.setAttribute('aria-label', 'Replay'); return; }
  requestAnimationFrame(frame);
}
function setPlaying(p) {
  playing = p; lastTs = 0;
  playBtn.textContent = p ? 'Pause' : 'Play';
  playBtn.setAttribute('aria-label', p ? 'Pause' : 'Play');
  root.classList.toggle('playing', p);
  if (p) requestAnimationFrame(frame);
}
playBtn.addEventListener('click', () => {
  if (playing) return setPlaying(false);
  if (t >= last) t = 0;
  setPlaying(true);
});
scrub.addEventListener('input', () => { setPlaying(false); t = +scrub.value; draw(); });

if (reduce) { t = last; draw(); setPlaying(false); }
else {
  draw(); setPlaying(false);
  // start when the chart scrolls into view
  const io = new IntersectionObserver((es) => {
    if (es.some((e) => e.isIntersecting)) { io.disconnect(); setPlaying(true); }
  }, { threshold: 0.4 });
  io.observe(root);
}
