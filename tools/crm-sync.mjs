// Nightly sync of signed-in players who chose reminder emails, from Firebase to Brevo.
// Run by .github/workflows/crm-sync.yml. See docs/CRM.md.
//
//   Reads   Firestore users/{uid} (progress, lastSeen, emails.reminders) and Firebase Auth (email address)
//   Writes  one Brevo contact per opted-in player, in the list BREVO_LIST_ID, with the attributes below.
//           Players who switched reminders off, deleted their account or have an unconfirmed email
//           are taken off the list. Brevo's own unsubscribe link still wins over everything here.
//
// Env: FIREBASE_SERVICE_ACCOUNT (JSON), BREVO_API_KEY, BREVO_LIST_ID. Add --dry to count without writing.
// Logs only counts, never names or email addresses.
import fs from 'node:fs';
import path from 'node:path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { GAMES } from '../public/assets/js/games-data.js';

const DRY = process.argv.includes('--dry');
const SITE = 'https://boardgamesite.com';
const { BREVO_API_KEY, BREVO_LIST_ID, FIREBASE_SERVICE_ACCOUNT } = process.env;
if (!FIREBASE_SERVICE_ACCOUNT || (!DRY && (!BREVO_API_KEY || !BREVO_LIST_ID))) {
  console.log('::warning::Missing FIREBASE_SERVICE_ACCOUNT, BREVO_API_KEY or BREVO_LIST_ID - nothing synced. See docs/CRM.md.');
  process.exit(0);
}
// BREVO_LIST_ID can be the list's number ("3", "#3") or its name ("Reminders")
let LIST = Number(String(BREVO_LIST_ID || '').replace(/[^0-9]/g, '')) || 0;

// ---------- Brevo ----------
// Contact attributes the emails can use, e.g. {{ contact.STREAK }}. Created on first run if missing.
export const ATTRIBUTES = {
  FIRSTNAME: 'text',         // the name they play under
  LAST_VISIT: 'date',        // last day they opened the site while signed in
  DAYS_AWAY: 'float',        // whole days since then
  STREAK: 'float',           // current daily streak (0 if broken)
  STREAK_AT_RISK: 'boolean', // had a streak, didn't play today (yesterday's streak ends tonight)
  XP: 'float',               // learning XP across all courses
  LESSONS_DONE: 'float',
  COURSE: 'text',            // course in progress, e.g. "Go"
  NEXT_LESSON: 'text',       // its next lesson's title
  NEXT_LESSON_URL: 'text',
  FAV_GAME: 'text',          // most-played game
  FAV_GAME_URL: 'text'
};
async function brevo(method, url, body) {
  const r = await fetch('https://api.brevo.com/v3' + url, {
    method,
    headers: { 'api-key': BREVO_API_KEY, 'content-type': 'application/json', accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!r.ok && r.status !== 204) {
    const text = await r.text();
    const err = new Error('Brevo ' + method + ' ' + url.replace(/[^/?]+@[^/?]+/, '<email>') + ' → ' + r.status + ' ' + text.slice(0, 160));
    err.status = r.status;
    err.body = text;
    throw err;
  }
  return r.status === 204 ? null : r.json().catch(() => null);
}
async function ensureAttributes() {
  for (const [name, type] of Object.entries(ATTRIBUTES)) {
    if (name === 'FIRSTNAME') continue; // Brevo has it already
    try { await brevo('POST', '/contacts/attributes/normal/' + name, { type }); }
    catch (e) { if (!/already exist|duplicate/i.test(e.body || '')) throw e; }
  }
}
async function listMembers() {
  const out = new Set();
  for (let offset = 0; ; offset += 500) {
    const r = await brevo('GET', '/contacts/lists/' + LIST + '/contacts?limit=500&offset=' + offset);
    (r.contacts || []).forEach((c) => out.add(c.email.toLowerCase()));
    if (!r.contacts || r.contacts.length < 500) return out;
  }
}

// ---------- Player details ----------
const COURSES = {};
for (const f of fs.readdirSync('src/courses').filter((x) => x.endsWith('.json'))) {
  const c = JSON.parse(fs.readFileSync(path.join('src/courses', f), 'utf8'));
  COURSES[c.game] = { name: c.name, lessons: c.units.flatMap((u) => u.lessons.map((l) => ({ slug: l.slug, title: l.title }))) };
}
const GAME_NAME = Object.fromEntries(GAMES.map((g) => [g.slug, g.name]));
const day = (d) => d.toISOString().slice(0, 10);

function streakOf(progress, today) {
  const on = new Set([...Object.keys(progress['bgs-activity'] || {}), ...Object.keys(progress['bgs-daily-log'] || {})]);
  const d = new Date(today + 'T12:00:00Z');
  const playedToday = on.has(day(d));
  if (!playedToday) d.setUTCDate(d.getUTCDate() - 1);
  let n = 0;
  while (on.has(day(d))) { n++; d.setUTCDate(d.getUTCDate() - 1); }
  return { streak: n, atRisk: n > 0 && !playedToday };
}
function learning(progress) {
  let xp = 0, lessons = 0, current = null;
  for (const [game, c] of Object.entries(COURSES)) {
    const p = progress['bgs-learn-' + game];
    if (!p) continue;
    xp += Number(p.xp) || 0;
    const done = p.done || {};
    const n = Object.keys(done).length;
    lessons += n;
    if (!n || n >= c.lessons.length) continue;
    const last = Math.max(...Object.values(done).map(Number).filter(Boolean), 0);
    if (!current || last > current.last) {
      const next = c.lessons.find((l) => !done[l.slug]);
      if (next) current = { last, course: c.name, title: next.title, url: SITE + '/learn/' + game + '/' + next.slug };
    }
  }
  return { xp, lessons, current };
}
function favourite(progress) {
  let best = null;
  for (const g of GAMES) {
    const r = progress[g.key];
    if (!r) continue;
    const plays = g.record === 'wld' ? (Number(r.w) || 0) + (Number(r.l) || 0) + (Number(r.d) || 0) : Number(r.played) || 0;
    if (plays && (!best || plays > best.plays)) best = { plays, slug: g.slug };
  }
  return best ? { name: GAME_NAME[best.slug], url: SITE + '/play/' + best.slug } : null;
}
export function attributesFor(doc, today) {
  const progress = doc.progress || {};
  const seen = doc.lastSeen?.toDate?.() || doc.updatedAt?.toDate?.() || null;
  const { streak, atRisk } = streakOf(progress, today);
  const L = learning(progress);
  const fav = favourite(progress);
  return {
    FIRSTNAME: String(doc.name || '').slice(0, 40),
    LAST_VISIT: seen ? day(seen) : '',
    DAYS_AWAY: seen ? Math.max(0, Math.floor((Date.parse(today) - Date.parse(day(seen))) / 864e5)) : 999,
    STREAK: streak,
    STREAK_AT_RISK: atRisk,
    XP: L.xp,
    LESSONS_DONE: L.lessons,
    COURSE: L.current ? L.current.course : '',
    NEXT_LESSON: L.current ? L.current.title : '',
    NEXT_LESSON_URL: L.current ? L.current.url : SITE + '/learn',
    FAV_GAME: fav ? fav.name : '',
    FAV_GAME_URL: fav ? fav.url : SITE + '/'
  };
}

// ---------- Run ----------
const SA = JSON.parse(FIREBASE_SERVICE_ACCOUNT);
initializeApp({ credential: cert(SA) });
// a service account's address isn't secret; printing it shows which account needs the IAM roles
console.log('Signed in as', SA.client_email, 'in project', SA.project_id);
process.on('unhandledRejection', (e) => {
  if (e && (e.code === 7 || e.code === 'auth/insufficient-permission' || /PERMISSION_DENIED|insufficient/i.test(e.message))) {
    console.log('::error::' + SA.client_email + ' is missing a role. In Google Cloud IAM for ' + SA.project_id +
      ', give it "Cloud Datastore Viewer" and "Firebase Authentication Viewer". See docs/CRM.md.');
  }
  console.error(e && e.message);
  process.exit(1);
});
const db = getFirestore();
const auth = getAuth();
const today = day(new Date());

const snap = await db.collection('users').where('emails.reminders', '==', true).get();
const docs = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
// email addresses from Auth, 100 at a time; only confirmed addresses (Google sign-ins always are)
const emails = new Map();
for (let i = 0; i < docs.length; i += 100) {
  const r = await auth.getUsers(docs.slice(i, i + 100).map((d) => ({ uid: d.uid })));
  r.users.forEach((u) => { if (u.email && !u.disabled && u.emailVerified) emails.set(u.uid, u.email.toLowerCase()); });
}
const contacts = docs.filter((d) => emails.has(d.uid)).map((d) => ({ email: emails.get(d.uid), attributes: attributesFor(d, today) }));
console.log('Opted in:', docs.length, '| with a confirmed email:', contacts.length, '| streaks at risk:', contacts.filter((c) => c.attributes.STREAK_AT_RISK).length);

if (DRY) process.exit(0);
if (!LIST) {
  const want = String(BREVO_LIST_ID || 'Reminders').trim().toLowerCase();
  const r = await brevo('GET', '/contacts/lists?limit=50&offset=0');
  const found = (r.lists || []).find((l) => l.name.trim().toLowerCase() === want) || (r.lists || []).find((l) => /remind/i.test(l.name));
  if (!found) { console.log('::error::No Brevo list matches BREVO_LIST_ID. Use the list\'s number from its page in Brevo.'); process.exit(1); }
  LIST = found.id;
}
console.log('Brevo list:', LIST);
await ensureAttributes();
let ok = 0, failed = 0;
for (const c of contacts) {
  // empty values are left out (Brevo rejects an empty date)
  const attributes = Object.fromEntries(Object.entries(c.attributes).filter(([, v]) => v !== ''));
  try { await brevo('POST', '/contacts', { email: c.email, attributes, listIds: [LIST], updateEnabled: true }); ok++; }
  catch (e) { failed++; console.log('::warning::' + e.message); }
}
// take everyone else off the list: switched off, account deleted, or email not confirmed
const keep = new Set(contacts.map((c) => c.email));
const strays = [...(await listMembers())].filter((e) => !keep.has(e));
for (let i = 0; i < strays.length; i += 150) {
  await brevo('POST', '/contacts/lists/' + LIST + '/contacts/remove', { emails: strays.slice(i, i + 150) });
}
console.log('Updated:', ok, '| failed:', failed, '| removed from list:', strays.length);
if (failed) process.exitCode = 1;
