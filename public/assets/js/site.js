// Shared behaviour for every page: menu, cookie consent, accounts dialog, forms, daily streak.
import { configured, startAnalytics, track, addEntry } from './firebase.js';

const CONTACT_EMAIL = 'pixelartgames000@gmail.com';

// ---------- Safe localStorage ----------
export const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage blocked */ }
  }
};

export function dateKey(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
export function yesterdayKey() {
  const d = new Date(); d.setDate(d.getDate() - 1); return dateKey(d);
}

// ---------- Mobile menu ----------
const sidebar = document.querySelector('.sidebar');
const toggle = document.querySelector('.menu-toggle');
if (sidebar && toggle) {
  toggle.addEventListener('click', () => {
    const open = sidebar.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
  });
}

// ---------- Home-screen app ----------
// Offline helper: only on the real site (not in previews).
const APP_HOSTS = /(^|\.)boardgamesite\.com$|\.web\.app$|\.firebaseapp\.com$|^localhost$|^127\.0\.0\.1$/;
if ('serviceWorker' in navigator && APP_HOSTS.test(location.hostname)) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
// "Install app" button, shown only when the browser offers installing.
const installBtn = document.getElementById('install-app');
let installPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  installPrompt = e;
  if (installBtn) installBtn.hidden = false;
});
installBtn?.addEventListener('click', async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  const choice = await installPrompt.userChoice.catch(() => null);
  track('app_install_prompt', { outcome: choice ? choice.outcome : 'unknown' });
  installPrompt = null;
  installBtn.hidden = true;
});
window.addEventListener('appinstalled', () => {
  if (installBtn) installBtn.hidden = true;
  track('app_installed');
});

// ---------- Footer year ----------
document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });

// ---------- Cookie consent → analytics ----------
const consent = store.get('bgs-consent', null);
if (consent === 'yes') startAnalytics();
if (consent === null && configured) showConsent();

function showConsent() {
  const box = document.createElement('div');
  box.className = 'consent';
  box.setAttribute('role', 'region');
  box.setAttribute('aria-label', 'Cookie choice');
  box.innerHTML =
    '<p>We use analytics cookies to see which games people enjoy. ' +
    '<a href="/privacy">Privacy Policy</a></p>' +
    '<div class="btns"><button type="button" class="btn btn-outline" data-c="no">Decline</button>' +
    '<button type="button" class="btn btn-gold" data-c="yes">Accept</button></div>';
  box.addEventListener('click', (e) => {
    const choice = e.target.closest('button')?.dataset.c;
    if (!choice) return;
    store.set('bgs-consent', choice);
    if (choice === 'yes') startAnalytics();
    box.remove();
  });
  document.body.appendChild(box);
}

// ---------- Accounts "coming soon" dialog ----------
let dialog = null;
function accountsDialog() {
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.setAttribute('aria-labelledby', 'acc-title');
  dialog.innerHTML =
    '<button type="button" class="dialog-close" aria-label="Close">' +
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>' +
    '<div class="dialog-inner">' +
    '<img src="/assets/img/mascot-wave.webp" alt="" width="254" height="196">' +
    '<h2 id="acc-title">Accounts are coming soon</h2>' +
    '<p class="text-2">Profiles, saved stats and leaderboards are on the way. Leave your email and we’ll tell you when they open.</p>' +
    '<form class="nl-form" data-newsletter="accounts" novalidate>' +
    '<label class="visually-hidden" for="acc-email">Email address</label>' +
    '<input id="acc-email" type="email" name="email" autocomplete="email" placeholder="you@example.com" required>' +
    '<button type="submit" class="btn btn-gold btn-block">Notify me</button>' +
    '<p class="form-msg" role="status"></p></form></div>';
  dialog.querySelector('.dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  document.body.appendChild(dialog);
  wireNewsletter(dialog.querySelector('form'));
  return dialog;
}
document.addEventListener('click', (e) => {
  const opener = e.target.closest('[data-open-accounts]');
  if (!opener) return;
  e.preventDefault();
  sidebar?.classList.remove('open');
  accountsDialog().showModal();
  track('accounts_interest', { from: opener.dataset.openAccounts || 'button' });
});

// ---------- Forms ----------
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
function setMsg(el, text, isError) {
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('error', !!isError);
}

function wireNewsletter(form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = form.querySelector('input[type=email]');
    const msg = form.querySelector('.form-msg');
    const btn = form.querySelector('button[type=submit]');
    const email = input.value.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { setMsg(msg, 'Please enter a valid email address.', true); input.focus(); return; }
    if (!configured) { setMsg(msg, 'Signups open very soon. For now, email ' + CONTACT_EMAIL + '.', true); return; }
    btn.disabled = true;
    try {
      await addEntry('newsletter', { email, source: form.dataset.newsletter || 'home' });
      form.reset();
      setMsg(msg, 'You’re on the list. We’ll be in touch when something new lands.');
      track('newsletter_signup', { source: form.dataset.newsletter || 'home' });
    } catch (err) {
      setMsg(msg, 'Something went wrong. Please try again in a moment.', true);
    } finally {
      btn.disabled = false;
    }
  });
}
document.querySelectorAll('form[data-newsletter]').forEach(wireNewsletter);

const contact = document.querySelector('form[data-contact]');
if (contact) {
  contact.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = contact.querySelector('.form-msg');
    const btn = contact.querySelector('button[type=submit]');
    const name = contact.name.value.trim();
    const email = contact.email.value.trim();
    const message = contact.message.value.trim();
    if (!name) { setMsg(msg, 'Please add your name.', true); contact.name.focus(); return; }
    if (!EMAIL_RE.test(email)) { setMsg(msg, 'Please enter a valid email address.', true); contact.email.focus(); return; }
    if (!message) { setMsg(msg, 'Please write a message.', true); contact.message.focus(); return; }
    if (!configured) { setMsg(msg, 'The form isn’t switched on yet. Please email ' + CONTACT_EMAIL + '.', true); return; }
    btn.disabled = true;
    try {
      await addEntry('messages', { name: name.slice(0, 100), email, message: message.slice(0, 5000) });
      contact.reset();
      setMsg(msg, 'Thanks! Your message is in. We usually reply within a few days.');
      track('contact_submit');
    } catch (err) {
      setMsg(msg, 'Something went wrong. Please email ' + CONTACT_EMAIL + ' instead.', true);
    } finally {
      btn.disabled = false;
    }
  });
}

// ---------- Daily challenge streak (home page) ----------
const streakEl = document.querySelector('[data-streak]');
if (streakEl) {
  const d = store.get('bgs-daily', null);
  if (d && d.date === dateKey() && d.solved) {
    streakEl.textContent = 'Solved today · ' + d.streak + '-day streak';
  } else if (d && d.date === dateKey()) {
    streakEl.textContent = 'Played today · new one at midnight';
  } else if (d && d.streak > 0 && d.lastSolved === yesterdayKey()) {
    streakEl.textContent = d.streak + '-day streak · keep it going';
  }
}
