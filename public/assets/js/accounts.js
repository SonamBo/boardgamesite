// Accounts: sign-up / log-in dialog, the signed-in menu, and syncing progress to the player's account.
//
// Progress lives in this browser's storage as before. When someone signs in, their saved progress and
// this browser's are combined (the higher number wins), and from then on every change is copied to
// their account (Firestore users/{uid}), so it follows them to other devices.
import {
  configured, onUser, signInWithGoogle, signUpWithEmail, signInWithEmail, resetPassword,
  signOutUser, loadProfile, saveProfile, track
} from './firebase.js';
import { store, PROGRESS_EVENT } from './store.js';
import { GAMES } from './games-data.js';

// Progress that follows the player between devices: every game's record (from games.py) plus the daily streak.
// Learning paths, BGS Ratings, the practice ladder, daily puzzles and the activity log sync too.
const LEARN_GAMES = ['chess', 'checkers', 'mancala'];
const LEARN_KEYS = LEARN_GAMES.flatMap((g) => ['bgs-learn-' + g, 'bgs-rating-' + g, 'bgs-ladder-' + g]).concat('bgs-activity', 'bgs-puzzles', 'bgs-daily-log');
export const SYNC_KEYS = [...new Set(GAMES.map((g) => g.key))].concat('bgs-daily', LEARN_KEYS);
const AUTH_FLAG = 'bgs-auth'; // set while signed in, so pages only load the sign-in code when needed

let user = null;
let ready = false;
const readyWaiters = [];
export function currentUser() { return user; }
export function whenReady() { return ready ? Promise.resolve(user) : new Promise((r) => readyWaiters.push(r)); }

let newName = ''; // a name just typed (at sign-up or on the account page), used before the profile catches up
export function displayName(u = user) {
  if (!u) return '';
  return newName || (u.displayName || '').trim() || (u.email ? u.email.split('@')[0] : 'Player');
}

// ---------- Combining progress from two places ----------
const n = (v) => (typeof v === 'number' && isFinite(v) ? v : 0);
function mergeScore(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return { w: Math.max(n(a.w), n(b.w)), l: Math.max(n(a.l), n(b.l)), d: Math.max(n(a.d), n(b.d)) };
}
// Single-player stats: games played and won, best (lowest) time in ms, top (highest) score.
function mergeStats(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  const out = { played: Math.max(n(a.played), n(b.played)), won: Math.max(n(a.won), n(b.won)) };
  const bests = [a.best, b.best].filter((x) => typeof x === 'number' && x > 0);
  out.best = bests.length ? Math.min(...bests) : null;
  if ('top' in a || 'top' in b) out.top = Math.max(n(a.top), n(b.top));
  return out;
}
function mergeDaily(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  if (a.date !== b.date) return a.date > b.date ? a : b; // dates are YYYY-MM-DD, so text order is date order
  if (!!a.solved !== !!b.solved) return a.solved ? a : b;
  return n(a.streak) >= n(b.streak) ? a : b;
}
// Lessons finished: everything finished on either device (earliest time), the higher XP.
function mergeLearn(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  const done = { ...(b.done || {}) };
  for (const [k, t] of Object.entries(a.done || {})) done[k] = done[k] ? Math.min(done[k], t) : t;
  return { done, xp: Math.max(n(a.xp), n(b.xp)), chests: { ...(b.chests || {}), ...(a.chests || {}) }, jump: Math.max(n(a.jump), n(b.jump)) };
}
// A rating: the copy with more rated games behind it (then the most recent).
function mergeRating(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  if (n(a.n) !== n(b.n)) return n(a.n) > n(b.n) ? a : b;
  return n(a.last) >= n(b.last) ? a : b;
}
// { key: value } maps where either side counts (ladder bots beaten).
function mergeUnion(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  return { ...b, ...a };
}
// { day: { game: number } }: the higher count per day and game, last 60 days.
function mergeDays(a, b) {
  if (!a) return b || null;
  if (!b) return a;
  const out = {};
  for (const src of [a, b]) for (const [day, games] of Object.entries(src)) {
    out[day] = out[day] || {};
    for (const [g, v] of Object.entries(games || {})) out[day][g] = Math.max(n(out[day][g]), n(v));
  }
  const keep = Object.keys(out).sort().slice(-60);
  return Object.fromEntries(keep.map((d) => [d, out[d]]));
}
const MERGE = { 'bgs-daily': mergeDaily, 'bgs-activity': mergeDays, 'bgs-puzzles': mergeDays, 'bgs-daily-log': mergeDays };
LEARN_GAMES.forEach((g) => { MERGE['bgs-learn-' + g] = mergeLearn; MERGE['bgs-rating-' + g] = mergeRating; MERGE['bgs-ladder-' + g] = mergeUnion; });
GAMES.forEach((g) => { MERGE[g.key] = g.record === 'wld' ? mergeScore : mergeStats; });

// ---------- Saving changes to the account ----------
let pending = {};
let timer = null;
let synced = false; // the account's record exists and has been combined with this browser's
function queueSave(key, value) {
  if (!user || !SYNC_KEYS.includes(key)) return;
  pending[key] = value;
  clearTimeout(timer);
  timer = setTimeout(flush, 1200);
}
function flush() {
  clearTimeout(timer);
  if (!user || !synced || !Object.keys(pending).length) return;
  const progress = pending;
  pending = {};
  saveProfile(user.uid, { progress }).catch(() => { pending = { ...progress, ...pending }; });
}
store.onChange(queueSave);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

async function syncOnSignIn(u) {
  const remote = await loadProfile(u.uid).catch(() => undefined);
  if (remote === undefined) return; // couldn't reach the database; try again next page load
  const saved = (remote && remote.progress) || {};
  const merged = {};
  let localChanged = false;
  for (const key of SYNC_KEYS) {
    const local = store.get(key, null);
    const value = MERGE[key](local, saved[key] || null);
    if (value) merged[key] = value;
    if (JSON.stringify(value) !== JSON.stringify(local)) { store.setQuiet(key, value); localChanged = true; }
  }
  const data = { name: displayName(u).slice(0, 40), progress: merged };
  if (!remote || JSON.stringify(saved) !== JSON.stringify(merged) || remote.name !== data.name) {
    try {
      await saveProfile(u.uid, data, !remote);
    } catch (e) {
      if (localChanged) window.dispatchEvent(new Event(PROGRESS_EVENT));
      return; // saving is retried on the next page load
    }
  }
  synced = true;
  flush();
  if (localChanged) window.dispatchEvent(new Event(PROGRESS_EVENT));
}

// ---------- Signed-in look ----------
function initial(name) { return (name || '?').trim().charAt(0).toUpperCase() || '?'; }

export function refreshUserUI() { paintSignedIn(); }
export function setLocalName(name) { newName = name; }

function paintSignedIn() {
  const nav = document.getElementById('site-nav');
  const signupBtn = nav?.querySelector('[data-open-accounts="sidebar-signup"]');
  const loginBtn = nav?.querySelector('[data-open-accounts="sidebar-login"]');
  let chip = document.getElementById('nav-account');
  if (user) {
    if (signupBtn) signupBtn.hidden = true;
    if (loginBtn) loginBtn.hidden = true;
    if (!chip && signupBtn) {
      chip = document.createElement('a');
      chip.id = 'nav-account';
      chip.className = 'nav-account';
      chip.href = '/account';
      signupBtn.before(chip);
    }
    if (chip) {
      chip.innerHTML = '<span class="avatar" aria-hidden="true"></span><span class="who"><b></b><small>Your account</small></span>';
      chip.querySelector('.avatar').textContent = initial(displayName());
      chip.querySelector('b').textContent = displayName();
      if (location.pathname === '/account') chip.setAttribute('aria-current', 'page');
    }
  } else {
    if (signupBtn) signupBtn.hidden = false;
    if (loginBtn) loginBtn.hidden = false;
    chip?.remove();
  }
  // Other "sign up" prompts on the page.
  document.querySelectorAll('[data-open-accounts]:not([data-open-accounts^="sidebar"])').forEach((btn) => {
    if (!btn.dataset.label) btn.dataset.label = btn.textContent.trim();
    btn.textContent = user ? 'Your account' : btn.dataset.label;
    const note = btn.previousElementSibling;
    if (note && note.tagName === 'P' && btn.closest('.panel-box')) {
      if (!note.dataset.label) note.dataset.label = note.textContent;
      note.textContent = user ? 'Signed in as ' + displayName() + '. Your record is saved to your account.' : note.dataset.label;
    }
  });
}

// ---------- Start ----------
export function startAccounts() {
  if (!configured) { finishReady(); return; }
  // Only load the sign-in code when it's needed: someone is (or was just) signed in, or on the account page.
  if (store.get(AUTH_FLAG, null) || location.pathname === '/account') listen();
  else finishReady();
}

let listening = false;
let signingIn = false; // a Google sign-in is under way (it may continue on a redirect page load)
function listen() {
  if (listening) return;
  listening = true;
  onUser(async (u) => {
    const wasSignedIn = !!user;
    user = u;
    if (!u) synced = false;
    if (u) store.setQuiet(AUTH_FLAG, 1);
    else if (!signingIn) store.setQuiet(AUTH_FLAG, null);
    paintSignedIn();
    finishReady();
    if (u && !wasSignedIn) {
      if (dialog?.open) dialog.close();
      await syncOnSignIn(u);
      paintSignedIn();
    }
    window.dispatchEvent(new Event('bgs-user'));
  });
}
function finishReady() {
  if (ready) return;
  ready = true;
  readyWaiters.splice(0).forEach((r) => r(user));
}

export async function signOutEverywhere() {
  flush();
  await signOutUser();
  // This browser's copy of the account's progress goes too, so the next person starts fresh.
  SYNC_KEYS.forEach((k) => store.setQuiet(k, null));
  store.setQuiet(AUTH_FLAG, null);
  track('logout');
}

// ---------- Sign-up / log-in dialog ----------
let dialog = null;
let mode = 'signup';

const ERRORS = {
  'auth/email-already-in-use': 'There’s already an account with this email. Try logging in instead.',
  'auth/invalid-email': 'Please enter a valid email address.',
  'auth/weak-password': 'Please use at least 6 characters for your password.',
  'auth/invalid-credential': 'That email and password don’t match. Check them, or reset your password.',
  'auth/wrong-password': 'That email and password don’t match. Check them, or reset your password.',
  'auth/user-not-found': 'There’s no account with this email yet. Sign up instead?',
  'auth/too-many-requests': 'Too many tries. Please wait a few minutes and try again.',
  'auth/network-request-failed': 'You seem to be offline. Check your connection and try again.',
  'auth/popup-closed-by-user': '',
  'auth/cancelled-popup-request': '',
  'auth/user-disabled': 'This account has been switched off. Contact us if you think that’s a mistake.',
  'auth/account-exists-with-different-credential': 'This email already has an account. Log in with your password, then you can use Google too.'
};
function friendly(err) {
  const code = err && err.code;
  if (code in ERRORS) return ERRORS[code];
  return 'Something went wrong. Please try again.';
}

const GOOGLE_ICON =
  '<svg viewBox="0 0 48 48" aria-hidden="true" class="g-icon"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.3-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.3-.4-3.5z"/></svg>';

function buildDialog() {
  dialog = document.createElement('dialog');
  dialog.className = 'auth-dialog';
  dialog.setAttribute('aria-labelledby', 'auth-title');
  dialog.innerHTML =
    '<button type="button" class="dialog-close" aria-label="Close">' +
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
    '<div class="dialog-inner">' +
    '<img src="/assets/img/mascot-wave.webp" alt="" width="280" height="280">' +
    '<h2 id="auth-title"></h2>' +
    '<p class="text-2 auth-sub"></p>' +
    '<button type="button" class="btn btn-light btn-block" data-auth="google">' + GOOGLE_ICON + 'Continue with Google</button>' +
    '<div class="or"><span>or</span></div>' +
    '<form class="auth-form" novalidate>' +
    '<label class="visually-hidden" for="auth-name">Your name</label>' +
    '<input id="auth-name" name="name" autocomplete="nickname" maxlength="40" placeholder="Name shown on leaderboards">' +
    '<label class="visually-hidden" for="auth-email">Email address</label>' +
    '<input id="auth-email" type="email" name="email" autocomplete="email" placeholder="Email" required>' +
    '<label class="visually-hidden" for="auth-pass">Password</label>' +
    '<input id="auth-pass" type="password" name="password" placeholder="Password (6+ characters)" required minlength="6">' +
    '<button type="submit" class="btn btn-gold btn-block"></button>' +
    '<button type="button" class="link-btn" data-auth="reset">Forgot your password?</button>' +
    '<p class="form-msg" role="status" aria-live="polite"></p>' +
    '</form>' +
    '<p class="auth-switch text-2"></p>' +
    '<p class="auth-legal muted">By continuing you agree to our <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.</p>' +
    '</div>';
  document.body.appendChild(dialog);

  const form = dialog.querySelector('form');
  const msg = dialog.querySelector('.form-msg');
  const say = (text, isError) => { msg.textContent = text; msg.classList.toggle('error', !!isError); };
  const busy = (on) => dialog.querySelectorAll('button, input').forEach((el) => { if (!el.classList.contains('dialog-close')) el.disabled = on; });

  dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => say(''));

  dialog.querySelector('[data-auth="google"]').addEventListener('click', async () => {
    say('');
    busy(true);
    signingIn = true;
    store.setQuiet(AUTH_FLAG, 1); // so the next page picks up the sign-in if Google uses a full-page redirect
    listen();
    try {
      const u = await signInWithGoogle();
      if (u) track(mode === 'signup' ? 'sign_up' : 'login', { method: 'google' });
    } catch (err) {
      if (!user) store.setQuiet(AUTH_FLAG, null);
      say(friendly(err), true);
    } finally {
      signingIn = false;
      busy(false);
    }
  });

  dialog.querySelector('[data-auth="reset"]').addEventListener('click', async () => {
    const email = form.email.value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { say('Enter your email above, then tap “Forgot your password?” again.', true); form.email.focus(); return; }
    busy(true);
    try {
      await resetPassword(email);
      say('If there’s an account for ' + email + ', a reset link is on its way. Check your inbox (and spam).');
    } catch (err) {
      say(err && err.code === 'auth/invalid-email' ? ERRORS['auth/invalid-email'] : 'If there’s an account for ' + email + ', a reset link is on its way.');
    } finally {
      busy(false);
    }
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = form.name.value.trim();
    const email = form.email.value.trim();
    const password = form.password.value;
    if (mode === 'signup' && !name) { say('Please choose a name. It’s what other players will see.', true); form.name.focus(); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { say(ERRORS['auth/invalid-email'], true); form.email.focus(); return; }
    if (password.length < 6) { say(ERRORS['auth/weak-password'], true); form.password.focus(); return; }
    say('');
    busy(true);
    listen();
    try {
      if (mode === 'signup') {
        newName = name.slice(0, 40);
        await signUpWithEmail(newName, email, password);
        paintSignedIn();
        track('sign_up', { method: 'email' });
      } else {
        await signInWithEmail(email, password);
        track('login', { method: 'email' });
      }
      form.reset();
    } catch (err) {
      say(friendly(err), true);
    } finally {
      busy(false);
    }
  });

  dialog.querySelector('.auth-switch').addEventListener('click', (e) => {
    if (!e.target.closest('button')) return;
    setMode(mode === 'signup' ? 'login' : 'signup');
  });
}

function setMode(next) {
  mode = next;
  const signup = mode === 'signup';
  dialog.querySelector('#auth-title').textContent = signup ? 'Create your account' : 'Welcome back';
  dialog.querySelector('.auth-sub').textContent = signup
    ? 'Free. Save your wins and streaks, and pick them up on any device.'
    : 'Log in to pick up your record and streaks.';
  dialog.querySelector('#auth-name').hidden = !signup;
  dialog.querySelector('#auth-pass').autocomplete = signup ? 'new-password' : 'current-password';
  dialog.querySelector('.auth-form [type=submit]').textContent = signup ? 'Create account' : 'Log in';
  dialog.querySelector('[data-auth="reset"]').hidden = signup;
  dialog.querySelector('.auth-switch').innerHTML = signup
    ? 'Already have an account? <button type="button" class="link-btn">Log in</button>'
    : 'New here? <button type="button" class="link-btn">Create a free account</button>';
  dialog.querySelector('.form-msg').textContent = '';
}

export function openAccounts(which = 'signup', from = 'button') {
  if (!configured) return;
  if (!dialog) buildDialog();
  setMode(which);
  if (!dialog.open) dialog.showModal();
  track('accounts_open', { from, mode: which });
}
