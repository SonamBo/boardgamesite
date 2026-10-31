// The learning path on a guide page: marks finished lessons and the recommended next one.
import { progress } from './learn-progress.js';

for (const el of document.querySelectorAll('[data-path]')) {
  const game = el.dataset.path;
  const done = progress(game).done;
  const links = [...el.querySelectorAll('a[data-lesson]')];
  let finished = 0, next = null;
  for (const a of links) {
    if (done[a.dataset.lesson]) { a.classList.add('done'); a.querySelector('.n').textContent = '✓'; a.setAttribute('aria-label', a.textContent.slice(1) + ' (done)'); finished++; }
    else if (!next) next = a;
  }
  if (next && finished) next.classList.add('next');
  el.querySelector('.lp-bar span').style.width = Math.round((finished / links.length) * 100) + '%';
  el.querySelector('.path-count').textContent = finished ? finished + ' of ' + links.length + ' lessons done' : links.length + ' lessons';
  const cta = el.querySelector('[data-path-cta]');
  if (cta && finished) cta.textContent = finished === links.length ? 'Open your path' : 'Continue: lesson ' + (finished + 1) + ' of ' + links.length;
}

// Learning-path cards on the Learn page: progress bar and button text.
for (const card of document.querySelectorAll('[data-path-card]')) {
  const game = card.dataset.pathCard, total = Number(card.dataset.total) || 1;
  const n = Object.keys(progress(game).done).length;
  card.querySelector('.lpc-bar span').style.width = Math.round((Math.min(n, total) / total) * 100) + '%';
  if (n) card.querySelector('.lpc-btn').textContent = n >= total ? 'Open your path' : 'Continue · ' + n + '/' + total;
}

// "See all" on the Learn page shelves.
document.addEventListener('click', (e) => {
  const b = e.target.closest('.gt-all');
  if (!b) return;
  const shelf = b.closest('.shelf');
  if (!b.dataset.label) b.dataset.label = b.textContent;
  const open = shelf.classList.toggle('open');
  b.setAttribute('aria-expanded', String(open));
  b.textContent = open ? 'Show fewer' : b.dataset.label;
});
