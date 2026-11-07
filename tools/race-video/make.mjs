// Renders the board game popularity race as a vertical (1080×1920) video for Shorts, Reels and Reddit.
//   node tools/race-video/make.mjs [--out dist/race]
// Data: public/assets/data/popularity.json. Sound: the Shorts' synth (tools/daily-short/synth.mjs).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { synth } from '../daily-short/synth.mjs';

const HERE = dirname(fileURLToPath(import.meta.url)), ROOT = resolve(HERE, '../..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = resolve(ROOT, arg('--out', 'dist/race'));
const FPS = 30, T = { hook: 2.6, race: 30, end: 5 };
const DUR = T.hook + T.race + 1.2 + T.end;
const data = JSON.parse(readFileSync(join(ROOT, 'public/assets/data/popularity.json'), 'utf8'));
mkdirSync(OUT, { recursive: true });

// Sounds: a chime whenever the leader changes, a soft note for each caption, a fanfare at the end.
const sounds = [], Q = data.quarters, names = Object.keys(data.series);
const EVENTQ = ['2005 Q3', '2009 Q4', '2012 Q1', '2013 Q4', '2020 Q2', '2020 Q4', '2022 Q1', '2023 Q1', '2026 Q2'];
let leader = null;
Q.forEach((q, i) => {
  const t = T.hook + (i / (Q.length - 1)) * T.race;
  const top = names.reduce((a, b) => (data.series[b][i] > data.series[a][i] ? b : a));
  if (leader && top !== leader) sounds.push({ t, name: 'found' });
  leader = top;
  if (EVENTQ.includes(q)) sounds.push({ t: t + 0.05, name: 'select' });
});
sounds.push({ t: T.hook + T.race + 1.2, name: 'win' });
const tmp = join(OUT, 'tmp'); mkdirSync(tmp, { recursive: true });
writeFileSync(join(tmp, 'audio.wav'), synth({ dur: DUR, sounds }));

const run = (cmd, args) => new Promise((ok, no) => { const p = spawn(cmd, args, { stdio: ['pipe', 'inherit', 'inherit'] }); p.on('close', (c) => (c ? no(new Error(cmd + ' ' + c)) : ok())); return p; });
const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
await page.goto(pathToFileURL(join(HERE, 'race.html')).href);
await page.evaluate(() => document.fonts.ready);
await page.evaluate(([d, t]) => window.setup(d, t), [data, T]);
await page.waitForTimeout(300);
const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
  '-i', join(tmp, 'audio.wav'), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '160k', '-shortest', '-movflags', '+faststart', join(OUT, 'board-game-popularity-race.mp4')], { stdio: ['pipe', 'inherit', 'inherit'] });
const done = new Promise((ok, no) => ff.on('close', (c) => (c ? no(new Error('ffmpeg ' + c)) : ok())));
const frames = Math.round(DUR * FPS);
for (let f = 0; f < frames; f++) {
  await page.evaluate((t) => window.render(t), f / FPS);
  const jpg = await page.screenshot({ type: 'jpeg', quality: 90 });
  if (!ff.stdin.write(jpg)) await new Promise((r) => ff.stdin.once('drain', r));
  if (f % 150 === 0) process.stdout.write(`frame ${f}/${frames}\n`);
}
ff.stdin.end(); await done; await browser.close();
rmSync(tmp, { recursive: true, force: true });
console.log('wrote', join(OUT, 'board-game-popularity-race.mp4'));
