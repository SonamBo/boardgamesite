// The daily challenge page (/daily): today's 3 challenges. Board puzzles (Chess, Checkers, Mancala, from the
// learning paths) are played right here; the other games open in their own daily mode.
import { runLesson } from './lesson.js';
import { logActivity } from './learn-progress.js';
import { store } from './store.js';
import { track } from './firebase.js';
import { dayKey, todaysGames, statusOf, todayProgress, noteToday, dailyStreak } from './daily.js';

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

function record(game, mistakes) {
  const log = store.get('bgs-puzzles', {}) || {};
  const k = dayKey();
  log[k] = log[k] || {};
  const first = !log[k][game];
  if (first) log[k][game] = mistakes + 1;
  const keep = Object.keys(log).sort().slice(-60);
  store.set('bgs-puzzles', Object.fromEntries(keep.map((d) => [d, log[d]])));
  if (first) logActivity(game, 2);
  noteToday();
  return first;
}

const dateText = () => new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
function puzzleShare(name, mistakes) {
  const result = mistakes === 0 ? 'Solved first try ✅' : 'Solved in ' + (mistakes + 1) + ' tries ' + '🟨'.repeat(Math.min(mistakes, 5)) + '✅';
  return 'BoardGameSite daily ' + name + ' puzzle · ' + dateText() + '\n' + result + streakLine() + '\nboardgamesite.com/daily';
}
function dayShare() {
  const p = todayProgress();
  const lines = p.games.map((g) => g.icon + ' ' + g.name + ' ' + (g.solved ? '✅' : g.done ? '❌' : '⬜'));
  return 'BoardGameSite daily challenge · ' + dateText() + '\n' + lines.join('\n') + '\n' + p.solved + '/' + p.total + streakLine() + '\nboardgamesite.com/daily';
}
const streakLine = () => (dailyStreak() > 1 ? '\n🔥 ' + dailyStreak() + '-day streak' : '');

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
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

const root = document.getElementById('daily');
if (root) mount(root);

function mount(el) {
  noteToday();
  const games = todaysGames();
  const tabs = el.querySelector('.pz-tabs');
  const stage = el.querySelector('.pz-stage');
  const courses = {};
  const want = new URLSearchParams(location.search).get('game');
  let current = games.some((g) => g.game === want) ? want : (games.find((g) => !statusOf(g.game).done) || games[0]).game;

  function paintTabs() {
    const p = todayProgress();
    tabs.innerHTML = p.games.map((g) => '<button type="button" role="tab" data-game="' + g.game + '" aria-selected="' + (g.game === current) + '">' +
      g.name + (g.solved ? ' <span class="pz-tick" aria-label="solved">✓</span>' : g.done ? ' <span class="pz-miss" aria-label="done">✗</span>' : '') + '</button>').join('');
    el.querySelector('.pz-count').textContent = p.done + ' of ' + p.total + ' done today' + (dailyStreak() > 1 ? ' · 🔥 ' + dailyStreak() + '-day streak' : '');
    const all = el.querySelector('.pz-all');
    all.hidden = p.done < p.total;
    if (!all.hidden) all.querySelector('pre').textContent = dayShare();
  }
  tabs.addEventListener('click', (e) => {
    const b = e.target.closest('[data-game]');
    if (!b || b.dataset.game === current) return;
    current = b.dataset.game;
    show();
  });
  el.querySelector('.pz-all .btn').addEventListener('click', (e) => { share(dayShare(), e.currentTarget); track('daily_share', {}); });
  // coming back from another tab (e.g. after playing today's Sudoku): refresh the ticks
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { noteToday(); paintTabs(); } });

  async function show() {
    paintTabs();
    const g = games.find((x) => x.game === current);
    const next = () => games.find((x) => x.game !== current && !statusOf(x.game).done);
    if (!g.inline) {
      const st = statusOf(g.game);
      stage.innerHTML = '<div class="pz-link card"><span class="pz-icon" aria-hidden="true">' + g.icon + '</span><div><p class="lp-kicker">Daily ' + esc(g.name) + '</p>' +
        '<p class="pz-task">' + esc(g.task) + '</p>' +
        (st.done ? '<p class="' + (st.solved ? 'pz-ok' : 'pz-no') + '">' + (st.solved ? 'Done for today ✓' : 'Played today. A new one arrives at midnight.') + '</p>' : '') +
        '<div class="ladder-actions"><a class="btn btn-gold" href="' + g.href + '">' + (st.done ? 'See today’s ' : 'Play today’s ') + esc(g.name) + '</a>' +
        (next() ? '<button type="button" class="btn btn-outline pz-next" data-game="' + next().game + '">Next: ' + esc(next().name) + '</button>' : '') + '</div></div></div>';
      const nb = stage.querySelector('.pz-next');
      if (nb) nb.addEventListener('click', () => { current = nb.dataset.game; show(); });
      return;
    }
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
        const text = puzzleShare(g.name, mistakes);
        const n = next();
        card.innerHTML = '<div class="lp-done-head"><p class="lp-done-title">Solved!</p></div>' +
          '<pre class="pz-share-text">' + esc(text) + '</pre>' +
          '<button type="button" class="btn btn-gold btn-block pz-share">Share your result</button>' +
          (n ? '<button type="button" class="btn btn-outline btn-block pz-next" data-game="' + n.game + '">Next: today’s ' + esc(n.name) + '</button>'
            : '<p class="text-2" style="margin:0">That’s all three for today. New challenges at midnight.</p>') +
          '<a class="lp-path-link" href="/learn/' + current + '/' + pick.lesson.slug + '">Learn the idea: ' + esc(pick.lesson.title) + '</a>';
        card.querySelector('.pz-share').addEventListener('click', (e) => { share(text, e.currentTarget); track('puzzle_share', { game: current }); });
        const nb = card.querySelector('.pz-next');
        if (nb) nb.addEventListener('click', () => { current = nb.dataset.game; show(); });
        paintTabs();
      }
    });
  }
  show();
}
