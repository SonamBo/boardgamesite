// The player dashboard (/dashboard): learning progress, BGS Ratings, activity, daily puzzles and what to learn next.
// Everything comes from this browser's saved progress (synced to the account when signed in).
import { progress, streak, ACTIVITY, dayKey } from './learn-progress.js';
import { ratingOf, show, settlePending, nextBot, isProvisional } from './rating.js';
import { todayProgress, dailyStreak, noteToday } from './daily.js';
import { GAMES } from './games-data.js';
import { store, onProgressLoaded } from './store.js';
import { whenReady, displayName } from './accounts.js';

const COURSES = ['chess', 'checkers', 'mancala'];
const NAME = { chess: 'Chess', checkers: 'Checkers', mancala: 'Mancala' };
const COLORS = ['#CFAA62', '#B8465F', '#EFE6D8', '#7E6A70', '#5FA36B', '#6B8FC4'];
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const WEEK = 7 * 864e5;
let courses = {}, recPick = 0, userName = '';

settlePending();
load();

async function load() {
  await Promise.all(COURSES.map(async (g) => {
    try { courses[g] = await (await fetch('/assets/learn/' + g + '.json')).json(); } catch (e) { /* offline: skip that game */ }
  }));
  paint();
  whenReady().then((u) => { if (u) { userName = displayName(u).split(' ')[0]; $('dash-foot').hidden = true; paint(); } });
  onProgressLoaded(paint);   // the account's saved progress arrived
}

function lessonsOf(g) { return courses[g] ? courses[g].units.flatMap((u) => u.lessons) : []; }

function courseState(g) {
  const all = lessonsOf(g), done = progress(g).done;
  const finished = all.filter((l) => done[l.slug]);
  const next = all.find((l) => !done[l.slug]) || null;
  const recent = Object.values(done).filter((t) => Date.now() - t < WEEK).length;
  return { all, finished, next, recent, started: finished.length > 0, complete: all.length > 0 && !next };
}

function greeting() {
  const h = new Date().getHours();
  return (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening') + (userName ? ', ' + userName : '');
}

function paint() {
  const st = Object.fromEntries(COURSES.map((g) => [g, courseState(g)]));
  const total = COURSES.reduce((n, g) => n + st[g].all.length, 0);

  // ---- hero: the single best next step ----
  const inProgress = COURSES.filter((g) => st[g].started && !st[g].complete)
    .sort((a, b) => Math.max(0, ...Object.values(progress(b).done)) - Math.max(0, ...Object.values(progress(a).done)))[0];
  const ladderNext = COURSES.find((g) => st[g].complete && ratingOf(g).n < 5);
  $('dash-hi').textContent = greeting();
  // the fox: yawning when a streak has lapsed, jumping once today's challenges are all done, otherwise ready to play
  const act0 = store.get(ACTIVITY, {}) || {};
  const lapsed = !streak() && Object.keys(act0).length > 0;
  const tp0 = todayProgress();
  const pose = lapsed ? 'fox-yawn' : tp0.done === tp0.total ? 'fox-jump' : 'fox-kneel';
  document.querySelector('.dash-hero img').src = '/assets/img/' + pose + '.webp';
  const cta = $('dash-cta');
  if (inProgress) {
    const s = st[inProgress], left = s.all.length - s.finished.length;
    $('dash-next').textContent = 'You’re ' + s.finished.length + ' lessons into ' + NAME[inProgress] + ', with ' + left + ' to go. Each one takes a minute or two.';
    cta.textContent = 'Continue: ' + s.next.title;
    cta.href = '/learn/' + inProgress + '/' + s.next.slug;
  } else if (ladderNext) {
    const bot = nextBot(ladderNext);
    $('dash-next').textContent = 'You’ve finished the ' + NAME[ladderNext] + ' path. Play rated games on the practice ladder to earn your BGS Rating.';
    cta.textContent = 'Play ' + bot.name + ' (' + bot.rating + ')';
    cta.href = '/play/' + ladderNext + '?bot=' + bot.id;
  } else {
    const g = COURSES.find((x) => !st[x].started) || 'chess';
    const first = lessonsOf(g)[0];
    $('dash-next').textContent = COURSES.some((x) => st[x].started)
      ? 'Ready for a new game? The ' + NAME[g] + ' path starts with the rules and takes a few minutes a day.'
      : 'Pick a game to learn. Every path starts with the rules, then strategy, then rated games for your BGS Rating.';
    cta.textContent = 'Start learning ' + NAME[g];
    cta.href = first ? '/learn/' + g + '/' + first.slug : '/learn/' + g;
  }
  if (lapsed) $('dash-next').textContent = 'Your streak needs waking up! ' + $('dash-next').textContent;

  // ---- stats ----
  const lessonsDone = COURSES.reduce((n, g) => n + st[g].finished.length, 0);
  const lessonsWeek = COURSES.reduce((n, g) => n + st[g].recent, 0);
  $('st-lessons').textContent = lessonsDone;
  $('st-lessons-s').textContent = lessonsWeek ? '+' + lessonsWeek + ' this week' : 'of ' + total;
  const log = store.get('bgs-puzzles', {}) || {};
  const solved = Object.values(log).reduce((n, d) => n + Object.keys(d || {}).length, 0);
  const weekAgo = dayKey(new Date(Date.now() - 6 * 864e5));
  const solvedWeek = Object.entries(log).filter(([d]) => d >= weekAgo).reduce((n, [, v]) => n + Object.keys(v || {}).length, 0);
  $('st-puzzles').textContent = solved;
  $('st-puzzles-s').textContent = solvedWeek ? '+' + solvedWeek + ' this week' : 'New ones every day';
  const rated = COURSES.map((g) => ({ g, p: ratingOf(g) })).filter((x) => x.p.n > 0).sort((a, b) => b.p.r - a.p.r);
  if (rated.length) {
    $('st-rating').textContent = show(rated[0].p);
    $('st-rating-s').textContent = NAME[rated[0].g] + (isProvisional(rated[0].p) ? ' · provisional' : '');
  }
  const days = streak();
  $('st-streak').textContent = days;
  $('st-streak-s').textContent = days ? (days === 1 ? 'day' : 'days') + ' in a row' : 'Do a lesson or puzzle today';

  // ---- this week's activity ----
  const act = store.get(ACTIVITY, {}) || {};
  const week = [];
  for (let k = 6; k >= 0; k--) {
    const d = new Date(Date.now() - k * 864e5);
    const v = Object.values(act[dayKey(d)] || {}).reduce((a, b) => a + b, 0);
    week.push({ d: d.toLocaleDateString('en-GB', { weekday: 'short' }), v, today: k === 0 });
  }
  const max = Math.max(1, ...week.map((w) => w.v));
  const bars = $('dash-bars');
  bars.setAttribute('aria-label', 'Activity this week: ' + week.map((w) => w.d + ' ' + w.v).join(', '));
  bars.innerHTML = week.map((w) => '<div class="dash-bar' + (w.today ? ' today' : '') + '"><span class="v">' + (w.v || '') + '</span><span class="b" style="height:' + Math.max(3, Math.round((w.v / max) * 100)) + '%"></span><span class="d">' + w.d + '</span></div>').join('');

  // ---- share of activity by game, last 30 days ----
  const since = dayKey(new Date(Date.now() - 29 * 864e5));
  const byGame = {};
  for (const [d, games] of Object.entries(act)) if (d >= since) for (const [g, v] of Object.entries(games || {})) byGame[g] = (byGame[g] || 0) + v;
  const entries = Object.entries(byGame).sort((a, b) => b[1] - a[1]);
  const sum = entries.reduce((n, [, v]) => n + v, 0);
  const donut = $('dash-donut'), legend = $('dash-legend');
  if (!sum) {
    donut.style.background = 'var(--surface-2)';
    donut.setAttribute('aria-label', 'No activity yet');
    legend.innerHTML = '<li class="muted">Nothing yet this month. Your first lesson will show up here.</li>';
  } else {
    let at = 0;
    const stops = entries.map(([, v], k) => { const a = at; at += (v / sum) * 360; return COLORS[k % COLORS.length] + ' ' + a.toFixed(1) + 'deg ' + at.toFixed(1) + 'deg'; });
    donut.style.background = 'conic-gradient(' + stops.join(', ') + ')';
    donut.setAttribute('aria-label', entries.map(([g, v]) => (NAME[g] || g) + ' ' + Math.round((v / sum) * 100) + '%').join(', '));
    legend.innerHTML = entries.slice(0, 6).map(([g, v], k) => '<li><i style="background:' + COLORS[k % COLORS.length] + '"></i><span>' + esc(NAME[g] || g) + '</span><b>' + Math.round((v / sum) * 100) + '%</b></li>').join('');
  }

  // ---- continue learning ----
  $('dash-games').innerHTML = COURSES.map((g) => {
    const s = st[g], p = ratingOf(g);
    const pct = s.all.length ? Math.round((s.finished.length / s.all.length) * 100) : 0;
    const href = '/learn/' + g + '/path';
    const line = s.complete ? 'Path complete · next: ' + nextBot(g).name + ' on the ladder' : s.started ? 'Next: ' + s.next.title : 'Not started · ' + s.all.length + ' lessons';
    return '<a class="dash-game" href="' + href + '"><span class="dash-badge">' + NAME[g][0] + '</span><span class="dash-game-body"><span class="dash-game-name">' + NAME[g] +
      ' <span class="muted">· ' + (p.n ? 'BGS ' + show(p) : 'unrated') + '</span></span><span class="dash-game-line">' + esc(line) +
      '</span><span class="dash-prog"><span style="width:' + pct + '%"></span></span></span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></a>';
  }).join('');

  // ---- learn next ----
  const recs = recommendations(st);
  const r = recs[recPick % recs.length];
  $('dash-rec').innerHTML = '<span class="dash-rec-tag">' + esc(r.tag) + '</span><p class="dash-rec-name">' + esc(r.name) + '</p><p class="text-2">' + esc(r.why) + '</p><a class="btn btn-gold" href="' + r.href + '">' + esc(r.cta) + '</a>';
  $('rec-another').hidden = recs.length < 2;

  // ---- daily puzzles ----
  noteToday();
  const tp = todayProgress(), ps = dailyStreak();
  $('pz-t').textContent = 'Today’s challenges: ' + tp.done + ' of ' + tp.total + ' done';
  const waiting = tp.games.filter((g) => !g.done).map((g) => g.name);
  $('pz-s').textContent = waiting.length
    ? waiting.join(' and ').replace(/ and (?=.* and )/, ', ') + (waiting.length === 1 ? ' is' : ' are') + ' waiting.' + (ps > 1 ? ' Keep your ' + ps + '-day streak going.' : '')
    : 'All done for today. New challenges at midnight.';
}

// What to learn next: unstarted learning paths first, then guides for games like the ones the player plays most.
function recommendations(st) {
  const out = [];
  for (const g of COURSES) {
    if (st[g].started) continue;
    const first = lessonsOf(g)[0];
    out.push({ tag: 'Learning path · ' + st[g].all.length + ' lessons', name: NAME[g], cta: 'Start learning',
      href: first ? '/learn/' + g + '/' + first.slug : '/learn/' + g,
      why: { chess: 'The world’s favourite strategy game. Start with how the pieces move, finish with checkmate patterns and a BGS Rating.',
        checkers: 'Learn the rules in five minutes, then the forcing jumps that win games. Quick to learn, deep to master.',
        mancala: 'An ancient counting game. Learn sowing, free turns and captures, then plan chains of free turns.' }[g] });
  }
  // the player's most-played games, by category
  const plays = GAMES.map((g) => {
    const v = store.get(g.key, null) || {};
    return { ...g, n: (v.w || 0) + (v.l || 0) + (v.d || 0) + (v.played || 0) };
  });
  const fav = plays.filter((g) => g.n).sort((a, b) => b.n - a.n);
  const favCats = [...new Set(fav.map((g) => g.cat))];
  for (const cat of favCats) {
    const top = fav.find((g) => g.cat === cat);
    for (const g of plays.filter((x) => x.cat === cat && !x.n && !COURSES.includes(x.slug)).slice(0, 2)) {
      out.push({ tag: 'Guide · rules in a few minutes', name: g.name, cta: 'Learn ' + g.name, href: '/learn/' + g.slug,
        why: 'You play a lot of ' + top.name + '. ' + g.name + ' is another game in the same family, and the guide gets you playing in minutes.' });
    }
  }
  if (!out.length) out.push({ tag: 'Daily puzzles', name: 'Keep your skills sharp', cta: 'Play today’s challenges', href: '/daily', why: 'You’ve started every learning path. Three daily challenges keep the ideas fresh.' });
  return out;
}

$('rec-another').addEventListener('click', () => { recPick++; paint(); });
