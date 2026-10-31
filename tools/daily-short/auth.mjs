#!/usr/bin/env node
/**
 * One-time: let the daily Shorts job post to your YouTube channel. Run this on your
 * own computer (it opens Google's sign-in in your browser), never in CI.
 *
 *   YT_CLIENT_ID=… YT_CLIENT_SECRET=… node tools/daily-short/auth.mjs
 *
 * The client is a Google Cloud OAuth client of type "Desktop app" (README.md
 * in this folder walks through it). Sign in with the Google account that owns
 * the channel and allow access. It prints a refresh token: save it as the
 * GitHub secret YT_REFRESH_TOKEN. Nothing is stored on disk.
 */
import http from 'node:http';

const { YT_CLIENT_ID: id, YT_CLIENT_SECRET: secret } = process.env;
if (!id || !secret) { console.error('Set YT_CLIENT_ID and YT_CLIENT_SECRET first (README.md in this folder).'); process.exit(2); }
// Upload, plus read-only so the job can see what it already posted.
const SCOPES = 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly';

const server = http.createServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const redirect = `http://127.0.0.1:${server.address().port}`;
const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
  client_id: id, redirect_uri: redirect, response_type: 'code', scope: SCOPES, access_type: 'offline', prompt: 'consent',
});
console.log(`\nOpen this in your browser and allow access:\n\n${url}\n`);

const code = await new Promise((resolve) => {
  server.on('request', (req, res) => {
    const q = new URL(req.url, redirect).searchParams;
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(q.get('code') ? '<h2>Done. You can close this tab and go back to the terminal.</h2>' : `<h2>No code: ${q.get('error') || 'try again'}</h2>`);
    if (q.get('code')) resolve(q.get('code'));
  });
});
server.close();

const res = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ code, client_id: id, client_secret: secret, redirect_uri: redirect, grant_type: 'authorization_code' }),
});
const t = await res.json();
if (!t.refresh_token) { console.error('No refresh token came back:', t); process.exit(1); }
console.log('Your refresh token (save it as the GitHub secret YT_REFRESH_TOKEN, then clear this terminal):\n');
console.log(t.refresh_token + '\n');
