// "Where the world's board games were born": a numbered world map (Reddit poster, 2400×1640 PNG)
// and a vertical Short (1080×1920) that travels from game to game in date order.
//   node tools/origins-video/make.mjs [--out dist/origins]          # poster + video
//   node tools/origins-video/make.mjs --stills 2,8,30                # check frames
// Events, places and dates: events.json (earliest sure evidence, from Wikipedia; see the README).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { synth } from '../daily-short/synth.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(HERE, '../..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = resolve(ROOT, arg('--out', 'dist/origins'));
const FPS = 30;
const events = JSON.parse(readFileSync(join(HERE, 'events.json'), 'utf8'));
const shapes = JSON.parse(readFileSync(join(HERE, '../map-video/shapes.json'), 'utf8'));
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });

async function open(mode, w, h) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on('pageerror', (e) => console.error('page error:', e.message));
  await page.goto(pathToFileURL(join(HERE, 'origins.html')).href);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(([e, s, m]) => window.setup(e, s, m), [events, shapes, mode]);
  await page.waitForTimeout(300);
  return page;
}

// the poster
const poster = await open('poster', 2400, 1640);
await poster.evaluate(() => window.render(0));
await poster.screenshot({ path: join(OUT, 'board-game-origins-map.png') });
console.log('wrote poster');

const page = await open('video', 1080, 1920);
const T = await page.evaluate(() => window.T);
const stills = arg('--stills');
if (stills) {
  for (const s of stills.split(',').map(Number)) { await page.evaluate((t) => window.render(t), s); await page.screenshot({ path: join(OUT, `still-${s}.png`) }); }
  await browser.close(); console.log('stills in', OUT); process.exit(0);
}
const sounds = [{ t: T.hook, name: 'found' }, { t: T.outro, name: 'found' }, { t: T.end, name: 'win' }];
for (let i = 0; i < T.n; i++) sounds.push({ t: T.hook + i * T.step + 0.35, name: 'select' });
const tmp = join(OUT, 'tmp'); mkdirSync(tmp, { recursive: true });
writeFileSync(join(tmp, 'audio.wav'), synth({ dur: T.dur, sounds }));
const file = join(OUT, 'board-game-origins.mp4');
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  '-i', join(tmp, 'audio.wav'), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
const done = new Promise((ok, no) => ff.on('close', (c) => (c ? no(new Error('ffmpeg ' + c)) : ok())));
const frames = Math.round(T.dur * FPS);
for (let f = 0; f < frames; f++) {
  await page.evaluate((t) => window.render(t), f / FPS);
  const jpg = await page.screenshot({ type: 'jpeg', quality: 90 });
  if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once('drain', r));
}
ff.stdin.end(); await done; await browser.close();
rmSync(tmp, { recursive: true, force: true });
console.log('wrote', file);
