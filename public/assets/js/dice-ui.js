// Shared dice for the dice games: drawing a die, and a short tumbling roll.
import { play } from './sound.js';

const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export const d6 = () => 1 + Math.floor(Math.random() * 6);
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// A die button. `keep` shows a Keep/Kept label underneath for games where you hold dice.
export function makeDie(parent, { keep = false, onClick } = {}) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'die' + (keep ? '' : ' plain');
  b.innerHTML = '<span class="face">' + '<i></i>'.repeat(9) + '</span>' + (keep ? '<small>Keep</small>' : '');
  if (onClick) b.addEventListener('click', onClick);
  parent.appendChild(b);
  return b;
}

export function paintDie(b, v, { held = false, p2 = false, rolling = false, disabled = true, keepLabel = 'Keep', keptLabel = 'Kept', dim = false } = {}) {
  const pips = v ? PIPS[v] : [];
  b.querySelectorAll('.face i').forEach((p, k) => p.classList.toggle('on', pips.includes(k)));
  b.classList.toggle('held', held);
  b.classList.toggle('blank', !v);
  b.classList.toggle('p2', p2);
  b.classList.toggle('rolling', rolling);
  b.classList.toggle('dim', dim);
  const s = b.querySelector('small');
  if (s) s.textContent = held ? keptLabel : keepLabel;
  b.disabled = disabled;
  b.setAttribute('aria-label', v ? 'Die showing ' + v + (held ? ', ' + keptLabel.toLowerCase() : '') : 'Die');
  if (b.hasAttribute('aria-pressed') || s) b.setAttribute('aria-pressed', String(held));
}

// Tumble the dice at `idx`, then land on the values from `final` (an array the same length as idx).
export async function tumble(paintFrame, idx, final) {
  play('shuffle');
  if (!reduced()) {
    for (let n = 0; n < 6; n++) {
      paintFrame(idx.map(() => d6()), true);
      await wait(60);
    }
  }
  paintFrame(final, false);
  play('drop');
}
