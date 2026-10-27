// Safe localStorage, plus a change signal used to sync progress to a player's account.

const listeners = [];

export const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch (e) { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage blocked */ }
    listeners.forEach((fn) => fn(key, value));
  },
  // Writes without telling listeners (used when progress arrives from the account).
  setQuiet(key, value) {
    try {
      if (value === null || value === undefined) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* storage blocked */ }
  },
  onChange(fn) { listeners.push(fn); }
};

// Game pages listen for this to re-read scores after an account's saved progress is loaded.
export const PROGRESS_EVENT = 'bgs-progress';
export function onProgressLoaded(fn) { window.addEventListener(PROGRESS_EVENT, fn); }
