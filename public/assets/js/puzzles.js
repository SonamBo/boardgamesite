// Daily puzzles (/puzzles): one puzzle a day for each game, taken from the course puzzles, plus a share card.
//   bgs-puzzles  { 'YYYY-MM-DD': { <game>: mistakes + 1 } }  (last 60 days; synced to the account)
import { runLesson } from './lesson.js';
import { dayKey, logActivity } from './learn-progress.js';
import { store } from './store.js';
import { track } from './firebase.js';

export const PUZZLE_GAMES = [
  { game: 'chess', name: 'Chess' },
  { game: 'checkers', name: 'Checkers' },
  { game: 'mancala', name: 'Mancala' }
];
const KEY = 'bgs-puzzles';
export const puzzleLog = () => store.get(KEY, {}) || {};
export const solvedToday = () => puzzleLog()[dayKey()] || {};

// Puzzles: every strategy move-step with its own position, plus the rules lessons' "find the mate / win / capture /
// free turn" steps. (Plain rules exercises like "castle queenside" aren't puzzles.)
const GOALS = ['mate', 'win', 'capture', 'again'];
export function puzzlePool(course) {
  const out = [];
  for (const u of course.units) for (const l of u.lessons) for (const s of l.steps) {
    if (s.type !== 'move' || s.position === undefined || s.goal === 'any') continue;
    if ((u.stage === 'strategy' && !(s.accept && s.accept.length > 1)) || (!s.accept && !s.line && GOALS.includes(s.goal))) out.push({ step: s, lesson: l });
  }
  return out;
}
// The same puzzle for everyone on a given day, cycling through the pool in a scrambled order.
export function todaysPick(pool, d = new Date()) {
  const day = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
  return pool[(day * 7 + 3) % pool.length];
}

export function puzzleStreak() {
  const log = puzzleLog();
  const d = new Date();
  if (!log[dayKey(d)]) d.setDate(d.getDate() - 1);
  let n = 0;
  while (log[dayKey(d)] && Object.keys(log[dayKey(d)]).length) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

function record(game, mistakes) {
  const log = puzzleLog();
  const k = dayKey();
  log[k] = log[k] || {};
  const first = !log[k][game];
  if (first) log[k][game] = mistakes + 1;
  const keep = Object.keys(log).sort().slice(-60);
  store.set(KEY, Object.fromEntries(keep.map((d) => [d, log[d]])));
  if (first) logActivity(game, 2);
  return first;
}

function shareText(name, mistakes) {
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const result = mistakes === 0 ? 'Solved first try ✅' : 'Solved in ' + (mistakes + 1) + ' tries ' + '🟨'.repeat(Math.min(mistakes, 5)) + '✅';
  const streak = puzzleStreak();
  return 'BoardGameSite daily ' + name + ' puzzle · ' + date + '\n' + result + (streak > 1 ? '\n🔥 ' + streak + '-day streak' : '') + '\nboardgamesite.com/puzzles';
}

async function share(text, btn) {
  try {
    if (navigator.share && matchMedia('(pointer: coarse)').matches) { await navigator.share({ text }); return; }
    await navigator.clipboard.writeText(text);
    btn.textContent = 'Copied! Paste it anywhere';
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    btn.textContent = 'Couldn’t copy. Select the text above';
  }
}

const root = document.getElementById('puzzles');
if (root) mount(root);

async function mount(el) {
  const tabs = el.querySelector('.pz-tabs');
  const stage = el.querySelector('.pz-stage');
  const courses = {};
  const want = new URLSearchParams(location.search).get('game');
  let current = PUZZLE_GAMES.some((g) => g.game === want) ? want : (PUZZLE_GAMES.find((g) => !solvedToday()[g.game]) || PUZZLE_GAMES[0]).game;

  function paintTabs() {
    const done = solvedToday();
    tabs.innerHTML = PUZZLE_GAMES.map((g) => '<button type="button" role="tab" data-game="' + g.game + '" aria-selected="' + (g.game === current) + '">' +
      g.name + (done[g.game] ? ' <span class="pz-tick" aria-label="solved">✓</span>' : '') + '</button>').join('');
    el.querySelector('.pz-count').textContent = Object.keys(done).length + ' of ' + PUZZLE_GAMES.length + ' solved today' + (puzzleStreak() > 1 ? ' · 🔥 ' + puzzleStreak() + '-day streak' : '');
  }
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-game]');
    if (!b || b.dataset.game === current) return;
    current = b.dataset.game;
    show();
  });

  async function show() {
    paintTabs();
    const g = PUZZLE_GAMES.find((x) => x.game === current);
    if (!courses[current]) {
      try { courses[current] = await (await fetch('/assets/learn/' + current + '.json')).json(); }
      catch (e) { stage.innerHTML = '<p class="muted">The puzzle couldn’t load. Check your connection and refresh.</p>'; return; }
    }
    const course = courses[current];
    const pick = todaysPick(puzzlePool(course));
    const lesson = { slug: 'daily', title: 'Daily puzzle', xp: 0, steps: [pick.step], unit: { name: 'Daily puzzle', lessons: [] } };
    runLesson(stage, course, lesson, null, 0, {
      kicker: 'Daily ' + g.name + ' puzzle · from “' + pick.lesson.title + '”',
      finish(card, mistakes) {
        const first = record(current, mistakes);
        if (first) track('puzzle_solved', { game: current, mistakes });
        const text = shareText(g.name, mistakes);
        const nextGame = PUZZLE_GAMES.find((x) => !solvedToday()[x.game]);
        card.innerHTML = '<div class="lp-done-head"><p class="lp-done-title">Solved!</p></div>' +
          '<pre class="pz-share-text">' + text.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</pre>' +
          '<button type="button" class="btn btn-gold btn-block pz-share">Share your result</button>' +
          (nextGame ? '<button type="button" class="btn btn-outline btn-block pz-next" data-game="' + nextGame.game + '">Next: today’s ' + nextGame.name + ' puzzle</button>'
            : '<p class="text-2" style="margin:0">That’s all three for today. New puzzles at midnight.</p>') +
          '<a class="lp-path-link" href="/learn/' + current + '/' + pick.lesson.slug + '">Learn the idea: ' + pick.lesson.title + '</a>';
        card.querySelector('.pz-share').addEventListener('click', (e) => { share(text, e.currentTarget); track('puzzle_share', { game: current }); });
        const nb = card.querySelector('.pz-next');
        if (nb) nb.addEventListener('click', () => { current = nb.dataset.game; show(); });
        paintTabs();
      }
    });
  }
  show();
}
