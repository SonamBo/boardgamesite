// A short confetti burst for finished lessons, units and chests. Does nothing for people who prefer reduced motion.
const COLORS = ['#CFAA62', '#E6C88A', '#8A2443', '#B8465F', '#EFE6D8', '#5FA36B'];

export function confetti({ x = 0.5, y = 0.35, count = 140 } = {}) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = document.createElement('canvas');
  c.className = 'confetti';
  c.setAttribute('aria-hidden', 'true');
  const dpr = Math.min(2, devicePixelRatio || 1);
  c.width = innerWidth * dpr; c.height = innerHeight * dpr;
  document.body.appendChild(c);
  const ctx = c.getContext('2d');
  ctx.scale(dpr, dpr);
  const bits = Array.from({ length: count }, () => {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2, v = 6 + Math.random() * 9;
    return { x: innerWidth * x, y: innerHeight * y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, w: 6 + Math.random() * 6, h: 8 + Math.random() * 8,
      r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, c: COLORS[Math.floor(Math.random() * COLORS.length)] };
  });
  const start = performance.now();
  (function frame(t) {
    const life = (t - start) / 1800;
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const b of bits) {
      b.vy += 0.32; b.vx *= 0.99; b.x += b.vx; b.y += b.vy; b.r += b.vr;
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - life * life);
      ctx.translate(b.x, b.y); ctx.rotate(b.r); ctx.fillStyle = b.c; ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h); ctx.restore();
    }
    if (life < 1) requestAnimationFrame(frame); else c.remove();
  })(start);
}

// Count a number up inside an element: 0 → n.
export function countUp(el, n, prefix = '', ms = 700) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = prefix + n; return; }
  const t0 = performance.now();
  (function tick(t) {
    const k = Math.min(1, (t - t0) / ms);
    el.textContent = prefix + Math.round(n * (1 - Math.pow(1 - k, 3)));
    if (k < 1) requestAnimationFrame(tick);
  })(t0);
}
