// Renders "the most-searched board game in every country" as a vertical (1080×1920) video for Shorts,
// Reels and Reddit.
//   python3 tools/map-video/build-data.py           # trends-raw.txt -> map-data.json
//   node tools/map-video/make.mjs [--out dist/map]   # -> dist/map/board-game-world-map.mp4
//   node tools/map-video/make.mjs --stills 5,9,18    # PNG frames at those seconds, to check the layout
// Map: shapes.json (Natural Earth 1:110m via world-atlas, Equal Earth projection, 2000 units wide).
// Sound: the Shorts' synth (tools/daily-short/synth.mjs).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { synth } from '../daily-short/synth.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(HERE, '../..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = resolve(ROOT, arg('--out', 'dist/map'));
const FPS = 30;
const data = JSON.parse(readFileSync(join(HERE, 'map-data.json'), 'utf8'));
const shapes = JSON.parse(readFileSync(join(HERE, 'shapes.json'), 'utf8'));
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
page.on('pageerror', (e) => console.error('page error:', e.message));
await page.goto(pathToFileURL(join(HERE, 'map.html')).href);
await page.evaluate(() => document.fonts.ready);
await page.evaluate(([d, s]) => window.setup(d, s), [data, shapes]);
await page.waitForTimeout(300);
const T = await page.evaluate(() => window.T);
const plan = await page.evaluate(() => ({ tour: window.TOUR.map((s) => s.pins.length), a1: window.A1PINS.map((p) => p.at) }));

const stills = arg('--stills');
if (stills) {
  for (const s of stills.split(',').map(Number)) {
    await page.evaluate((t) => window.render(t), s);
    await page.screenshot({ path: join(OUT, `still-${s}.png`) });
  }
  await browser.close();
  console.log('stills in', OUT);
  process.exit(0);
}

// Sounds: a chime as each act starts, a soft note for each pin, a fanfare on the end card.
const sounds = [{ t: T.a1, name: 'found' }, { t: T.a2fill, name: 'found' }, { t: T.end, name: 'win' }];
plan.a1.forEach((at) => sounds.push({ t: T.a1pins + at, name: 'select' }));
plan.tour.forEach((n, i) => { for (let j = 0; j < n; j++) sounds.push({ t: T.tour + i * T.step + j * 0.5, name: 'select' }); });
const tmp = join(OUT, 'tmp'); mkdirSync(tmp, { recursive: true });
writeFileSync(join(tmp, 'audio.wav'), synth({ dur: T.dur, sounds }));

const file = join(OUT, 'board-game-world-map.mp4');
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  '-i', join(tmp, 'audio.wav'), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
const done = new Promise((ok, no) => ff.on('close', (c) => (c ? no(new Error('ffmpeg ' + c)) : ok())));
const frames = Math.round(T.dur * FPS);
for (let f = 0; f < frames; f++) {
  await page.evaluate((t) => window.render(t), f / FPS);
  const jpg = await page.screenshot({ type: 'jpeg', quality: 90 });
  if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once('drain', r));
  if (f % 150 === 0) process.stdout.write(`frame ${f}/${frames}\n`);
}
ff.stdin.end(); await done; await browser.close();
rmSync(tmp, { recursive: true, force: true });
console.log('wrote', file);
