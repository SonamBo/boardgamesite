#!/usr/bin/env node
/**
 * Upload a rendered daily-challenge Short to YouTube.
 *
 *   node tools/daily-short/upload.mjs dist/short/2026-11-01-1-sudoku.json
 *
 * Reads three secrets from the environment (see README.md in this folder):
 *   YT_CLIENT_ID, YT_CLIENT_SECRET   the Google Cloud OAuth client
 *   YT_REFRESH_TOKEN                 the channel's permission, made once with auth.mjs
 * Optional: YT_PRIVACY = public (default) | unlisted | private.
 *
 * Without the secrets it says so and exits cleanly, so the job still renders and keeps the video as a
 * download. Never posts the same challenge twice: it looks for its campaign tag (short-<date>-<game>) in the
 * channel's latest uploads first. The same channel and secrets as the Cash Paws Shorts work here too.
 */
import { readFileSync, statSync } from 'node:fs';

const metaPath = process.argv[2];
if (!metaPath) { console.error('usage: upload.mjs <short.json>'); process.exit(2); }
const meta = JSON.parse(readFileSync(metaPath, 'utf8'));

const { YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN } = process.env;
const PRIVACY = process.env.YT_PRIVACY || 'public';
if (!YT_CLIENT_ID || !YT_CLIENT_SECRET || !YT_REFRESH_TOKEN) {
  console.log('No YouTube secrets (YT_CLIENT_ID, YT_CLIENT_SECRET, YT_REFRESH_TOKEN): not uploading. The video is in the run\'s artifacts.');
  process.exit(0);
}

async function json(res, what) {
  const body = await res.text();
  if (!res.ok) throw new Error(`${what}: HTTP ${res.status} ${body.slice(0, 400)}`);
  return body ? JSON.parse(body) : {};
}

// 1. A short-lived access token from the refresh token.
const token = await json(await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: YT_CLIENT_ID, client_secret: YT_CLIENT_SECRET, refresh_token: YT_REFRESH_TOKEN, grant_type: 'refresh_token' }),
}), 'token');
const auth = { authorization: `Bearer ${token.access_token}` };

// 2. Already up? Look through the channel's newest uploads for this Short's campaign tag.
try {
  const ch = await json(await fetch('https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true', { headers: auth }), 'channel');
  const uploads = ch.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (uploads) {
    const list = await json(await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=30&playlistId=${uploads}`, { headers: auth }), 'uploads');
    const dup = list.items?.find((it) => (it.snippet?.description || '').includes(meta.campaign));
    if (dup) {
      console.log(`Already on YouTube: https://youtube.com/shorts/${dup.snippet.resourceId.videoId} (${dup.snippet.title}). Not uploading again.`);
      process.exit(0);
    }
  }
} catch (e) {
  // A token made with the upload scope only can't read the channel: upload anyway.
  console.log(`Couldn't check earlier uploads (${e.message.split(':')[0]}); uploading.`);
}

// 3. A resumable upload: the details first, then the file.
const size = statSync(meta.video).size;
const start = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
  method: 'POST',
  headers: { ...auth, 'content-type': 'application/json; charset=UTF-8', 'x-upload-content-type': 'video/mp4', 'x-upload-content-length': String(size) },
  body: JSON.stringify({
    snippet: { title: meta.title.slice(0, 100), description: meta.description, tags: meta.tags, categoryId: '20' },   // 20: Gaming
    status: { privacyStatus: PRIVACY, selfDeclaredMadeForKids: false },
  }),
});
if (!start.ok) throw new Error(`upload start: HTTP ${start.status} ${(await start.text()).slice(0, 400)}`);
const done = await json(await fetch(start.headers.get('location'), {
  method: 'PUT',
  headers: { ...auth, 'content-type': 'video/mp4', 'content-length': String(size) },
  body: readFileSync(meta.video),
}), 'upload');
console.log(`Uploaded ${meta.game} (${meta.puzzleDate}) as ${PRIVACY}: https://youtube.com/shorts/${done.id}`);
