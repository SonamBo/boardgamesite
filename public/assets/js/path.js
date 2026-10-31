// The learning path (/learn/<game>/path): a Duolingo-style winding path of lessons, unit by unit.
// Lessons unlock in order; "Jump here?" lets a player test out of the units before; each unit ends with a gift
// chest; the practice-ladder bots wait at the end. Lesson pages still open directly (search visitors), and a lesson
// finished that way shows as done here.
import { progress, streak, openChest, jumpTo } from './learn-progress.js';
import { ratingOf, show, BOTS, beatenBots } from './rating.js';
import { pieceSvg } from './chess-pieces.js';
import { runLesson } from './lesson.js';
import { confetti, countUp } from './confetti.js';
import { track } from './firebase.js';
import { onProgressLoaded } from './store.js';

const GAMES = [
  { game: 'chess', name: 'Chess', icon: 'piece:N' },
  { game: 'checkers', name: 'Checkers', icon: 'ck' },
  { game: 'mancala', name: 'Mancala', icon: 'seeds' }
];
const UNIT_COLORS = ['#8A2443', '#2F5568', '#5C4A1E', '#55306A', '#2F5E46', '#6B3A2A', '#34465E'];
const MASCOTS = ['mascot-wave', 'mascot-confused', 'mascot-trophy'];
const WAVE = [0, -1, -2, -1, 0, 1, 2, 1];          // the path's sideways swing, node by node
const CHEST_XP = 30, JUMP_PASS = 2;              // a jump test allows up to 2 mistakes
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function iconHtml(icon) {
  if (!icon) return '';
  if (icon.startsWith('piece:')) return '<span class="ni ni-piece">' + pieceSvg(icon.slice(6)) + '</span>';
  if (icon === 'ck') return '<span class="ni ni-ck"></span>';
  if (icon === 'ck-king') return '<span class="ni ni-ck"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18h18l-1.6-10.5-4.6 4.2L12 4.5 9.2 11.7 4.6 7.5z"/></svg></span>';
  if (icon === 'seeds') return '<span class="ni ni-seeds"><i></i><i></i><i></i></span>';
  return '<span class="ni ni-text' + ([...icon].length > 2 ? ' small' : '') + '">' + esc(icon) + '</span>';
}

const root = document.getElementById('lpath');
if (root) start(root);

async function start(el) {
  const game = el.dataset.game;
  let course;
  try { course = await (await fetch('/assets/learn/' + game + '.json')).json(); }
  catch (e) { el.querySelector('.lpath-body').innerHTML = '<p class="muted">The path couldn’t load. Check your connection and refresh.</p>'; return; }
  const render = () => paint(el, game, course);
  render();
  onProgressLoaded(render);
  // scroll the next lesson into view
  const cur = el.querySelector('.pnode.cur, .pchest.ready');
  if (cur) cur.scrollIntoView({ block: 'center' });
  // just finished a lesson: let its node pop
  const just = sessionStorage.getItem('bgs-path-just');
  if (just) {
    sessionStorage.removeItem('bgs-path-just');
    const n = el.querySelector('[data-slug="' + CSS.escape(just) + '"]');
    if (n) n.classList.add('pop');
  }
}

// Where the player is: which lessons count as passed, the frontier lesson, and what's unlocked.
function stateOf(game, course) {
  const p = progress(game);
  const flat = [];
  course.units.forEach((u, ui) => u.lessons.forEach((l, li) => flat.push({ ...l, ui, li, unit: u })));
  const passed = (x) => !!p.done[x.slug] || x.ui < p.jump;
  let frontier = flat.findIndex((x) => !passed(x));
  if (frontier < 0) frontier = flat.length;
  const checkUnit = course.units.findIndex((u) => u.stage === 'check');
  const checkEnd = flat.findIndex((x) => x.ui > checkUnit);
  const ladderOpen = checkUnit < 0 || frontier >= (checkEnd < 0 ? flat.length : checkEnd);
  return { p, flat, passed, frontier, ladderOpen };
}

function paint(el, game, course) {
  const S = stateOf(game, course);
  const g = GAMES.find((x) => x.game === game);
  const r = ratingOf(game);

  // ---- stats bar ----
  el.querySelector('.lpath-bar').innerHTML =
    '<nav class="lpath-games" aria-label="Choose a game">' + GAMES.map((x) => '<a href="/learn/' + x.game + '/path"' + (x.game === game ? ' aria-current="page"' : '') + ' title="' + x.name + '">' + iconHtml(x.icon) + '<span class="sr-only">' + x.name + '</span></a>').join('') + '</nav>' +
    '<span class="lpath-stat" title="Day streak">🔥 <b>' + streak() + '</b></span>' +
    '<span class="lpath-stat" title="' + g.name + ' XP">⭐ <b>' + S.p.xp + '</b> <small>XP</small></span>' +
    '<a class="lpath-stat rating" href="#ladder" title="Your ' + g.name + ' BGS Rating">♛ <b>' + (r.n ? show(r) : '–') + '</b></a>';

  // ---- units and nodes ----
  const body = el.querySelector('.lpath-body');
  let html = '', idx = 0;
  const nextUnit = S.frontier < S.flat.length ? S.flat[S.frontier].ui + 1 : -1;
  course.units.forEach((u, ui) => {
    const color = UNIT_COLORS[ui % UNIT_COLORS.length];
    const firstIdx = idx;
    html += '<section class="punit" style="--uc:' + color + '" aria-labelledby="unit-' + ui + '">' +
      '<div class="punit-head"><div><p class="punit-kicker">' + (u.stage === 'strategy' ? 'Strategy' : u.stage === 'check' ? 'Rules check' : 'Rules') + ' · Unit ' + (ui + 1) + '</p><h2 id="unit-' + ui + '">' + esc(u.name) + '</h2><p>' + esc(u.blurb) + '</p></div>' +
      '<a class="punit-guide" href="/learn/' + game + '#path" title="Read about this unit" aria-label="Unit guide"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5z"/></svg></a></div>';
    html += '<div class="ptrack">';
    const jumpRow = ui === nextUnit && ui > 0 && firstIdx > S.frontier;
    // mascot beside the path, on the side the path swings away from (rows 1–3 swing left, 5–7 right)
    const side = ui % 2 && u.lessons.length >= 7 ? 'left' : 'right';
    html += '<img class="pmascot ' + side + (firstIdx > S.frontier ? ' dim' : '') + '" style="--row:' + ((jumpRow ? 1 : 0) + (side === 'left' ? 5 : 1)) + '" src="/assets/img/' + MASCOTS[ui % MASCOTS.length] + '.webp" alt="" width="280" height="272" loading="lazy">';
    if (jumpRow && ui > 0 && firstIdx > S.frontier) {
      html += '<div class="prow"><div class="pjump-wrap"><span class="pbubble jump">Jump here?</span><button type="button" class="pnode jump" data-jump="' + ui + '" aria-label="Jump here: take a short test to skip ahead to unit ' + (ui + 1) + '"><span class="ni ni-text">⏩</span></button></div></div>';
    }
    u.lessons.forEach((l, li) => {
      const i = idx++;
      const x = S.flat[i];
      const done = !!S.p.done[l.slug], passed = S.passed(x);
      const cls = done || passed ? 'done' : i === S.frontier ? 'cur' : 'locked';
      const off = WAVE[li % WAVE.length];
      html += '<div class="prow" style="--off:' + off + '">' +
        (cls === 'cur' ? '<span class="pbubble">' + (S.frontier === 0 ? 'Start' : 'Next') + '</span>' : '') +
        '<button type="button" class="pnode ' + cls + '" data-i="' + i + '" data-slug="' + l.slug + '" aria-label="' + esc(l.title) + (cls === 'done' ? ' (done)' : cls === 'locked' ? ' (locked)' : ' (up next)') + '">' +
        (cls === 'done' && !l.icon ? '✓' : iconHtml(l.icon)) + (cls === 'locked' ? '<span class="plock" aria-hidden="true">🔒</span>' : '') + (cls === 'done' ? '<span class="pcheck" aria-hidden="true">✓</span>' : '') + '</button></div>';
    });
    // the unit's gift chest
    const unitDone = u.lessons.every((l) => S.passed(S.flat.find((x) => x.slug === l.slug)));
    const opened = !!S.p.chests[u.id];
    const cstate = opened ? 'opened' : unitDone ? 'ready' : 'locked';
    html += '<div class="prow" style="--off:' + WAVE[u.lessons.length % WAVE.length] + '"><button type="button" class="pchest ' + cstate + '" data-chest="' + u.id + '" aria-label="Gift chest: ' +
      (opened ? 'opened' : unitDone ? 'ready to open, +' + CHEST_XP + ' XP' : 'finish the unit to open it') + '">' + (opened ? '📭' : '🎁') + '</button></div>';
    html += '</div>';
    html += '</section>';
  });

  // ---- practice ladder ----
  if (course.ladder) {
    const beaten = beatenBots(game);
    const nextBot = course.ladder.find((b) => !beaten[b.id]);
    html += '<section class="punit ladder" id="ladder" aria-labelledby="ladder-h"><div class="punit-head"><div><p class="punit-kicker">Practice ladder · BGS Rating</p><h2 id="ladder-h">Rated games</h2>' +
      '<p>' + (S.ladderOpen ? 'Beat each bot to climb. Every game counts towards your BGS Rating, which starts at 800.' : 'Pass the rules check to unlock rated games.') + '</p></div></div><div class="ptrack">';
    course.ladder.forEach((b, k) => {
      const st = !S.ladderOpen ? 'locked' : beaten[b.id] ? 'done' : b === nextBot ? 'cur' : 'open';
      html += '<div class="prow" style="--off:' + [1, -1, 0][k % 3] + '">' + (st === 'cur' ? '<span class="pbubble">Play</span>' : '') +
        (S.ladderOpen ? '<a' : '<span') + ' class="pboss ' + st + '"' + (S.ladderOpen ? ' href="/play/' + game + '?bot=' + b.id + '"' : '') + ' aria-label="' + esc(b.name) + ', rated ' + b.rating + (st === 'done' ? ' (beaten)' : '') + '">' +
        '<span class="pboss-face">' + ({ penny: '🐣', mira: '🦊', monocle: '🧐' }[b.id] || esc(b.name[0])) + '</span><span class="pboss-name">' + esc(b.name) + '<small>' + b.rating + '</small></span>' + (st === 'done' ? '<span class="pcheck">✓</span>' : st === 'locked' ? '<span class="plock">🔒</span>' : '') +
        (S.ladderOpen ? '</a>' : '</span>') + '</div>';
    });
    html += '</div></section>';
  }
  body.innerHTML = html;
  body.onclick = (e) => onTap(e, el, game, course);
}

// ---- taps: a lesson card, a chest, or a jump test ----
function onTap(e, el, game, course) {
  const node = e.target.closest('.pnode, .pchest');
  const old = el.querySelector('.ppop');
  if (old && !e.target.closest('.ppop')) { const was = old.dataset.for; old.remove(); if (node && node.dataset.i === was) return; }
  if (!node) return;
  const S = stateOf(game, course);
  if (node.dataset.jump) return jumpTest(el, game, course, Number(node.dataset.jump));
  if (node.dataset.chest) return chest(el, game, course, node);
  const i = Number(node.dataset.i), l = S.flat[i];
  const cls = node.classList.contains('locked') ? 'locked' : node.classList.contains('done') ? 'done' : 'cur';
  const pop = document.createElement('div');
  pop.className = 'ppop ' + cls;
  pop.dataset.for = String(i);
  pop.style.setProperty('--uc', UNIT_COLORS[l.ui % UNIT_COLORS.length]);
  const n = l.unit.lessons.length;
  pop.innerHTML = '<p class="ppop-title">' + esc(l.title) + '</p><p class="ppop-sub">' + (cls === 'locked' ? 'Finish the lessons above to unlock this one.' : 'Lesson ' + (l.li + 1) + ' of ' + n + ' · ' + esc(l.unit.name)) + '</p>' +
    (cls === 'locked' ? '<span class="ppop-btn off">Locked</span>'
      : '<a class="ppop-btn" href="/learn/' + game + '/' + l.slug + '?from=path">' + (cls === 'done' ? 'Practise again' : 'Start +' + (l.xp || 20) + ' XP') + '</a>');
  node.parentElement.appendChild(pop);
}

function chest(el, game, course, node) {
  if (!node.classList.contains('ready')) {
    node.classList.remove('shake'); void node.offsetWidth; node.classList.add('shake');
    return;
  }
  const unitId = node.dataset.chest;
  if (!openChest(game, unitId, CHEST_XP)) return;
  track('chest_open', { game, unit: unitId });
  const rect = node.getBoundingClientRect();
  confetti({ x: (rect.left + rect.width / 2) / innerWidth, y: rect.top / innerHeight, count: 90 });
  node.classList.add('opening');
  const toast = document.createElement('div');
  toast.className = 'pxp-toast';
  toast.innerHTML = '+<b>0</b> XP';
  node.parentElement.appendChild(toast);
  countUp(toast.querySelector('b'), CHEST_XP);
  setTimeout(() => paint(el, game, course), 1400);
}

// "Jump here?": a short test from the units being skipped. Pass it and those units count as done.
function jumpTest(el, game, course, unitIndex) {
  const pool = [];
  course.units.slice(0, unitIndex).forEach((u) => u.lessons.forEach((l) => l.steps.forEach((s) => {
    if (s.type !== 'info' && s.position !== undefined && !(s.type === 'tap' && s.targets.length > 6)) pool.push(s);
  })));
  const want = Math.min(6, pool.length);
  const steps = Array.from({ length: want }, (_, k) => pool[Math.floor(((k + 0.5) * pool.length) / want)]);
  const box = document.createElement('div');
  box.className = 'jtest';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Jump test');
  box.innerHTML = '<div class="jtest-inner"><div class="jtest-head"><p>Jump to unit ' + (unitIndex + 1) + ': ' + esc(course.units[unitIndex].name) + '</p><button type="button" class="jtest-x" aria-label="Close">✕</button></div><div class="jtest-stage"></div></div>';
  document.body.appendChild(box);
  document.body.classList.add('jtest-open');
  const close = () => { box.remove(); document.body.classList.remove('jtest-open'); paint(el, game, course); };
  box.querySelector('.jtest-x').addEventListener('click', close);
  track('jump_start', { game, unit: unitIndex });
  const lesson = { slug: 'jump', title: 'Jump test', xp: 0, steps, unit: { name: 'Jump test', lessons: [] } };
  runLesson(box.querySelector('.jtest-stage'), course, lesson, null, 0, {
    kicker: 'Jump test · ' + want + ' questions · up to ' + JUMP_PASS + ' mistakes allowed',
    finish(card, mistakes) {
      const ok = mistakes <= JUMP_PASS;
      track('jump_end', { game, unit: unitIndex, passed: ok, mistakes });
      if (ok) { jumpTo(game, unitIndex); confetti(); }
      card.innerHTML = '<div class="lp-done-head"><p class="lp-done-title">' + (ok ? 'You jumped ahead!' : 'Not quite yet') + '</p></div>' +
        '<p class="text-2" style="margin:0">' + (ok ? 'Unit ' + (unitIndex + 1) + ' is unlocked. The lessons you skipped are still there whenever you want them.'
          : mistakes + ' mistakes this time. The lessons before this unit will get you there, or try the test again.') + '</p>' +
        '<button type="button" class="btn btn-gold btn-block jt-done">' + (ok ? 'Continue' : 'Back to the path') + '</button>' +
        (ok ? '' : '<button type="button" class="link-btn jt-again">Try the test again</button>');
      card.querySelector('.jt-done').addEventListener('click', close);
      const again = card.querySelector('.jt-again');
      if (again) again.addEventListener('click', () => { box.remove(); jumpTest(el, game, course, unitIndex); });
    }
  });
}
