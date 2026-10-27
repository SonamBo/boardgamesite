// The /account page: who's signed in, their record, name change, log out, delete account.
import { store } from './store.js';
import { GAMES } from './games-data.js';
import { whenReady, currentUser, displayName, signOutEverywhere, refreshUserUI, setLocalName, SYNC_KEYS } from './accounts.js';
import { updateName, saveProfile, deleteAccount, resendVerification, track } from './firebase.js';

const $ = (id) => document.getElementById(id);
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
const fmtTime = (ms) => { const t = Math.floor(ms / 1000); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };

function statCard(title, href, lines) {
  const a = document.createElement('a');
  a.className = 'stat card';
  a.href = href;
  const b = document.createElement('b');
  b.textContent = title;
  a.appendChild(b);
  lines.forEach((text, i) => {
    const p = document.createElement(i === 0 ? 'strong' : 'small');
    p.textContent = text;
    a.appendChild(p);
  });
  return a;
}

function paintStats() {
  const grid = $('acc-stats');
  grid.textContent = '';
  const cards = [];
  for (const g of GAMES) {
    if (g.record === 'wld') {
      const s = store.get(g.key, { w: 0, l: 0, d: 0 });
      cards.push({ played: (s.w || 0) + (s.l || 0) + (s.d || 0), el: statCard(g.name, '/play/' + g.slug,
        [plural(s.w || 0, 'win', 'wins'), plural(s.l || 0, 'loss', 'losses') + ' · ' + plural(s.d || 0, 'draw', 'draws')]) });
    } else {
      const s = store.get(g.key, { played: 0, won: 0, best: null });
      const extra = s.best ? ' · best ' + fmtTime(s.best) : s.top ? ' · top ' + s.top : '';
      cards.push({ played: s.played || 0, el: statCard(g.name, '/play/' + g.slug,
        [plural(s.won || 0, 'win', 'wins'), 'of ' + plural(s.played || 0, 'game', 'games') + extra]) });
    }
  }
  const daily = store.get('bgs-daily', null);
  cards.push({ played: daily ? 1 : 0, el: statCard('Daily challenge', '/play/four-in-a-row?mode=daily',
    [plural(daily && daily.streak ? daily.streak : 0, 'day', 'days'), 'current streak']) });
  // Games they've played first; the rest keep the site's order.
  cards.sort((x, y) => (y.played > 0) - (x.played > 0)).forEach((c) => grid.append(c.el));
}

function paint() {
  const user = currentUser();
  $('acc-loading').hidden = true;
  $('acc-out').hidden = !!user;
  $('acc-in').hidden = !user;
  if (!user) return;
  const name = displayName();
  $('acc-avatar').textContent = name.charAt(0).toUpperCase();
  $('acc-name').textContent = name;
  $('acc-email').textContent = user.email || '';
  const since = user.metadata && user.metadata.creationTime ? new Date(user.metadata.creationTime) : null;
  $('acc-since').textContent = since ? 'Playing since ' + since.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const usesPassword = (user.providerData || []).some((p) => p.providerId === 'password');
  $('acc-verify').hidden = !(usesPassword && !user.emailVerified);
  const input = $('acc-name-input');
  if (document.activeElement !== input) input.value = name;
  paintStats();
}

whenReady().then(paint);
window.addEventListener('bgs-user', paint);
window.addEventListener('bgs-progress', paintStats);

// ---------- Change name ----------
$('acc-name-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const user = currentUser();
  const msg = e.target.querySelector('.form-msg');
  const name = $('acc-name-input').value.trim().replace(/\s+/g, ' ').slice(0, 40);
  msg.classList.remove('error');
  if (!user) return;
  if (name.length < 2) { msg.textContent = 'Please use at least 2 characters.'; msg.classList.add('error'); return; }
  try {
    await updateName(name);
    setLocalName(name);
    await saveProfile(user.uid, { name });
    msg.textContent = 'Saved.';
    refreshUserUI();
    paint();
  } catch (err) {
    msg.textContent = 'Couldn’t save that. Please try again.';
    msg.classList.add('error');
  }
});

// ---------- Email confirmation ----------
$('acc-resend').addEventListener('click', async () => {
  const btn = $('acc-resend');
  btn.disabled = true;
  try {
    await resendVerification();
    btn.textContent = 'Sent. Check your inbox.';
  } catch (err) {
    btn.textContent = 'Couldn’t send it right now. Try again later.';
  }
});

// ---------- Log out ----------
$('acc-signout').addEventListener('click', async () => {
  await signOutEverywhere().catch(() => {});
  location.href = '/';
});

// ---------- Delete account (two taps, so it can't happen by accident) ----------
const delBtn = $('acc-delete');
const msg = $('acc-msg');
let armed = false;
delBtn.addEventListener('click', async () => {
  msg.classList.remove('error');
  if (!armed) {
    armed = true;
    delBtn.textContent = 'Yes, delete my account and record';
    msg.textContent = 'This permanently deletes your account and your saved record. Tap the red button again to confirm, or leave this page to keep it.';
    return;
  }
  delBtn.disabled = true;
  msg.textContent = 'Deleting…';
  try {
    await deleteAccount();
    SYNC_KEYS.forEach((k) => store.setQuiet(k, null));
    store.setQuiet('bgs-auth', null);
    track('account_deleted');
    msg.textContent = 'Your account has been deleted.';
    setTimeout(() => { location.href = '/'; }, 1500);
  } catch (err) {
    delBtn.disabled = false;
    armed = false;
    delBtn.textContent = 'Delete account';
    msg.classList.add('error');
    msg.textContent = err && err.code === 'auth/requires-recent-login'
      ? 'For your safety, please log out, log back in, and then delete your account.'
      : 'Couldn’t delete your account right now. Please try again, or email pixelartgames000@gmail.com.';
  }
});
