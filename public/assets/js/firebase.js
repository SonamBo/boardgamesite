// Thin wrapper around Firebase: loads the SDK only when it is needed.
import { firebaseConfig } from './firebase-config.js';

const SDK = 'https://www.gstatic.com/firebasejs/11.0.2/';
const filled = (v) => typeof v === 'string' && v.length > 0 && !v.startsWith('PASTE');

export const configured = filled(firebaseConfig.apiKey) && filled(firebaseConfig.appId);

let appPromise = null;
function getApp() {
  if (!appPromise) {
    appPromise = import(SDK + 'firebase-app.js').then((m) => m.initializeApp(firebaseConfig));
  }
  return appPromise;
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
  const [app, m] = await Promise.all([getApp(), import(SDK + 'firebase-firestore.js')]);
  const db = m.getFirestore(app);
  await m.addDoc(m.collection(db, collectionName), { ...data, createdAt: m.serverTimestamp() });
}
