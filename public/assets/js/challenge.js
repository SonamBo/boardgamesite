// "Beat my score" challenges: after a win, a player sends a link to the exact same deal, board or puzzle
// with their time attached. Whoever opens it plays that deal with the score to beat in view, and can
// challenge back when they finish. The link carries only the deal, the options and the result: no name,
// no account, nothing personal.
//
// A game uses it in four places:
//   const CH = challengeFor('solitaire');                 // the challenge in the address, if it's for this game
//   if (CH) store.set(<level key>, CH.o)                   // before reading its level or draw setting
//   const { seed, st } = takeSeed(fallbackSeed)            // in newGame(): the challenge's deal first, then fresh ones
//   challengeWin({ seed, o, t, m, st })                    // in win(): offer "Challenge a friend" or show who won
import { track } from './firebase.js';
import { fmt } from './solo.js';

const T = (s) => (window.BGS_T ? window.BGS_T(s) : s);
const NOUN = { solitaire: 'deal', freecell: 'deal', mines: 'board', sudoku: 'puzzle', 'sliding-tiles': 'puzzle' };

let current = null;   // the challenge the page was opened with
let used = false;     // its deal has been dealt once (a retry reloads the page and deals it again)
let gameKey = '';

function decode(c) {
  try {
    const j = JSON.parse(atob(c.replace(/-/g, '+').replace(/_/g, '/')));
    if (!j || typeof j.g !== 'string' || !Number.isFinite(j.s) || !Number.isFinite(j.t)) return null;
    if (j.t <= 0 || j.t > 864e5 || (j.m != null && !(j.m >= 0 && j.m < 1e6))) return null;
    return { g: j.g, s: j.s >>> 0, o: j.o, t: Math.round(j.t), m: j.m == null ? null : Math.round(j.m), st: j.st == null ? null : j.st | 0 };
  } catch (e) { return null; }
}
function encode(o) {
  return btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export const newSeed = () => (Math.random() * 4294967296) >>> 0;

// The challenge in this page's address, when it is for this game. Shows the banner and counts the visit.
export function challengeFor(game) {
  gameKey = game;
  const c = new URLSearchParams(location.search).get('c');
  const ch = c && decode(c);
  if (!ch || ch.g !== game) return null;
  current = ch;
  track('challenge_open', { game });
  const show = () => banner(ch);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show); else show();
  return ch;
}

// The seed for a new game: the challenge's (once), then a fresh one, at which point the challenge is over.
export function takeSeed(fresh) {
  if (current && !used) { used = true; return { seed: current.s, st: current.st, challenge: current }; }
  if (current) endChallenge();
  return { seed: fresh != null ? fresh : newSeed(), st: null, challenge: null };
}
export const inChallenge = () => current && used;

function endChallenge() {
  current = null;
  document.querySelector('.chal-banner')?.remove();
  const u = new URL(location.href);
  if (u.searchParams.has('c')) { u.searchParams.delete('c'); history.replaceState(null, '', u.pathname + u.search + u.hash); }
}

function banner(ch) {
  const head = document.querySelector('.board-head');
  if (!head || document.querySelector('.chal-banner')) return;
  const noun = NOUN[gameKey] || 'deal';
  const el = document.createElement('div');
  el.className = 'chal-banner card';
  el.setAttribute('role', 'status');
  el.innerHTML =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/></svg>' +
    '<div><p class="chal-title"></p><p class="chal-sub"></p>' + (ch.st != null ? '<p class="chal-note"></p>' : '') + '</div>' +
    '<button type="button" class="btn btn-outline chal-skip"></button>';
  el.querySelector('.chal-title').textContent = 'You’ve been challenged!';
  el.querySelector('.chal-sub').textContent = 'Beat ' + fmt(ch.t) + ' on this exact ' + noun + '.' + (ch.m != null ? ' Their result: ' + ch.m + ' moves.' : '');
  if (ch.st != null) el.querySelector('.chal-note').textContent = 'Start on the marked square, so you both get the same opening.';
  el.querySelector('.chal-skip').textContent = 'Play a different game';
  el.querySelector('.chal-skip').addEventListener('click', () => { endChallenge(); document.getElementById('new-game')?.click(); });
  // above the title, so the board keeps its place right after it; then let the board re-fit to the space left
  head.before(el);
  window.dispatchEvent(new Event('resize'));
}

// ---------- After a win ----------
// r = { seed, o, t (ms), m (moves, optional), st (Minesweeper's first square, optional) }
export function challengeWin(r) {
  const sub = document.getElementById('result-sub');
  if (!sub || r.seed == null) return;
  document.querySelector('.chal-box')?.remove();
  const box = document.createElement('div');
  box.className = 'chal-box';
  const noun = NOUN[gameKey] || 'deal';
  const was = inChallenge() ? current : null;
  let line = '', lost = false;
  if (was) {
    // compared in whole seconds, as shown on screen; equal seconds go to fewer moves
    const d = Math.floor(r.t / 1000) - Math.floor(was.t / 1000);
    const dm = r.m != null && was.m != null ? r.m - was.m : 0;
    const beat = d < 0 || (d === 0 && dm < 0);
    lost = d > 0 || (d === 0 && dm > 0);
    line = d < 0 ? 'You beat their time by ' + fmt(-d * 1000) + '!'
      : d > 0 ? 'They were faster by ' + fmt(d * 1000) + '. Try again?'
      : dm < 0 ? 'Same time, but you used ' + -dm + ' fewer moves. You win!'
      : dm > 0 ? 'Same time, but they used ' + dm + ' fewer moves. Try again?'
      : 'A tie: exactly the same time!';
    track('challenge_finish', { game: gameKey, beat });
  } else line = 'Send this exact ' + noun + ' to a friend and see who’s faster.';
  box.innerHTML = '<p class="chal-line"></p><div class="chal-btns"></div><p class="chal-done" role="status" hidden></p>';
  box.querySelector('.chal-line').textContent = line;
  const btns = box.querySelector('.chal-btns');
  const send = document.createElement('button');
  send.type = 'button';
  send.className = 'btn btn-green chal-send';
  send.textContent = was ? 'Challenge them back' : 'Challenge a friend';
  // the picture is drawn now, so a tap shares at once (phones only open the share sheet straight after a tap)
  const name = (document.getElementById('board-title')?.textContent || '').trim();
  const pic = card(name, r).catch(() => null);
  send.addEventListener('click', () => share(r, box, name, pic));
  btns.appendChild(send);
  if (was && lost) {
    const again = document.createElement('button');
    again.type = 'button';
    again.className = 'btn btn-outline';
    again.textContent = 'Try this ' + noun + ' again';
    again.addEventListener('click', () => location.reload());
    btns.appendChild(again);
  }
  sub.after(box);
}

async function share(r, box, name, pic) {
  const noun = NOUN[gameKey] || 'deal';
  const u = new URL(location.origin + location.pathname);
  u.searchParams.set('c', encode({ g: gameKey, s: r.seed, o: r.o, t: Math.round(r.t), m: r.m, st: r.st }));
  const url = u.toString();
  const text = T('I finished ' + name + ' in ' + fmt(r.t) + '. Can you beat me on the same ' + noun + '?');
  track('challenge_create', { game: gameKey });
  const done = box.querySelector('.chal-done');
  const touch = matchMedia('(pointer: coarse)').matches;
  const file = await pic;   // usually ready long before the tap
  try {
    if (touch && navigator.share) {
      // the link goes in the text too: some apps drop the url when a picture is attached
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ files: [file], text: text + ' ' + url });
      else await navigator.share({ text, url });
      return;
    }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  try {
    await navigator.clipboard.writeText(text + ' ' + url);
    done.textContent = 'Challenge link copied. Paste it to a friend.';
  } catch (e) {
    done.textContent = url;
  }
  done.hidden = false;
  if (file && !box.querySelector('.chal-pic')) {
    const a = document.createElement('a');
    a.className = 'link-green chal-pic';
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.textContent = 'Download the picture';
    done.after(a);
  }
}

// A picture to send with the link: the game, the time, the moves, and a dare.
async function card(name, r) {
  const W = 1200, H = 630;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  try { await Promise.all([document.fonts.load('700 64px Fredoka'), document.fonts.load('700 40px Nunito')]); } catch (e) { /* system fonts */ }
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, '#3A1B12'); bg.addColorStop(1, '#6B2A17');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.fillStyle = '#F07A2B'; g.fillRect(0, 0, W, 14);
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#F7B455'; g.font = '700 44px Fredoka, sans-serif';
  g.fillText('BoardGameSite', 72, 104);
  g.fillStyle = '#FFF4E6'; g.font = '700 68px Fredoka, sans-serif';
  g.fillText(name.slice(0, 28), 72, 214);
  g.font = '700 200px Fredoka, sans-serif';
  g.fillText(fmt(r.t), 64, 420);
  if (r.m != null) { g.fillStyle = '#F3D9C0'; g.font = '700 46px Nunito, sans-serif'; g.fillText(T(r.m + ' moves'), 72, 488); }
  g.fillStyle = '#F7B455'; g.font = '700 44px Nunito, sans-serif';
  g.fillText(T('Can you beat me?'), 72, 572);
  g.fillStyle = '#F3D9C0'; g.font = '600 36px Nunito, sans-serif';
  g.textAlign = 'right'; g.fillText('boardgamesite.com', W - 64, 572);
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  return new File([blob], 'boardgamesite-challenge.png', { type: 'image/png' });
}
