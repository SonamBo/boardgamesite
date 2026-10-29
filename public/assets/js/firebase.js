// Thin wrapper around Firebase: loads the SDK only when it is needed.
import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/11.0.2/';
const filled = (v) => typeof v === 'string' && v.length > 0 && !v.startsWith('PASTE');

export const configured = filled(firebaseConfig.apiKey) && filled(firebaseConfig.appId);

// On the real site, sign-in pages are served from boardgamesite.com itself (not firebaseapp.com),
// so Google sign-in keeps working in browsers that block third-party storage.
const ownDomain = /(^|\.)boardgamesite\.com$/.test(location.hostname);
const config = ownDomain ? { ...firebaseConfig, authDomain: 'boardgamesite.com' } : firebaseConfig;

let appPromise = null;
function getApp() {
  if (!appPromise) {
    appPromise = import(SDK + 'firebase-app.js').then((m) => m.initializeApp(config));
  }
  return appPromise;
}

// App Check: proves database requests come from this website (blocks bots and scripts).
// Uses a reCAPTCHA Enterprise key (Google Cloud → Security → Fraud Defense), registered in
// Firebase console → App Check. Only started on the real site, and only when the database is used.
const RECAPTCHA_SITE_KEY = '6LfAZAMuAAAAAKgIxSoggZr9_p1Xnhvd6bDWN_ma';
const REAL_SITE = /(^|\.)boardgamesite\.com$|^boardgamesite-80e80\.web\.app$/.test(location.hostname);
let appCheckPromise = null;
function startAppCheck(app) {
  if (!REAL_SITE) return Promise.resolve();
  if (!appCheckPromise) {
    appCheckPromise = import(SDK + 'firebase-app-check.js')
      .then((m) => m.initializeAppCheck(app, {
        provider: new m.ReCaptchaEnterpriseProvider(RECAPTCHA_SITE_KEY),
        isTokenAutoRefreshEnabled: false // fetch a token only when one is needed
      }))
      .catch(() => {});
  }
  return appCheckPromise;
}

let dbPromise = null;
function getDb() {
  if (!dbPromise) {
    dbPromise = Promise.all([getApp(), import(SDK + 'firebase-firestore.js')])
      .then(async ([app, m]) => { await startAppCheck(app); return { m, db: m.getFirestore(app) }; });
  }
  return dbPromise;
}

// ---- Accounts ----
let authPromise = null;
function getAuth() {
  if (!authPromise) {
    authPromise = Promise.all([getApp(), import(SDK + 'firebase-auth.js')]).then(([app, m]) => {
      const auth = m.getAuth(app);
      auth.useDeviceLanguage();
      return { m, auth };
    });
  }
  return authPromise;
}

// Calls back with the signed-in user (or null) now and whenever it changes.
export function onUser(callback) {
  if (!configured) { callback(null); return; }
  // Guests signed in only for online play (anonymous) don't count as having an account.
  getAuth().then(({ m, auth }) => m.onAuthStateChanged(auth, (u) => callback(u && !u.isAnonymous ? u : null))).catch(() => callback(null));
}

export async function signInWithGoogle() {
  const { m, auth } = await getAuth();
  const provider = new m.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    return (await m.signInWithPopup(auth, provider)).user;
  } catch (err) {
    // Popups blocked (common on phones in some in-app browsers): fall back to a full-page redirect.
    if (err && (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment')) {
      await m.signInWithRedirect(auth, provider);
      return null;
    }
    throw err;
  }
}

export async function signUpWithEmail(name, email, password) {
  const { m, auth } = await getAuth();
  const cred = await m.createUserWithEmailAndPassword(auth, email, password);
  if (name) await m.updateProfile(cred.user, { displayName: name });
  m.sendEmailVerification(cred.user, { url: location.origin + '/account' }).catch(() => {});
  return cred.user;
}

export async function signInWithEmail(email, password) {
  const { m, auth } = await getAuth();
  return (await m.signInWithEmailAndPassword(auth, email, password)).user;
}

export async function resetPassword(email) {
  const { m, auth } = await getAuth();
  await m.sendPasswordResetEmail(auth, email, { url: location.origin + '/' });
}

export async function updateName(name) {
  const { m, auth } = await getAuth();
  await m.updateProfile(auth.currentUser, { displayName: name });
}

export async function resendVerification() {
  const { m, auth } = await getAuth();
  if (auth.currentUser) await m.sendEmailVerification(auth.currentUser, { url: location.origin + '/account' });
}

export async function signOutUser() {
  const { m, auth } = await getAuth();
  await m.signOut(auth);
}

// Deletes the player's saved data, then the account itself.
// Throws auth/requires-recent-login if they signed in too long ago; the caller asks them to sign in again.
export async function deleteAccount() {
  const { m, auth } = await getAuth();
  const user = auth.currentUser;
  if (!user) return;
  const { m: fm, db } = await getDb();
  await fm.deleteDoc(fm.doc(db, 'users', user.uid));
  await m.deleteUser(user);
}

// ---- Online play (rooms/{id}) ----
// The Firestore module and database, for online.js. Loaded only when online play is used.
export const firestore = () => getDb();
// The signed-in user, signing in as an anonymous guest if nobody is (needs Anonymous sign-in enabled).
export async function ensureUser() {
  const { m, auth } = await getAuth();
  await auth.authStateReady();
  if (auth.currentUser) return auth.currentUser;
  return (await m.signInAnonymously(auth)).user;
}

// ---- The signed-in player's saved progress (users/{uid}) ----
export async function loadProfile(uid) {
  const { m, db } = await getDb();
  const snap = await m.getDoc(m.doc(db, 'users', uid));
  return snap.exists() ? snap.data() : null;
}

export async function saveProfile(uid, data, isNew) {
  const { m, db } = await getDb();
  const ref = m.doc(db, 'users', uid);
  const payload = { ...data, updatedAt: m.serverTimestamp() };
  if (isNew) payload.createdAt = m.serverTimestamp();
  await m.setDoc(ref, payload, { merge: true });
}

// ---- Analytics (only started after the visitor accepts the cookie banner) ----
let analyticsPromise = null;
export function startAnalytics() {
  if (!configured || !filled(firebaseConfig.measurementId) || analyticsPromise) return;
  analyticsPromise = Promise.all([getApp(), import(SDK + 'firebase-analytics.js')])
    .then(async ([app, m]) => ((await m.isSupported()) ? { m, analytics: m.getAnalytics(app) } : null))
    .catch(() => null);
}

export function track(name, params) {
  if (!analyticsPromise) return;
  analyticsPromise.then((x) => { if (x) x.m.logEvent(x.analytics, name, params || {}); });
}

// ---- Firestore: add-only entries (newsletter, contact messages) ----
export async function addEntry(collectionName, data) {
  if (!configured) throw new Error('not-configured');
  const { m, db } = await getDb();
  await m.addDoc(m.collection(db, collectionName), { ...data, createdAt: m.serverTimestamp() });
}
