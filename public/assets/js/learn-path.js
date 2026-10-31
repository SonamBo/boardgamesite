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
