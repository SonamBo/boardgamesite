#!/usr/bin/env node
/**
 * Renders daily-challenge Shorts (1080×1920, 30 fps, with sound) into dist/short/.
 *
 *   node tools/daily-short/render.mjs                        today's 3 Shorts (India date), all slots
 *   node tools/daily-short/render.mjs --date 2026-11-01      the 3 Shorts posted on that date
 *   node tools/daily-short/render.mjs --slot 1               just the second of them
 *   node tools/daily-short/render.mjs --game chess --puzzle-date 2026-10-30   one game, any day
 *
 * Each Short shows a challenge from the day before the posting date (so nothing live is spoiled).
 * Writes <name>.mp4 and <name>.json (title, description, tags) for upload.mjs.
 * Needs Playwright (Chromium) and ffmpeg.
 */
import { spawn } from 'node:child_process';
import { synth } from './synth.mjs';
import { createRequire } from 'node:module';
import { mkdirSync, renameSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { shortsFor, scriptFor, dayBefore } from './shorts.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = resolve(ROOT, arg('--out', 'dist/short'));
const FPS = 30;
const SITE = 'https://boardgamesite.com';
const indiaToday = () => new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);

// ---------- which Shorts ----------
let jobs;
if (arg('--game')) {
  const pd = arg('--puzzle-date', dayBefore(indiaToday()));
  jobs = [{ script: scriptFor(arg('--game'), pd), slot: 0, postDate: arg('--date', indiaToday()) }];
} else {
  const postDate = arg('--date', indiaToday());
  const all = shortsFor(postDate).map((script, slot) => ({ script, slot, postDate }));
  const slot = arg('--slot', 'all');
  jobs = slot === 'all' ? all : all.filter((j) => j.slot === Number(slot));
}

// ---------- sound: the site's own effects (sound.js), plus a quiet bed ----------
// ---------- the words under the video ----------
function details(script, slot, postDate) {
  const m = script.meta;
  const campaign = `short-${m.puzzleDate}-${m.game}`;
  const utm = `utm_source=youtube&utm_medium=short&utm_campaign=${campaign}`;
  const learn = m.learn.startsWith('/learn') ? `Learn the idea${m.lesson ? ` (“${m.lesson}”)` : ''}: ${SITE}${m.learn}?${utm}` : `Play ${m.name} free: ${SITE}${m.learn}?${utm}`;
  const description = [
    `${m.hook} This was the ${m.name} challenge on ${m.dateText}.`,
    '',
    `Today’s three challenges are waiting: ${SITE}/daily?${utm}`,
    learn,
    '',
    'A new set of daily challenges every day at BoardGameSite: chess, checkers, sudoku, word games and more. Free in your browser, no download.',
    '',
    m.tags.map((t) => '#' + t.replace(/[^a-z0-9]/gi, '')).join(' ') + ' #shorts',
  ].join('\n');
  return { title: m.title.slice(0, 100), description, tags: m.tags.concat(['boardgamesite', 'daily puzzle']), game: m.game, puzzleDate: m.puzzleDate, postDate, slot, campaign };
}

// ---------- rendering ----------
function run(cmd, args, input) {
  return new Promise((ok, bad) => {
    const p = spawn(cmd, args, { stdio: [input ? 'pipe' : 'ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => (code === 0 ? ok() : bad(new Error(`${cmd} exited ${code}: ${err.slice(-600)}`))));
    if (input) input(p.stdin);
  });
}
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = await import('playwright')); }

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
page.on('pageerror', (e) => { throw e; });
await page.goto(pathToFileURL(join(HERE, 'short.html')).href);
await page.evaluate(() => document.fonts.ready);

for (const job of jobs) {
  const s = job.script;
  const name = `${job.postDate}-${job.slot + 1}-${s.meta.game}`;
  const tmp = join(OUT, '.' + name);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  await page.evaluate((x) => window.setup(x), s);
  await page.evaluate(() => document.fonts.ready);
  const frames = Math.round(s.dur * FPS);
  const PER = 6 * FPS;                      // one encoded file per 6-second scene
  const parts = [];
  for (let start = 0, n = 0; start < frames; start += PER, n++) {
    const file = join(tmp, `part${n}.mp4`), partial = join(tmp, `part${n}.tmp.mp4`);
    const count = Math.min(PER, frames - start);
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p', '-r', String(FPS), partial], async (stdin) => {
      for (let f = start; f < start + count; f++) {
        await page.evaluate((t) => window.render(t), f / FPS);
        const jpg = await page.screenshot({ type: 'jpeg', quality: 92 });
        if (!stdin.write(jpg)) await new Promise((r) => stdin.once('drain', r));
      }
      stdin.end();
    });
    renameSync(partial, file);
    parts.push(file);
  }
  writeFileSync(join(tmp, 'list.txt'), parts.map((p) => `file '${p}'`).join('\n'));
  writeFileSync(join(tmp, 'audio.wav'), synth(s));
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(tmp, 'list.txt'), '-c', 'copy', join(tmp, 'video.mp4')]);
  const mp4 = join(OUT, name + '.mp4'), partialMp4 = join(tmp, 'final.mp4');
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(tmp, 'video.mp4'), '-i', join(tmp, 'audio.wav'), '-map', '0:v', '-map', '1:a',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', partialMp4]);
  renameSync(partialMp4, mp4);
  rmSync(tmp, { recursive: true, force: true });
  const meta = { video: mp4, ...details(s, job.slot, job.postDate) };
  writeFileSync(join(OUT, name + '.json'), JSON.stringify(meta, null, 2));
  console.log(`✓ ${name}.mp4 (${s.dur}s): ${meta.title}`);
}
await browser.close();
if (!existsSync(OUT)) process.exit(1);
