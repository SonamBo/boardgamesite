// The home page for returning players: what to do next (continue learning, today's challenges, play again)
// instead of the welcome hero. New visitors see the hero as before.
import { store } from './store.js';
import { progress, streak, activeToday, totalXp, LEARN_GAMES } from './learn-progress.js';
import { todayProgress } from './daily.js';
import { GAMES } from './games-data.js';
import { shouldWelcome, welcome, GOALS } from './welcome.js';

const box = document.getElementById('welcome-back');
const NAME = { chess: 'Chess', checkers: 'Checkers', mancala: 'Mancala' };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const gameBySlug = Object.fromEntries(GAMES.map((g) => [g.slug, g]));

function returning() {
  const recent = store.get('bgs-recent', []) || [];
  const act = store.get('bgs-activity', {}) || {};
  return recent.length > 0 || !!store.get('bgs-goal', 0) || totalXp() > 0 || Object.keys(act).length > 0 || todayProgress().done > 0 || !!store.get('bgs-daily-log', null);
}

async function nextLesson() {
  // the learning path touched most recently, or Chess for someone who hasn't started one
  const last = (g) => Math.max(0, ...Object.values(progress(g).done));
  const started = LEARN_GAMES.filter((g) => last(g) > 0).sort((a, b) => last(b) - last(a));
  const picked = store.get('bgs-onboarded', null);
  const game = started[0] || (LEARN_GAMES.includes(picked) ? picked : 'chess');
  try {
    const course = await (await fetch('/assets/learn/' + game + '.json')).json();
    const all = course.units.flatMap((u) => u.lessons);
    const done = progress(game).done;
    const next = all.find((l) => !done[l.slug]);
    const n = all.filter((l) => done[l.slug]).length;
    return { game, next, n, total: all.length, started: started.length > 0 };
  } catch (e) {
    return { game, next: null, n: 0, total: 0, started: started.length > 0 };
  }
}

function todayPoints() {
  const a = store.get('bgs-activity', {}) || {};
  const d = new Date(), p = (n) => String(n).padStart(2, '0');
  const k = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  return Object.values(a[k] || {}).reduce((n, v) => n + v, 0);
}
function paintGoal() {
  const el = box.querySelector('.wb-goal');
  const goal = Number(store.get('bgs-goal', 0)) || 0;
  if (!goal) { el.hidden = true; return; }
  el.hidden = false;
  const pts = todayPoints();
  el.querySelector('.wb-goal-bar span').style.width = Math.min(100, Math.round((pts / goal) * 100)) + '%';
  el.classList.toggle('met', pts >= goal);
  const sel = el.querySelector('select');
  sel.innerHTML = GOALS.map((g) => '<option value="' + g.id + '"' + (g.id === goal ? ' selected' : '') + '>' + g.name + ' goal</option>').join('');
  sel.onchange = () => { store.set('bgs-goal', Number(sel.value)); paintGoal(); };
  el.querySelector('small').textContent = pts >= goal ? 'Goal met today!' : Math.min(pts, goal) + ' of ' + goal + ' points today';
}

async function paint() {
  if (!box) return;
  if (!returning()) {
    // give a signed-in player's saved progress a moment to arrive before treating them as new
    if (shouldWelcome()) setTimeout(() => { if (!returning() && shouldWelcome() && !document.querySelector('.onb')) welcome(); }, 700);
    return;
  }
  document.body.classList.add('returning');
  box.hidden = false;
  const days = streak(), today = activeToday();
  box.querySelector('.wb-streak').textContent = days
    ? (today ? '🔥 ' + days + '-day streak. Nice work today!' : '🔥 ' + days + '-day streak. Do one thing today to keep it going.')
    : 'Start a streak today: one lesson, puzzle or daily challenge.';
  paintGoal();
  box.querySelector('.wb-fox').src = '/assets/img/' + (today ? 'fox-jump' : days ? 'fox-flame' : 'fox-wave') + '.webp';

  const cards = [];
  // 1. continue learning
  const L = await nextLesson();
  if (L.next) {
    cards.push('<a class="wb-card wb-learn card" href="/learn/' + L.game + '/' + L.next.slug + '?from=path">' +
      '<span class="wb-kicker">' + (L.started ? 'Continue learning · ' + NAME[L.game] : 'Learn ' + NAME[L.game] + ' step by step') + '</span>' +
      '<b>' + esc(L.next.title) + '</b>' +
      '<span class="wb-bar" aria-hidden="true"><span style="width:' + Math.round((L.n / Math.max(1, L.total)) * 100) + '%"></span></span>' +
      '<span class="wb-sub">' + (L.started ? 'Lesson ' + (L.n + 1) + ' of ' + L.total : L.total + ' hands-on lessons') + '</span>' +
      '<span class="btn btn-gold">' + (L.started ? 'Continue' : 'Start') + '</span></a>');
  } else {
    cards.push('<a class="wb-card wb-learn card" href="/learn/' + L.game + '/path"><span class="wb-kicker">' + NAME[L.game] + ' path complete</span><b>Climb the practice ladder</b>' +
      '<span class="wb-sub">Rated games for your BGS Rating</span><span class="btn btn-gold">Open the path</span></a>');
  }
  // 2. today's challenges
  const tp = todayProgress();
  cards.push('<a class="wb-card wb-daily card" href="/daily"><span class="wb-kicker">Today’s challenges · ' + tp.done + ' of ' + tp.total + ' done</span>' +
    '<b>' + (tp.done === tp.total ? 'All done for today!' : tp.games.filter((g) => !g.done).map((g) => g.name).join(', ')) + '</b>' +
    '<span class="wb-ticks">' + tp.games.map((g) => '<span class="' + (g.solved ? 'ok' : g.done ? 'miss' : '') + '">' + (g.solved ? '✓' : g.done ? '✗' : '') + '<small>' + esc(g.name) + '</small></span>').join('') + '</span>' +
    '<span class="btn ' + (tp.done === tp.total ? 'btn-outline' : 'btn-gold') + '">' + (tp.done === tp.total ? 'See results' : 'Play today’s challenges') + '</span></a>');
  // 3. play again
  const recent = (store.get('bgs-recent', []) || []).filter((s) => gameBySlug[s]);
  if (recent.length) {
    const g = gameBySlug[recent[0]];
    cards.push('<a class="wb-card wb-again card" href="/play/' + g.slug + '"><img src="/assets/img/thumb/' + g.slug + '.webp" alt="" width="480" height="360">' +
      '<span class="wb-kicker">Play again</span><b>' + esc(g.name) + '</b><span class="btn btn-gold">Play</span></a>');
  }
  box.querySelector('.wb-cards').innerHTML = cards.join('');
  if (recent.length > 1) {
    const row = box.querySelector('.wb-recent');
    row.hidden = false;
    row.querySelector('.wb-recent-row').innerHTML = recent.slice(1, 7).map((s) => {
      const g = gameBySlug[s];
      return '<a class="wb-mini card" href="/play/' + s + '"><img src="/assets/img/thumb/' + s + '.webp" alt="" width="480" height="360" loading="lazy"><span>' + esc(g.name) + '</span></a>';
    }).join('');
  }
}
paint();
window.addEventListener('bgs-progress', paint);
