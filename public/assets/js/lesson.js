// The lesson player on /learn/<game>/<lesson> pages.
// The page holds <div id="lesson" data-course="chess" data-lesson="how-the-knight-moves"></div>;
// the course comes from /assets/learn/<game>.json (built from src/courses/<game>.json by build.py).
//
// Step types (see src/courses/README.md for the full format):
//   info    explanation with a board to look at
//   tap     tap every target square (or, with "pick": true, the one right answer)
//   move    make the right move: "accept" (move names), "goal" (check, mate, capture, castle, promote, king, again)
//           or "line" (a sequence: your move, the reply, your move…)
//   choice  a multiple-choice question
import { makeBoard } from './learn-boards.js';
import { complete, isDone } from './learn-progress.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { confetti, countUp } from './confetti.js';

const root = document.getElementById('lesson');
if (root) start(root);

async function start(el) {
  const game = el.dataset.course, slug = el.dataset.lesson;
  let course;
  try {
    course = await (await fetch('/assets/learn/' + game + '.json')).json();
  } catch (e) {
    el.innerHTML = '<p class="muted">The interactive lesson couldn’t load. Check your connection and refresh.</p>';
    return;
  }
  const flat = course.units.flatMap((u) => u.lessons.map((l) => ({ ...l, unit: u })));
  const at = flat.findIndex((l) => l.slug === slug);
  if (at < 0) return;
  runLesson(el, course, flat[at], flat[at + 1] || null, at);
}

// opts.finish(card, mistakes): replaces the normal end-of-lesson card (daily puzzles, jump tests).
// opts.autoFinish: finish straight after the last step is solved, with no Continue button (daily puzzles).
export function runLesson(el, course, lesson, next, index, opts = {}) {
  el.innerHTML = `
  <div class="lp">
    <div class="lp-top">
      ${opts.finish ? '' : '<a class="lp-x" href="/learn/' + course.game + '/path" aria-label="Back to the ' + course.name + ' path">✕</a>'}
      <div class="lp-bar" aria-hidden="true"><span></span></div>
      <span class="lp-count"></span>
    </div>
    <div class="lp-main">
      <div class="lp-board-wrap"><div class="lp-board-el"></div></div>
      <div class="lp-card card">
        <p class="lp-kicker"></p>
        <div class="lp-text"></div>
        <div class="lp-choices"></div>
        <div class="lp-pips" aria-hidden="true"></div>
        <p class="lp-feedback" role="status" aria-live="polite"></p>
        <div class="lp-actions">
          <button type="button" class="btn btn-outline lp-retry" hidden>Try again</button>
          <button type="button" class="btn btn-gold lp-next" disabled>Continue</button>
        </div>
      </div>
    </div>
  </div>`;
  const $ = (s) => el.querySelector(s);
  if (opts.autoFinish) $('.lp').classList.add('lp-puzzle');   // a puzzle finishes by itself: no Continue button
  const boardWrap = $('.lp-board-wrap');
  const board = makeBoard(course.board, $('.lp-board-el'));
  const steps = lesson.steps;
  let k = 0, tries = 0, mistakes = 0, firstTry = 0, started = false;
  let timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

  const kicker = opts.kicker || lesson.unit.name + ' · Lesson ' + (lesson.unit.lessons.indexOf(lesson.unit.lessons.find((l) => l.slug === lesson.slug)) + 1);
  $('.lp-kicker').textContent = kicker;

  function setProgress() {
    $('.lp-bar span').style.width = Math.round((k / steps.length) * 100) + '%';
    $('.lp-count').textContent = (k + 1) + ' / ' + steps.length;
  }
  function feedback(text, kind) {
    const f = $('.lp-feedback');
    f.textContent = text || '';
    f.className = 'lp-feedback' + (kind ? ' ' + kind : '');
  }
  function ready(text) {
    if (!tries) firstTry++;   // an interactive step solved without a mistake
    feedback(text || 'Well done.', 'good');
    board.interactive(false);
    board.onTap(null);
    const n = $('.lp-next');
    n.disabled = false;
    n.textContent = k === steps.length - 1 ? 'Finish lesson' : 'Continue';
    n.focus({ preventScroll: true });
    // a daily puzzle goes straight to its result card
    if (opts.autoFinish && k === steps.length - 1) { n.disabled = true; later(finish, 900); }
    if (!started && !opts.finish) { started = true; track('lesson_start', { game: course.game, lesson: lesson.slug }); }
  }

  function show() {
    const s = steps[k];
    timers.forEach(clearTimeout);
    timers = [];
    setProgress();
    tries = 0;
    $('.lp-text').innerHTML = s.text;
    $('.lp-choices').innerHTML = '';
    $('.lp-pips').innerHTML = '';
    $('.lp-retry').hidden = true;
    $('.lp-next').disabled = s.type !== 'info';
    $('.lp-next').textContent = k === steps.length - 1 ? 'Finish lesson' : 'Continue';
    feedback(s.type === 'info' ? '' : s.prompt || '');
    board.onMove(null);
    board.onTap(null);
    if (s.position !== undefined) board.set(s.position);
    boardWrap.hidden = s.position === undefined && k === 0;
    board.mark(s.marks || {});
    board.interactive(false);
    if (s.demo) s.demo.forEach((mv, n) => later(() => board.play(mv), 500 + n * 700));

    if (s.type === 'info') { board.interactive(false); return; }

    if (s.type === 'tap') {
      const targets = new Set(s.targets);
      const found = new Set();
      const pips = () => {
        if (s.pick) return;
        $('.lp-pips').innerHTML = s.targets.map((_, n) => '<i class="' + (n < found.size ? 'on' : '') + '"></i>').join('') + '<span>' + found.size + ' / ' + s.targets.length + '</span>';
      };
      pips();
      board.onTap((name) => {
        if (found.has(name)) return;
        if (targets.has(name)) {
          found.add(name);
          play('select');
          const marks = { ...(s.marks || {}) };
          found.forEach((f) => { marks[f] = 'good'; });
          board.mark(marks);
          pips();
          if (s.pick || found.size === targets.size) ready(s.done);
          else feedback('Yes! ' + (targets.size - found.size) + ' to go.', 'good');
        } else {
          tries++; mistakes++;
          play('error');
          const marks = { ...(s.marks || {}) };
          found.forEach((f) => { marks[f] = 'good'; });
          marks[name] = 'bad';
          board.mark(marks);
          feedback(s.wrong || 'Not that one. Look again.', 'bad');
        }
      });
      return;
    }

    if (s.type === 'move') {
      const line = s.line || null;
      let at = 0;
      board.interactive(true);
      board.onMove((name, facts) => {
        const want = line ? line[at] : null;
        const ok = line ? name === want || name === want + 'q'
          : (s.accept && s.accept.includes(name)) || (s.goal && (s.goal === 'any' || facts[s.goal]));
        if (!ok) {
          tries++; mistakes++;
          play('error');
          feedback(wrongText(s, facts), 'bad');
          return false;
        }
        if (line && at + 1 < line.length) {
          // the opponent replies, then it's the person's move again
          board.interactive(false);
          feedback(s.good || 'Good move. Now the reply…', 'good');
          const reply = line[at + 1];
          at += 2;
          later(() => {
            board.play(reply);
            if (at >= line.length) return ready(s.done);
            board.interactive(true);
            feedback(s.next || 'Your move again.');
          }, 700);
          return true;
        }
        ready(s.done);
        return true;
      });
      return;
    }

    if (s.type === 'choice') {
      const box = $('.lp-choices');
      s.options.forEach((opt, n) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'lp-choice';
        b.textContent = opt;
        b.addEventListener('click', () => {
          if (!$('.lp-next').disabled) return;
          if (n === s.answer) {
            b.classList.add('right');
            play('select');
            ready(s.done || s.explain);
          } else {
            tries++; mistakes++;
            b.classList.add('wrong');
            b.disabled = true;
            play('error');
            feedback(s.wrong || 'Not quite. Try another answer.', 'bad');
          }
        });
        box.appendChild(b);
      });
    }
  }

  function wrongText(s, facts) {
    if (s.wrong) return s.wrong;
    if (s.goal === 'mate' && facts.stalemate) return 'That’s stalemate: Black has no legal move but isn’t in check, so it’s a draw. Find the mate.';
    if (s.goal === 'mate') return facts.check ? 'Check, but not mate: the king can still escape. Look again.' : 'That isn’t checkmate. Look for a move that leaves the king nowhere to go.';
    if (s.goal === 'check') return 'That doesn’t give check. Which piece can attack the king?';
    if (s.goal === 'capture') return 'Look for a move that captures.';
    return 'Not that move. Try again.';
  }

  function finish() {
    if (opts.finish) {
      $('.lp-bar span').style.width = '100%';
      $('.lp-count').textContent = 'Done';
      $('.lp-card').classList.add('lp-done');
      return opts.finish($('.lp-card'), mistakes);
    }
    const first = complete(course.game, lesson.slug, lesson.xp || 20);
    track('lesson_complete', { game: course.game, lesson: lesson.slug, first });
    play('win', 0.05);
    confetti();
    $('.lp-bar span').style.width = '100%';
    $('.lp-count').textContent = 'Done';
    const card = $('.lp-card');
    card.classList.add('lp-done', 'lp-celebrate');
    const unitDone = lesson.unit.lessons.every((l) => isDone(course.game, l.slug));
    const toPath = '/learn/' + course.game + '/path';
    card.innerHTML = '<img class="lp-cheer" src="/assets/img/fox-wink.webp" alt="" width="280" height="280">' +
      '<p class="lp-done-title">' + (unitDone ? 'Unit complete!' : 'Lesson complete!') + '</p>' +
      '<div class="lp-tally"><span><b class="lp-xp-n">' + (first ? '+0' : '0') + '</b><small>XP</small></span><span><b>' + firstTry + '/' + lesson.steps.filter((x) => x.type !== 'info').length + '</b><small>first try</small></span></div>' +
      '<p class="text-2">' + (lesson.wrap || 'Nicely done.') + (unitDone && next ? ' A gift chest is waiting on your path.' : '') + '</p>' +
      '<a class="btn btn-gold btn-lg btn-block lp-continue" href="' + toPath + '">Continue</a>' +
      (next ? '<a class="lp-path-link" href="/learn/' + course.game + '/' + next.slug + '?from=path">Or go straight to: ' + next.title + '</a>' : '') +
      '<button type="button" class="link-btn lp-again">Do this lesson again</button>';
    if (first) countUp(card.querySelector('.lp-xp-n'), lesson.xp || 20, '+');
    card.querySelector('.lp-continue').addEventListener('click', () => { try { sessionStorage.setItem('bgs-path-just', lesson.slug); } catch (e) { /* private mode */ } });
    card.querySelector('.lp-again').addEventListener('click', () => runLesson(el, course, lesson, next, index, opts));
  }

  $('.lp-next').addEventListener('click', () => {
    if (k < steps.length - 1) { k++; show(); }
    else finish();
  });
  if (isDone(course.game, lesson.slug)) el.dataset.done = 'true';
  show();
}
