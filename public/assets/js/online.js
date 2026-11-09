// Online play with a friend: one Firestore document per game (rooms/{id}), see docs/ONLINE.md.
// A game page calls online(slug, adapter) and gets back helpers. Firestore loads only when used.
import { firestore, ensureUser, track } from './firebase.js';
import { setStatus } from './game-ui.js';
import { play } from './sound.js';

const params = new URLSearchParams(location.search);
const ROOM = /^[a-z0-9]{8}$/.test(params.get('room') || '') ? params.get('room') : null;
const FAKE = params.get('fake') === '1';
const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => 'abcdefghijklmnopqrstuvwxyz0123456789'[b % 36]).join('');

// ---------- Backends: Firestore, or localStorage between two tabs for testing ----------
async function firebaseBackend() {
  const user = await ensureUser();
  const { m, db } = await firestore();
  const ref = (id) => m.doc(db, 'rooms', id);
  return {
    uid: user.uid,
    name: user.isAnonymous ? 'Guest' : (user.displayName || 'Player').slice(0, 30),
    create: (id, data) => m.setDoc(ref(id), { ...data, c: m.serverTimestamp(), u: m.serverTimestamp() }),
    update: (id, data) => m.updateDoc(ref(id), { ...data, u: m.serverTimestamp() }),
    get: async (id) => { const s = await m.getDoc(ref(id)); return s.exists() ? s.data() : null; },
    watch: (id, cb) => m.onSnapshot(ref(id), (s) => cb(s.exists() ? s.data() : null), () => cb(undefined))
  };
}
function fakeBackend() {
  let uid = sessionStorage.getItem('fake-uid');
  if (!uid) { uid = newId(); sessionStorage.setItem('fake-uid', uid); }
  const key = (id) => 'fake-room-' + id;
  const read = (id) => JSON.parse(localStorage.getItem(key(id)) || 'null');
  const write = (id, d) => { localStorage.setItem(key(id), JSON.stringify(d)); window.dispatchEvent(new Event('fake-room')); };
  return {
    uid, name: 'Tab ' + uid.slice(0, 3),
    create: async (id, data) => write(id, { ...data, c: Date.now(), u: Date.now() }),
    update: async (id, data) => write(id, { ...read(id), ...data, u: Date.now() }),
    get: async (id) => read(id),
    watch: (id, cb) => { const f = () => cb(read(id)); window.addEventListener('storage', f); window.addEventListener('fake-room', f); f(); return () => {}; }
  };
}

// ---------- The invite / status box in the side panel ----------
function box() {
  let el = document.getElementById('online-box');
  if (el) return el;
  el = document.createElement('div');
  el.id = 'online-box';
  el.className = 'panel-box card online-box';
  const anchor = document.querySelector('.panel .seg') ? document.querySelector('.panel .seg').closest('div[style]') || document.querySelector('.panel .seg') : null;
  const panel = document.querySelector('.panel');
  if (anchor && anchor.parentElement === panel) anchor.after(el); else panel.prepend(el);
  return el;
}

/*
  adapter = {
    reset(),            start a fresh game on this board
    apply(token),       play a move from either side (already legal on the other board)
    seatName(seat),     'White' / 'Black' etc.
    over(),             true when the game has ended on this board
    onlineChanged(on)   (optional) the page switches online mode on/off (hide computer options etc.)
  }
  returns { active(), mySeat(), myTurn(seat), send(token, nextSeat, finished), finish() }
*/
export const roomInLink = !!ROOM;
export function online(slug, adapter) {
  // slug can carry a variant, like 'hex:9'; adapter.variant(v) sets it on the joining board
  const gameOf = () => (adapter.variant ? slug + ':' + adapter.variant() : slug);
  let api = null, room = null, data = null, seat = -1, applied = 0, stop = null, sending = false;
  let problem = null, lost = false; // { text, login, retry }: shown in the box, where the board's own status can't overwrite it
  const el = box();

  const link = () => location.origin + location.pathname + '?room=' + room + (FAKE ? '&fake=1' : '');
  function paint() {
    if (!room && problem) {
      el.innerHTML = '<h2>Online game</h2><p class="text-2">' + problem.text + '</p><div class="ol-row">' +
        (problem.login ? '<button type="button" class="btn btn-gold raised" data-open-accounts="online">Sign up or log in</button>' : '') +
        (problem.retry ? '<button type="button" class="btn btn-outline" id="ol-retry">Try again</button>' : '') +
        '<button type="button" class="btn btn-outline" id="ol-close">Play here instead</button></div>';
      const r = el.querySelector('#ol-retry');
      if (r) r.onclick = () => { const id = problem.retry; problem = null; api = null; id === true ? startRoom() : join(id); };
      el.querySelector('#ol-close').onclick = () => { problem = null; history.replaceState(null, '', location.pathname); paint(); };
      return;
    }
    if (!room) {
      el.innerHTML = '<h2>Play a friend online</h2><p class="text-2">Get a link to send to a friend. You’ll play on separate devices.</p><button type="button" class="btn btn-outline btn-block" id="ol-start">Create a game link</button>';
      el.querySelector('#ol-start').onclick = startRoom;
      return;
    }
    if (!data) { el.innerHTML = '<p class="text-2">Connecting…</p>'; return; }
    const them = data.n[1 - seat] || 'your friend';
    if (data.s === 'wait') {
      el.innerHTML = '<h2>Waiting for your friend</h2><p class="text-2">Send this link. The game starts when they open it on their device (logged out, or with their own account, not yours).</p>' +
        '<input class="ol-link" readonly value="' + link() + '" aria-label="Game link"><div class="ol-row"><button type="button" class="btn btn-gold raised" id="ol-copy">Copy link</button><button type="button" class="btn btn-outline" id="ol-leave">Cancel</button></div>';
      el.querySelector('#ol-copy').onclick = share;
      el.querySelector('#ol-leave').onclick = leave;
      return;
    }
    if (lost) {
      el.innerHTML = '<h2>Online game</h2><p class="text-2">Your last move didn’t reach your friend. Reload to get both boards back in step.</p><div class="ol-row"><button type="button" class="btn btn-gold raised" id="ol-reload">Reload</button></div>';
      el.querySelector('#ol-reload').onclick = () => location.reload();
      return;
    }
    const done = data.s === 'done';
    el.innerHTML = '<h2>Online game</h2><p class="text-2">You are <b>' + adapter.seatName(seat) + '</b> against <b>' + escapeHtml(them) + '</b>.</p>' +
      (done ? '<div class="ol-row"><button type="button" class="btn btn-gold raised" id="ol-rematch">Rematch</button><button type="button" class="btn btn-outline" id="ol-leave">Leave</button></div>'
        : '<div class="ol-row"><button type="button" class="btn btn-outline" id="ol-resign">Resign</button><button type="button" class="btn btn-outline" id="ol-leave">Leave</button></div>');
    const q = (id) => el.querySelector(id);
    if (q('#ol-resign')) q('#ol-resign').onclick = resign;
    if (q('#ol-rematch')) q('#ol-rematch').onclick = rematch;
    q('#ol-leave').onclick = leave;
  }
  const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  async function backend() {
    if (!api) api = FAKE ? fakeBackend() : await firebaseBackend();
    return api;
  }
  async function startRoom() {
    try {
      el.innerHTML = '<p class="text-2">Creating a game…</p>';
      const b = await backend();
      const id = newId();
      await b.create(id, { g: gameOf(), p: [b.uid, ''], n: [b.name, ''], m: [], t: 0, s: 'wait' });
      track('online_create', { game: slug });
      history.replaceState(null, '', location.pathname + '?room=' + id + (FAKE ? '&fake=1' : ''));
      join(id);
    } catch (e) { failed(e, true); }
  }
  async function join(id) {
    try {
      room = id; paint();
      const b = await backend();
      let d = await b.get(id);
      if (!d || d.g.split(':')[0] !== slug) { room = null; problem = { text: 'That game link isn’t valid any more. Ask your friend for a new one.' }; setStatus('That game link isn’t valid any more', 'neutral'); return paint(); }
      if (d.s === 'wait' && d.p[0] !== b.uid && !d.p[1]) {
        await b.update(id, { p: [d.p[0], b.uid], n: [d.n[0], b.name], s: 'play' });
        track('online_join', { game: slug });
      } else if (!d.p.includes(b.uid)) { room = null; problem = { text: 'This game already has two players.' }; setStatus('This game already has two players', 'neutral'); return paint(); }
      seat = -1; applied = 0;
      if (adapter.variant && d.g.includes(':')) adapter.variant(d.g.split(':')[1]);
      if (adapter.onlineChanged) adapter.onlineChanged(true);
      adapter.reset();
      stop = b.watch(id, onData);
    } catch (e) { failed(e, id); }
  }
  function onData(d) {
    if (d === undefined) { setStatus('Lost the connection to the online game', 'neutral'); return; }
    if (!d) { leave(); return; }
    const was = data;
    data = d;
    if (seat < 0) { seat = d.p.indexOf(api.uid); if (adapter.onlineChanged) adapter.onlineChanged(true); }
    // counted once per game: only the host's board reports the end
    if (seat === 0 && d.s === 'done' && !(was && was.s === 'done')) track('online_end', { game: slug, moves: d.m.length, resigned: typeof d.x === 'number' });
    // play any moves we haven't shown yet
    while (applied < d.m.length) { adapter.apply(d.m[applied]); applied++; }
    if (was && was.s !== d.s && adapter.onlineChanged) adapter.onlineChanged(true);
    if (was && was.s === 'wait' && d.s === 'play') { play('found'); setStatus('Your friend joined. ' + (seat === 0 ? 'Your move' : 'Their move'), ''); }
    if (d.s === 'done' && typeof d.x === 'number' && !(was && was.s === 'done')) setStatus((d.x === seat ? 'You resigned' : (d.n[d.x] || 'Your friend') + ' resigned'), d.x === seat ? 'cpu' : '');
    if (d.r && (!was || was.r !== d.r) && d.r !== room) { location.href = location.pathname + '?room=' + d.r + (FAKE ? '&fake=1' : ''); return; }
    if (lost) { setStatus('That move didn’t reach your friend', 'neutral'); paint(); return; }
    if (d.s === 'play' && !adapter.over()) setStatus(d.t === seat ? 'Your move' : 'Waiting for ' + (d.n[d.t] || 'your friend'), d.t === seat ? '' : 'cpu');
    paint();
  }
  async function share() {
    try {
      if (navigator.share && matchMedia('(pointer: coarse)').matches) await navigator.share({ title: 'Play me online', url: link() });
      else { await navigator.clipboard.writeText(link()); setStatus('Link copied. Send it to your friend', 'neutral'); }
    } catch (e) { /* cancelled */ }
  }
  async function resign() {
    if (!data || data.s !== 'play') return;
    await api.update(room, { s: 'done', x: seat });
  }
  async function rematch() {
    track('online_rematch', { game: slug });
    const id = newId();
    await api.create(id, { g: gameOf(), p: [api.uid, ''], n: [api.name, ''], m: [], t: 0, s: 'wait' });
    await api.update(room, { s: 'done', r: id });
  }
  function leave() {
    if (stop) stop();
    room = null; data = null; seat = -1; stop = null;
    history.replaceState(null, '', location.pathname);
    if (adapter.onlineChanged) adapter.onlineChanged(false);
    adapter.reset();
    paint();
  }
  function failed(e, retry) {
    const code = (e && e.code) || '';
    const login = code.includes('operation-not-allowed') || code.includes('admin-restricted');
    console.warn('[online]', code || e);
    track('online_error', { game: slug, code: String(code || 'unknown').slice(0, 40) });
    room = null; data = null; api = null;
    problem = login
      ? { text: 'Log in (it’s free) to play online, then tap Try again.', login: true, retry }
      : { text: 'Couldn’t connect to the online game. Check your connection and try again.', retry };
    paint();
    setStatus(login ? 'Log in to play online' : 'Couldn’t connect to the online game', 'neutral');
  }

  paint();
  if (ROOM) join(ROOM);

  return {
    active: () => !!room && !!data && data.s !== 'wait',
    waiting: () => !!room && (!data || data.s === 'wait'),
    mySeat: () => seat,
    myTurn: () => !!data && data.s === 'play' && data.t === seat,
    // after playing a move on this board: tell the other board
    async send(token, nextSeat, finished = false) {
      if (!data || sending) return;
      sending = true;
      applied++;
      data = { ...data, m: data.m.concat([token]), t: nextSeat, s: finished ? 'done' : 'play' };
      try { await api.update(room, { m: data.m, t: nextSeat, s: data.s }); }
      catch (e) { console.warn('[online] move not saved', e && e.code); track('online_error', { game: slug, code: 'move-' + String((e && e.code) || 'unknown').slice(0, 30) }); lost = true; setStatus('That move didn’t reach your friend', 'neutral'); }
      sending = false;
      paint();
    }
  };
}
