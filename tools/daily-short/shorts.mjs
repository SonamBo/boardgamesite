// Builds the "script" for a daily-challenge YouTube Short: what's on screen, when, and what it says.
// render.mjs turns a script into video with short.html; this file only decides content and timing.
//
//   import { shortsFor } from './shorts.mjs';
//   shortsFor('2026-11-01')  →  three scripts: one per daily challenge of the day before (2026-10-31)
//
// Every Short solves one challenge from the previous day, so nothing live is ever spoiled, and explains the
// puzzle from scratch: the viewer needn't have seen it. The puzzles come from the site's own code, so the
// video matches exactly what players got that day.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const JS = (f) => resolve(ROOT, 'public/assets/js', f);

// daily.js reads saved progress through localStorage; give it an empty one so it loads outside a browser.
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
globalThis.window ??= globalThis;
globalThis.document ??= { addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], documentElement: { dataset: {} } };

const Daily = await import(JS('daily.js'));
const C4 = await import(JS('c4-engine.js'));
const CH = await import(JS('chess-engine.js'));
const { pieceSvg } = await import(JS('chess-pieces.js'));
const CK = await import(JS('checkers-engine.js'));
const MC = await import(JS('mancala-rules.js'));
const SDK = await import(JS('sudoku-engine.js'));
const { ANSWERS, GUESSES } = await import(JS('words-5.js'));
const WL = await import(JS('word-lib.js'));

// ---------- Copies of small page-only helpers (their pages need a browser). Keep in step with the originals. ----------
// solo.js
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function seedFrom(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function dayNumber(date) {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(2026, 0, 1)) / 86400000) + 1;
}
// daily-page.js
const GOALS = ['mate', 'win', 'capture', 'again'];
function puzzlePool(course) {
  const out = [];
  for (const u of course.units) for (const l of u.lessons) for (const s of l.steps) {
    if (s.type !== 'move' || s.position === undefined || s.goal === 'any') continue;
    if ((u.stage === 'strategy' && !(s.accept && s.accept.length > 1)) || (!s.accept && !s.line && GOALS.includes(s.goal))) out.push({ step: s, lesson: l });
  }
  return out;
}
function todaysPick(pool, d) {
  const day = Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5);
  return pool[(day * 7 + 3) % pool.length];
}
// word-guess.js
const split5 = (s) => s.match(/.{5}/g);
const ANSWER_LIST = split5(ANSWERS);
const VALID = new Set([...split5(GUESSES), ...ANSWER_LIST]);
function dailyWord(date) {
  const order = ANSWER_LIST.map((_, i) => i);
  const r = rng(20261028);
  for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
  const day = dayNumber(date);
  return ANSWER_LIST[order[((day % order.length) + order.length) % order.length]];
}
function wgScore(guess, target) {
  const res = [0, 0, 0, 0, 0];
  const left = {};
  for (let i = 0; i < 5; i++) { if (guess[i] === target[i]) res[i] = 2; else left[target[i]] = (left[target[i]] || 0) + 1; }
  for (let i = 0; i < 5; i++) if (res[i] !== 2 && left[guess[i]]) { res[i] = 1; left[guess[i]]--; }
  return res;
}
// letter-hive.js
const letterSet = (w) => [...new Set(w)].sort().join('');
const hiveCandidates = () => WL.words().slice(0, 20000).filter((w) => w.length >= 7 && !w.includes('s') && new Set(w).size === 7);
function hiveWordsFor(letters, centre) {
  const ok = new Set(letters);
  return WL.words().filter((w) => w.length >= 4 && w.includes(centre) && [...w].every((ch) => ok.has(ch)));
}
const hivePoints = (w, letters) => (w.length === 4 ? 1 : w.length) + (new Set(w).size === 7 && [...letters].every((ch) => w.includes(ch)) ? 7 : 0);
function hiveMake(rand) {
  const pool = hiveCandidates();
  for (let t = 0; t < 300; t++) {
    const pan = pool[Math.floor(rand() * pool.length)];
    const letters = letterSet(pan);
    const centres = WL.shuffled([...letters], rand);
    for (const centre of centres) {
      const list = hiveWordsFor(letters, centre);
      if (list.length >= 18 && list.length <= 60) return { letters, centre, list, total: list.reduce((a, w) => a + hivePoints(w, letters), 0) };
    }
  }
  const letters = letterSet('playing'), centre = 'a', list = hiveWordsFor(letters, centre);
  return { letters, centre, list, total: list.reduce((a, w) => a + hivePoints(w, letters), 0) };
}

// ---------- Dates ----------
export const keyOf = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
const dateOf = (key) => new Date(key + 'T12:00:00');
export function dayBefore(key) { const d = dateOf(key); d.setDate(d.getDate() - 1); return keyOf(d); }
const nice = (key) => dateOf(key).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });

const course = (g) => JSON.parse(readFileSync(resolve(ROOT, 'public/assets/learn', g + '.json'), 'utf8'));

// ---------- Timeline helper ----------
// Builds the timed lists the page draws from. Times are seconds from the start of the Short.
class Timeline {
  constructor(kind, start) {
    this.s = { kind, keys: [{ t: 0, pos: start }], anims: [], marks: [], caps: [], sounds: [], timer: null, dips: [], extra: {} };
    this.pos = start;
    this.t = 0;
  }
  key(t, pos) { this.s.keys.push({ t, pos }); this.pos = pos; }
  anim(a, b, data, after, sound) {
    this.s.anims.push({ a, b, before: this.pos, ...data });
    this.key(b, after);
    if (sound) for (const [dt, name] of [].concat(sound.length && Array.isArray(sound[0]) ? sound : [sound])) this.s.sounds.push({ t: b + dt, name });
  }
  mark(a, b, cells, style, pulse = false) { this.s.marks.push({ a, b, cells, style, pulse }); }
  cap(a, b, slot, html) { this.s.caps.push({ a, b, slot, html }); }
  sound(t, name) { this.s.sounds.push({ t, name }); }
}

// The shared shape: hook (3 s), a 5-second timer, an optional wrong-but-tempting try, the solution, the end card.
const HOOK = 3, TIMER = 5, END = 4.6;
function frame(tl, { eyebrow, hook, hookSub, hookBelow, timerTitle, timerSub }) {
  tl.s.eyebrow = eyebrow;
  tl.cap(0, HOOK, 'title', hook);
  tl.cap(0.25, HOOK, 'sub', hookSub);
  if (hookBelow) tl.cap(0.4, HOOK, 'below', hookBelow);
  tl.cap(HOOK, HOOK + TIMER, 'title', timerTitle || 'Find it.');
  tl.cap(HOOK, HOOK + TIMER, 'sub', timerSub || 'Pause if you need to. We’ll wait.');
  tl.s.timer = { a: HOOK, b: HOOK + TIMER };
  for (let k = 0; k < TIMER; k++) tl.sound(HOOK + k, 'tick');
  tl.sound(HOOK + TIMER, 'select');
  return HOOK + TIMER;
}
function finish(tl, t, meta) {
  tl.s.end = { t, head: 'Three new challenges<br><em>every day.</em>', sub: 'Chess · Sudoku · Word games · and more', url: 'boardgamesite.com/daily' };
  tl.sound(t + 0.2, 'king');
  tl.s.dur = +(t + END).toFixed(2);
  tl.s.meta = meta;
  return tl.s;
}

// =====================================================================================================
// Four in a Row: the site's daily puzzle (one winning move; the computer has a threat too).
// =====================================================================================================
function fourInARow(date) {
  const pz = C4.dailyPuzzle(date);
  const b0 = pz.board, ans = pz.answer;
  const tl = new Timeline('c4', b0);
  let t = frame(tl, {
    eyebrow: 'Daily challenge · Four in a Row',
    hook: 'One move <em>wins.</em>',
    hookSub: 'You’re gold and it’s your turn. The computer has a threat too.',
    hookBelow: 'Line up four discs in any direction',
  });
  const drop = (pos, col, who) => {
    const row = C4.lowestRow(pos, col);
    return { row, after: C4.place(pos, col, who) };
  };
  // the tempting block
  const threats = [0, 1, 2, 3, 4, 5, 6].filter((c) => c !== ans && C4.lowestRow(b0, c) >= 0 && C4.findLine(C4.place(b0, c, C4.CPU), C4.CPU));
  if (threats.length) {
    const col = threats[0];
    const line = C4.findLine(C4.place(b0, col, C4.CPU), C4.CPU);
    const gap = C4.lowestRow(b0, col) * 7 + col;
    tl.cap(t, t + 2.6, 'title', 'The obvious move: <em>block.</em>');
    tl.mark(t + 0.1, t + 1.6, line.filter((i) => i !== gap), 'ivory', true);
    tl.mark(t + 0.3, t + 1.6, [gap], 'ghost', true);
    const a = drop(b0, col, C4.YOU);
    tl.anim(t + 1.3, t + 1.72, { type: 'drop', col, row: a.row, who: 1 }, a.after, [0, 'drop']);
    const b = drop(a.after, ans, C4.CPU);
    const cpuWins = !!C4.findLine(b.after, C4.CPU);
    tl.anim(t + 2.7, t + 3.12, { type: 'drop', col: ans, row: b.row, who: 2 }, b.after, [[0, 'drop'], [0.2, 'lose']]);
    const myLine = C4.findLine(C4.place(b0, ans, C4.YOU), C4.YOU);
    tl.cap(t + 2.6, t + 5.3, 'title', cpuWins ? '…and the computer <em>wins.</em>' : '…so the computer<br>blocks <em>you.</em>');
    tl.cap(t + 3.6, t + 5.3, 'sub', 'Polite. But wrong.');
    tl.mark(t + 3.15, t + 5.4, myLine, 'red');
    t += 5.5;
    tl.s.dips.push(t - 0.15);
    tl.key(t, b0);
  }
  const after = C4.place(b0, ans, C4.YOU);
  const line = C4.findLine(after, C4.YOU);
  const rows = line.map((i) => Math.floor(i / 7)), cols = line.map((i) => i % 7);
  const kind = new Set(rows).size === 1 ? 'row' : new Set(cols).size === 1 ? 'column' : 'diagonal';
  const target = C4.lowestRow(b0, ans) * 7 + ans;
  const three = line.filter((i) => i !== target);
  tl.cap(t, t + 2.9, 'title', 'Look at the <em>' + kind + '.</em>');
  tl.cap(t + 1.0, t + 2.9, 'sub', 'Three gold discs and one gap.');
  tl.mark(t + 0.6, t + 3.0, three, 'gold', true);
  tl.mark(t + 0.9, t + 2.5, [target], 'ghost', true);
  tl.anim(t + 2.5, t + 2.92, { type: 'drop', col: ans, row: C4.lowestRow(b0, ans), who: 1 }, after, [[0, 'drop'], [0.08, 'win']]);
  tl.mark(t + 2.95, t + 6.3, line, 'white');
  tl.cap(t + 2.9, t + 6, 'title', 'Four in a row.<br><em>Game over.</em>');
  tl.cap(t + 3.4, t + 6, 'sub', threats.length ? 'Blocking can wait when you can win.' : 'Win first. Everything else can wait.');
  return finish(tl, t + 6.1, {
    game: 'four-in-a-row', name: 'Four in a Row',
    title: 'One move wins. Can you find it? (Four in a Row)',
    hook: 'One move wins, but the computer has a threat too.',
    learn: '/learn/four-in-a-row', tags: ['four in a row', 'puzzle', 'brain teaser', 'board games', 'strategy'],
  });
}

// =====================================================================================================
// Chess: the day's puzzle from the chess learning path.
// =====================================================================================================
const CHESS_HOOKS = {
  'Checkmate in one move.': ['Mate in <em>one.</em>', 'White to play. One move ends the game.'],
  'Checkmate, without stalemating.': ['Mate in one.<br><em>Don’t stalemate.</em>', 'White to play. A careless move is only a draw.'],
  'Checkmate in one move, without stalemating.': ['Mate in one.<br><em>Don’t stalemate.</em>', 'White to play. A careless move is only a draw.'],
  'Fork the king and rook.': ['Win the rook with <em>one knight.</em>', 'White to play.'],
  'Find the knight fork.': ['Win the queen with <em>one knight.</em>', 'White to play.'],
  'Skewer the king and queen.': ['Win the queen in <em>two moves.</em>', 'White to play. The king and queen are lined up.'],
  'Give check on the 6th row.': ['Two rooks.<br>Mate in <em>three.</em>', 'White to play. The black king is on its own.'],
  'Take the free piece.': ['One piece is <em>free.</em>', 'White to play. Which one can you take safely?'],
  'Attack the pinned knight with a pawn.': ['Win a piece with <em>a pawn.</em>', 'White to play. The black knight can’t move.'],
};
function uciOf(m) { return CH.sqName(m.from) + CH.sqName(m.to) + (m.promo ? m.promo.toLowerCase() : ''); }
function chessMove(s, name) { return CH.legal(s).find((m) => uciOf(m) === name || uciOf(m) === name + 'q'); }
function chess(date) {
  const pick = todaysPick(puzzlePool(course('chess')), dateOf(date));
  const st = pick.step;
  let s = CH.fromFen(st.position);
  const tl = new Timeline('chess', s.board);
  tl.s.extra.pieces = Object.fromEntries('KQRBNPkqrbnp'.split('').map((p) => [p, pieceSvg(p)]));
  const [hook, sub] = CHESS_HOOKS[st.prompt] || [st.prompt.replace(/\.$/, '') + '.', 'White to play.'];
  let t = frame(tl, { eyebrow: 'Daily challenge · Chess', hook, hookSub: sub, hookBelow: 'Find the move · ' + nice(date) });
  const play = (m, at, dur = 0.5) => {
    const next = CH.make(s, m);
    const mate = CH.status(next).reason === 'checkmate';
    const sound = mate ? [[0, 'capture'], [0.1, 'win']] : m.captured ? [0, 'capture'] : [0, 'move'];
    const extra = m.castle ? { rook: m.castle === 'k' ? [m.to + 1, m.to - 1] : [m.to - 2, m.to + 1] } : {};
    tl.anim(at, at + dur, { type: 'slide', from: m.from, to: m.to, piece: m.piece, ...extra }, next.board, sound);
    s = next;
    return { next, mate, check: CH.inCheck(next) };
  };
  const kingSq = (state) => state.board.indexOf(state.turn === 'w' ? 'K' : 'k');

  // the plan: either the line from the lesson, an accepted move, or a move that meets the goal
  let plan;
  if (st.line) plan = st.line;
  else if (st.accept) plan = [st.accept[0]];
  else {
    const moves = CH.legal(s);
    const good = moves.filter((m) => {
      const n = CH.make(s, m);
      if (st.goal === 'mate') return CH.status(n).reason === 'checkmate';
      if (st.goal === 'capture') return !!m.captured;
      if (st.goal === 'check') return CH.inCheck(n);
      return true;
    });
    plan = [uciOf(good[0])];
  }

  // a tempting wrong try, for mate puzzles: a stalemate, or a check the king walks out of
  if (st.goal === 'mate' && !st.line) {
    const s0 = s;
    const moves = CH.legal(s0);
    const stale = moves.find((m) => CH.status(CH.make(s0, m)).reason === 'stalemate');
    const checks = moves.filter((m) => { const n = CH.make(s0, m); return CH.inCheck(n) && CH.status(n).reason !== 'checkmate'; })
      .sort((a, b) => 'QRBNPK'.indexOf(a.piece.toUpperCase()) - 'QRBNPK'.indexOf(b.piece.toUpperCase()));
    const wrong = /stalemat/i.test(st.prompt) && stale ? { m: stale, kind: 'stale' } : checks.length ? { m: checks[0], kind: 'check' } : stale ? { m: stale, kind: 'stale' } : null;
    if (wrong) {
      tl.cap(t, t + 1.6, 'title', wrong.kind === 'stale' ? 'Tempting…' : 'Check looks <em>good…</em>');
      const r = play(wrong.m, t + 0.6);
      if (wrong.kind === 'stale') {
        tl.sound(t + 1.3, 'lose');
        tl.cap(t + 1.6, t + 4.3, 'title', 'Stalemate.<br><em>Only a draw.</em>');
        tl.cap(t + 2.1, t + 4.3, 'sub', 'Black can’t move, but isn’t in check.');
        tl.mark(t + 1.3, t + 4.3, [kingSq(r.next)], 'ivory', true);
        t += 4.4;
      } else {
        tl.mark(t + 1.1, t + 2.0, [kingSq(r.next)], 'check');
        const reply = CH.legal(r.next).find((m) => m.piece.toLowerCase() === 'k') || CH.legal(r.next)[0];
        const how = reply.piece.toLowerCase() === 'k' ? '…but the king <em>escapes.</em>' : reply.to === wrong.m.to ? '…but Black just <em>takes it.</em>' : '…but Black <em>blocks it.</em>';
        tl.cap(t + 1.6, t + 4.4, 'title', how);
        play(reply, t + 2.0);
        tl.sound(t + 2.6, 'lose');
        tl.cap(t + 2.6, t + 4.4, 'sub', 'Check isn’t checkmate.');
        t += 4.5;
      }
      tl.s.dips.push(t - 0.15);
      s = s0;
      tl.key(t, s0.board);
    }
  }

  // the solution
  const reveal = st.goal === 'mate' && !st.line ? 'Here’s the <em>mate.</em>' : 'Here’s <em>how.</em>';
  tl.cap(t, t + 1.4, 'title', reveal);
  t += 1.0;
  for (let k = 0; k < plan.length; k++) {
    const m = chessMove(s, plan[k]);
    if (!m) throw new Error('chess: move ' + plan[k] + ' not legal in ' + CH.toFen(s));
    const mine = k % 2 === 0;
    tl.mark(t, t + 0.9, [m.from], mine ? 'gold' : 'none');
    const r = play(m, t + 0.35, 0.55);
    if (r.check && !r.mate) tl.mark(t + 0.9, t + 2.0, [kingSq(r.next)], 'check');
    if (k === 0 && plan.length > 1) { tl.cap(t + 0.9, t + 2.5, 'title', captionFor(st.good, 'Good. Now the reply…')); }
    if (k === 2 && plan.length > 3) { tl.cap(t + 0.9, t + 2.5, 'title', captionFor(st.next, 'Again.')); }
    if (k === plan.length - 1) {
      if (r.mate) tl.mark(t + 0.9, t + 4.6, [kingSq(r.next)], 'check');
      tl.mark(t + 0.9, t + 4.6, [m.to], 'white');
      tl.cap(t + 0.9, t + 4.4, 'title', r.mate ? '<em>Checkmate.</em>' : 'Done.');
      tl.cap(t + 1.3, t + 4.4, 'sub', plain(st.done));
      if (!r.mate) tl.sound(t + 0.95, 'win');
      t += 4.5;
    } else t += mine ? 1.6 : 1.3;
  }
  return finish(tl, t, {
    game: 'chess', name: 'Chess',
    title: plainTitle(hook) + ' Can you find it? (Chess puzzle)',
    hook: plainTitle(hook) + ' ' + sub,
    learn: '/learn/chess/' + pick.lesson.slug, lesson: pick.lesson.title,
    tags: ['chess', 'chess puzzle', 'checkmate', 'chess tactics', 'board games'],
  });
}
const plain = (html) => String(html || '').replace(/<[^>]+>/g, '').trim();
const plainTitle = (html) => plain(html.replace(/<br>/g, ' '));
const captionFor = (text, fallback) => { const p = plain(text) || fallback; return p.length > 46 ? p.split(/(?<=[.,…])\s/)[0] : p; };

// =====================================================================================================
// Checkers: the day's puzzle from the checkers learning path. Gold moves up the board.
// =====================================================================================================
const CHECKERS_HOOKS = {
  'Make the move the rules require.': ['Only one move is <em>legal.</em>', 'Gold to play. Most beginners miss this rule.'],
  'Jump the piece behind your king.': ['Your king can do what <em>pieces can’t.</em>', 'Gold to play. Capture the black piece.'],
  'Win the game.': ['Win in <em>one move.</em>', 'Gold to play.'],
  'Win by leaving Black with no move.': ['Win without taking <em>a piece.</em>', 'Gold to play. Leave Black with no move.'],
  'Win the game in one move.': ['Win in <em>one move.</em>', 'Gold to play.'],
  'Set up the shot: offer a piece.': ['Give one.<br><em>Take two.</em>', 'Gold to play. Black must jump if it can.'],
  'Make a move that can’t be jumped next turn.': ['Find the only <em>safe move.</em>', 'Gold to play. Don’t give a piece away.'],
  'Move the runner forward safely.': ['Get your runner home <em>safely.</em>', 'Gold to play.'],
  'Make a move that leaves Black stuck.': ['Win without taking <em>a piece.</em>', 'Gold to play. Leave Black with no move.'],
};
const FILES = 'abcdefgh';
const ckName = (i) => FILES[i % 8] + (8 - Math.floor(i / 8));
const ckFrom = (rows) => { const out = new Array(64).fill(0); rows.split('/').forEach((row, r) => [...row].forEach((ch, c) => { out[r * 8 + c] = { g: 1, G: 2, b: -1, B: -2 }[ch] || 0; })); return out; };
function checkers(date) {
  const pick = todaysPick(puzzlePool(course('checkers')), dateOf(date));
  const st = pick.step;
  let b = ckFrom(st.position);
  const tl = new Timeline('checkers', b);
  const [hook, sub] = CHECKERS_HOOKS[st.prompt] || [st.prompt, 'Gold to play.'];
  let t = frame(tl, { eyebrow: 'Daily challenge · Checkers', hook, hookSub: sub, hookBelow: 'Pieces move diagonally · jumps capture' });
  const nameOf = (m) => m.path.map(ckName).join('-');
  let side = 1;
  let plan;
  if (st.line) plan = st.line;
  else if (st.accept) plan = [st.accept[0]];
  else {
    const moves = CK.legalMoves(b, 1);
    const good = moves.filter((m) => {
      if (st.goal === 'capture') return m.caps.length > 0;
      if (st.goal === 'win') { const n = CK.applyMove(b, m); return !CK.legalMoves(n, -1).length; }
      return true;
    }).sort((x, y) => y.caps.length - x.caps.length);
    plan = [nameOf(good[0])];
  }
  tl.cap(t, t + 1.4, 'title', 'Here’s <em>how.</em>');
  t += 1.0;
  for (let k = 0; k < plan.length; k++) {
    const m = CK.legalMoves(b, side).find((x) => nameOf(x) === plan[k]);
    if (!m) throw new Error('checkers: move ' + plan[k] + ' not legal');
    const after = CK.applyMove(b, m);
    const dur = 0.4 * (m.path.length - 1) + 0.1;
    tl.mark(t, t + 0.7, [m.path[0]], side === 1 ? 'gold' : 'none');
    const crown = Math.abs(after[m.path.at(-1)]) === 2 && Math.abs(b[m.path[0]]) === 1;
    const snd = m.caps.length ? m.caps.map((_, i) => [0.4 * (i + 1) - dur, 'capture']) : [[0.4 - dur, 'move']];
    if (crown) snd.push([0.05, 'king']);
    tl.anim(t + 0.3, t + 0.3 + dur, { type: 'hop', path: m.path, piece: b[m.path[0]], caps: m.caps }, after, snd);
    b = after;
    t += 0.3 + dur;
    if (k === 0 && plan.length > 1) tl.cap(t, t + 1.6, 'title', captionFor(st.good, 'Black has to jump…'));
    if (k === 1 && plan.length > 2) tl.cap(t, t + 1.6, 'title', captionFor(st.next, 'Now take two.'));
    if (k === plan.length - 1) {
      const blackStuck = !CK.legalMoves(b, -1).length;
      tl.mark(t, t + 4.4, [m.path.at(-1)], 'white');
      tl.cap(t, t + 4.2, 'title', blackStuck ? 'Black can’t move.<br><em>You win.</em>' : m.caps.length > 1 ? 'Gave one.<br><em>Took two.</em>' : 'That’s <em>the move.</em>');
      tl.cap(t + 0.4, t + 4.2, 'sub', plain(st.done));
      tl.sound(t + 0.05, 'win');
      t += 4.4;
    } else t += 1.1;
    side = -side;
  }
  return finish(tl, t, {
    game: 'checkers', name: 'Checkers',
    title: plainTitle(hook) + ' Can you find it? (Checkers puzzle)',
    hook: plainTitle(hook) + ' ' + sub,
    learn: '/learn/checkers/' + pick.lesson.slug, lesson: pick.lesson.title,
    tags: ['checkers', 'draughts', 'checkers puzzle', 'board games', 'strategy'],
  });
}

// =====================================================================================================
// Mancala: the day's puzzle from the mancala learning path. You play the bottom row; your store is on the right.
// =====================================================================================================
function mancala(date) {
  const pick = todaysPick(puzzlePool(course('mancala')), dateOf(date));
  const st = pick.step;
  let b = st.position.slice();
  const tl = new Timeline('mancala', b);
  const goal = st.goal || (/chain/i.test(st.prompt) ? 'chain' : 'accept');
  const hooks = {
    again: ['Find the <em>free turn.</em>', 'Your last seed must land in your store.'],
    capture: ['Capture in <em>one move.</em>', 'End in your own empty pit to take what’s opposite.'],
    chain: ['Take three turns <em>in a row.</em>', 'Each move that ends in your store earns another.'],
    accept: ['Save your <em>seeds.</em>', 'The computer is about to capture. Stop it.'],
  };
  const [hook, sub] = hooks[goal];
  let t = frame(tl, { eyebrow: 'Daily challenge · Mancala', hook, hookSub: 'You play the bottom row. Seeds go one per pit to the right, then into your store.', hookBelow: null, timerTitle: hook, timerSub: sub });
  const sowAnim = (pit, at) => {
    const n = b[pit];
    const seq = [];
    let j = pit;
    for (let k = 0; k < n; k++) { j = (j + 1) % 14; if (j === 13) j = 0; seq.push(j); }
    const r = MC.sow(b, 0, pit);
    const per = 0.16;
    const dur = per * n + 0.15;
    const sounds = seq.map((_, k) => [-(dur) + per * (k + 1), 'flip']);
    const cap = r.captured ? { pit: r.last, opp: 12 - r.last, amount: r.captured } : null;
    tl.anim(at, at + dur, { type: 'sow', from: pit, seq, per }, cap ? sowOnly(b, pit, seq) : r.b, sounds);
    let end = at + dur;
    if (cap) { tl.anim(end + 0.4, end + 1.0, { type: 'capture', ...cap }, r.b, [[0, 'capture']]); end += 1.0; }
    b = r.b;
    return { ...r, end };
  };
  const pitOk = (p) => b[p] > 0;
  let plan = [];
  if (goal === 'again') plan = [[0, 1, 2, 3, 4, 5].find((p) => pitOk(p) && MC.sow(b, 0, p).again)];
  else if (goal === 'capture') plan = [[0, 1, 2, 3, 4, 5].find((p) => pitOk(p) && MC.sow(b, 0, p).captured)];
  else if (goal === 'chain') {
    let x = b.slice();
    let p = Number(st.accept[0]) - 1;
    while (p !== undefined && p >= 0) {
      plan.push(p);
      const r = MC.sow(x, 0, p);
      x = r.b;
      if (!r.again) break;
      p = [5, 4, 3, 2, 1, 0].find((q) => x[q] > 0 && MC.sow(x, 0, q).again);
      if (p === undefined) { const any = [5, 4, 3, 2, 1, 0].find((q) => x[q] > 0); if (any !== undefined) plan.push(any); break; }
    }
  } else plan = [Number(st.accept[0]) - 1];

  if (goal === 'accept') {
    // show the threat first: the computer move that would capture
    const threats = [7, 8, 9, 10, 11, 12].filter((i) => b[i] > 0).map((i) => ({ i, r: MC.sow(b, 1, i) })).filter((x) => x.r.captured > 0)
      .sort((x, y) => y.r.captured - x.r.captured);
    if (threats.length) {
      const th = threats[0], mine = 12 - th.r.last;
      tl.cap(t, t + 2.6, 'title', 'The threat:');
      tl.cap(t + 0.3, t + 2.6, 'sub', 'The computer’s last seed would land opposite your ' + b[mine] + ' seeds, and take them.');
      tl.mark(t + 0.2, t + 2.6, [th.i], 'ivory', true);
      tl.mark(t + 0.6, t + 2.6, [mine], 'red', true);
      t += 2.8;
    }
  }
  tl.cap(t, t + 1.5, 'title', 'Count the <em>seeds.</em>');
  t += 0.6;
  for (let k = 0; k < plan.length; k++) {
    const p = plan[k];
    tl.mark(t, t + 1.0, [p], 'gold', true);
    tl.cap(t + 0.2, t + 1.2, 'below', 'Pit ' + (p + 1) + ' has ' + b[p] + (b[p] === 1 ? ' seed' : ' seeds'));
    const r = sowAnim(p, t + 0.8);
    t = r.end;
    if (r.again) { tl.mark(t, t + 1.2, [6], 'white'); tl.cap(t, t + 1.4, 'title', k ? 'And <em>again!</em>' : 'Free <em>turn!</em>'); tl.sound(t + 0.05, 'found'); }
    if (r.captured) { tl.mark(t, t + 3.8, [6], 'white'); tl.cap(t, t + 3.8, 'title', 'Captured <em>' + r.captured + ' seeds.</em>'); }
    t += k === plan.length - 1 ? 0.3 : 1.2;
  }
  tl.cap(t - 0.2, t + 3.8, 'sub', plain(st.done));
  if (goal !== 'capture') tl.cap(t - 0.2, t + 3.8, 'title', goal === 'chain' ? (plan.length - 1) + ' free turns <em>in a row.</em>' : goal === 'again' ? 'Free <em>turn.</em>' : 'Seeds <em>safe.</em>');
  tl.sound(t, 'win');
  t += 3.9;
  return finish(tl, t, {
    game: 'mancala', name: 'Mancala',
    title: plainTitle(hook) + ' Can you find it? (Mancala puzzle)',
    hook: plainTitle(hook) + ' ' + sub,
    learn: '/learn/mancala/' + pick.lesson.slug, lesson: pick.lesson.title,
    tags: ['mancala', 'kalah', 'mancala strategy', 'board games', 'puzzle'],
  });
}
// The board after sowing but before a capture is taken.
function sowOnly(b, pit, seq) { const x = b.slice(); x[pit] = 0; for (const j of seq) x[j]++; return x; }

// =====================================================================================================
// Sudoku: the site's daily grid. Find a square only one number fits, show why, then fill the rest.
// =====================================================================================================
const ROWS = (i) => Math.floor(i / 9), COLS = (i) => i % 9, BOXES = (i) => Math.floor(ROWS(i) / 3) * 3 + Math.floor(COLS(i) / 3);
function sudoku(date) {
  const { puzzle, solution } = SDK.generate(rng(seedFrom('sudoku-' + date)), 'medium');
  const peersOf = (i) => [...Array(81).keys()].filter((j) => j !== i && (ROWS(j) === ROWS(i) || COLS(j) === COLS(i) || BOXES(j) === BOXES(i)));
  const cands = (g, i) => { const used = new Set(peersOf(i).map((j) => g[j])); return [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((v) => !used.has(v)); };
  // a square that's already down to one number, explained by its row, column and box together
  let best = null;
  for (let i = 0; i < 81; i++) {
    if (puzzle[i]) continue;
    const c = cands(puzzle, i);
    if (c.length !== 1) continue;
    const parts = ['row', 'col', 'box'].map((k) => peersOf(i).filter((j) => (k === 'row' ? ROWS(j) === ROWS(i) : k === 'col' ? COLS(j) === COLS(i) : BOXES(j) === BOXES(i)) && puzzle[j]).length);
    const score = Math.min(...parts) * 10 + parts.reduce((a, x) => a + x, 0) - Math.abs(ROWS(i) - 4) - Math.abs(COLS(i) - 4);
    if (!best || score > best.score) best = { i, v: c[0], score };
  }
  if (!best) return sudokuHidden(date, puzzle, solution, peersOf, cands);
  const tl = new Timeline('sudoku', puzzle);
  let t = frame(tl, {
    eyebrow: 'Daily challenge · Sudoku',
    hook: 'Only one number <em>fits.</em>',
    hookSub: 'Each row, column and 3×3 box holds 1 to 9 once.',
    timerTitle: 'What goes in the <em>gold square?</em>',
    timerSub: 'Pause if you need to. We’ll wait.',
  });
  tl.mark(0, t + 7.6, [best.i], 'target');
  const i = best.i;
  const has = (cells) => [...new Set(cells.map((j) => puzzle[j]).filter(Boolean))].sort((a, b) => a - b);
  const rowCells = [...Array(9).keys()].map((c) => ROWS(i) * 9 + c);
  const colCells = [...Array(9).keys()].map((r) => r * 9 + COLS(i));
  const boxCells = [...Array(81).keys()].filter((j) => BOXES(j) === BOXES(i));
  const seen = new Set();
  const steps = [['Its row has', rowCells], ['Its column adds', colCells], ['Its box adds', boxCells]];
  for (const [label, cells] of steps) {
    const nums = has(cells).filter((v) => !seen.has(v));
    nums.forEach((v) => seen.add(v));
    tl.mark(t, t + 1.8, cells.filter((j) => j !== i), 'zone');
    tl.cap(t, t + 1.8, 'title', label + '<br><em>' + (nums.length ? nums.join(' ') : 'nothing new') + '</em>');
    tl.sound(t, 'select');
    t += 1.8;
  }
  tl.cap(t, t + 2.4, 'title', 'Only <em>' + best.v + '</em> is left.');
  tl.cap(t + 0.3, t + 2.4, 'sub', '1 to 9, minus everything it can see.');
  const g1 = puzzle.slice(); g1[i] = best.v;
  tl.anim(t + 0.5, t + 0.8, { type: 'fill', cell: i, v: best.v }, g1, [0, 'place']);
  t += 2.4;
  return sudokuRest(tl, t, g1, solution, cands);
}
// No square starts with a single option: find a box where one number has only one place to go.
function sudokuHidden(date, puzzle, solution, peersOf, cands) {
  let best = null;
  for (let bx = 0; bx < 9; bx++) {
    const cells = [...Array(81).keys()].filter((j) => BOXES(j) === bx);
    for (let v = 1; v <= 9; v++) {
      if (cells.some((j) => puzzle[j] === v)) continue;
      const spots = cells.filter((j) => !puzzle[j] && cands(puzzle, j).includes(v));
      if (spots.length !== 1) continue;
      const blockers = [...Array(81).keys()].filter((j) => puzzle[j] === v && BOXES(j) !== bx && cells.some((c) => !puzzle[c] && c !== spots[0] && (ROWS(c) === ROWS(j) || COLS(c) === COLS(j))));
      const empties = cells.filter((j) => !puzzle[j]).length;
      const score = empties * 3 - blockers.length * 2 - Math.abs(Math.floor(bx / 3) - 1) - Math.abs((bx % 3) - 1);
      if (!best || score > best.score) best = { bx, v, i: spots[0], cells, blockers, score };
    }
  }
  if (!best) throw new Error('sudoku: nothing simple to show');
  const tl = new Timeline('sudoku', puzzle);
  let t = frame(tl, {
    eyebrow: 'Daily challenge · Sudoku',
    hook: 'Where does the <em>' + best.v + '</em> go?',
    hookSub: 'Each row, column and 3×3 box holds 1 to 9 once.',
    timerTitle: 'One square in the gold box<br>can take a <em>' + best.v + '.</em>',
    timerSub: 'Pause if you need to. We’ll wait.',
  });
  tl.mark(0, t + 6.2, best.cells, 'zone');
  tl.cap(t, t + 2.4, 'title', 'Find the other <em>' + best.v + 's.</em>');
  tl.mark(t + 0.3, t + 6.2, best.blockers, 'target');
  tl.sound(t + 0.3, 'select');
  t += 2.4;
  const ruled = best.cells.filter((j) => !puzzle[j] && j !== best.i);
  tl.cap(t, t + 2.0, 'title', 'They rule out <em>every other square.</em>');
  tl.mark(t + 0.2, t + 3.8, ruled, 'red');
  t += 2.0;
  tl.cap(t, t + 2.4, 'title', 'So the <em>' + best.v + '</em> goes here.');
  const g1 = puzzle.slice(); g1[best.i] = best.v;
  tl.anim(t + 0.4, t + 0.7, { type: 'fill', cell: best.i, v: best.v }, g1, [0, 'place']);
  tl.mark(t + 0.7, t + 2.4, [best.i], 'white');
  t += 2.4;
  const s = sudokuRest(tl, t, g1, solution, cands);
  s.meta.title = 'Where does the ' + best.v + ' go? (Sudoku)';
  s.meta.hook = 'Only one square in the box can take a ' + best.v + '.';
  return s;
}
// After the first number: the rest of the grid, in an order a solver would find them.
function sudokuRest(tl, t, g1, solution, cands) {
  let g = g1.slice();
  const order = [];
  while (order.length < 81) {
    const next = [...Array(81).keys()].find((j) => !g[j] && cands(g, j).length === 1);
    const j = next ?? [...Array(81).keys()].find((k) => !g[k]);
    if (j === undefined) break;
    g[j] = solution[j];
    order.push(j);
  }
  const restAt = t;
  let gg = g1.slice();
  const step = Math.min(0.06, 2.4 / order.length);
  order.forEach((j, k) => {
    gg = gg.slice(); gg[j] = solution[j];
    tl.anim(t + 0.3 + k * step, t + 0.3 + k * step + 0.18, { type: 'fill', cell: j, v: solution[j] }, gg, k % 3 === 0 ? [0, 'flip'] : null);
  });
  t += 0.3 + order.length * step + 0.3;
  tl.sound(t, 'win');
  tl.cap(restAt, t + 2.6, 'title', 'Then the rest<br><em>falls into place.</em>');
  tl.cap(t - 0.5, t + 2.6, 'sub', 'Solved.');
  t += 2.6;
  return finish(tl, t, {
    game: 'sudoku', name: 'Sudoku',
    title: 'Only one number fits. Can you find it? (Sudoku)',
    hook: 'Only one number fits in the gold square.',
    learn: '/learn/sudoku', tags: ['sudoku', 'sudoku tips', 'puzzle', 'logic puzzle', 'brain teaser'],
  });
}

// =====================================================================================================
// Word Guess: the site's daily word, played out by a sensible solver, with a pause before the last guess.
// =====================================================================================================
function wordGuess(date) {
  const answer = dailyWord(date);
  const freq = {};
  for (const w of ANSWER_LIST) for (const ch of new Set(w)) freq[ch] = (freq[ch] || 0) + 1;
  const value = (w) => [...new Set(w)].reduce((a, ch) => a + freq[ch], 0);
  let left = ANSWER_LIST.slice();
  const rows = [];
  let guess = 'crane';
  for (let k = 0; k < 6; k++) {
    const sc = wgScore(guess, answer);
    rows.push({ word: guess, score: sc });
    if (guess === answer) break;
    left = left.filter((w) => wgScore(guess, w).join() === sc.join() && w !== guess);
    guess = left.slice().sort((a, b) => value(b) - value(a))[0];
  }
  const tl = new Timeline('wordguess', { rows: [] });
  tl.s.eyebrow = 'Daily challenge · Word Guess';
  tl.cap(0, HOOK + 0.4, 'title', 'Five letters.<br><em>Six tries.</em>');
  tl.cap(0.25, HOOK + 0.4, 'sub', 'Gold: right spot. Wine: in the word, wrong spot.');
  let t = 0.6;
  let state = { rows: [] };
  const playRow = (row, at) => {
    const typed = { rows: state.rows.concat([{ word: row.word, score: null }]) };
    tl.anim(at, at + 0.5, { type: 'type', row: state.rows.length, word: row.word }, typed, null);
    const after = { rows: state.rows.concat([row]) };
    tl.anim(at + 0.6, at + 1.6, { type: 'flip', row: state.rows.length, word: row.word, score: row.score }, after, [0, 'flip']);
    for (let c = 0; c < 5; c++) tl.sound(at + 0.6 + c * 0.2, 'flip');
    state = after;
    return at + 1.75;
  };
  const shown = rows.slice(0, -1);
  if (shown.length > 1) tl.cap(HOOK + 0.4, 0.6 + shown.length * 1.75, 'title', 'Each guess <em>narrows it down.</em>');
  for (const r of shown) t = playRow(r, t);
  // pause before the answer
  const remaining = left.length;
  t = Math.max(t, HOOK + 0.4);
  tl.cap(t, t + TIMER, 'title', remaining === 1 ? 'Only one word <em>fits.</em>' : 'What’s the <em>word?</em>');
  tl.cap(t, t + TIMER, 'sub', 'Pause if you need to. We’ll wait.');
  tl.s.timer = { a: t, b: t + TIMER };
  for (let k = 0; k < TIMER; k++) tl.sound(t + k, 'tick');
  t += TIMER;
  tl.sound(t, 'select');
  t = playRow(rows.at(-1), t);
  tl.sound(t - 0.1, 'win');
  tl.cap(t - 0.2, t + 3.6, 'title', 'It’s <em>' + answer.toUpperCase() + '.</em>');
  tl.cap(t + 0.2, t + 3.6, 'sub', 'Solved in ' + rows.length + '. How many would you need?');
  t += 3.7;
  return finish(tl, t, {
    game: 'word-guess', name: 'Word Guess',
    title: 'Five letters, six tries. Can you get it? (Word Guess)',
    hook: 'Guess the five-letter word in six tries.',
    learn: '/play/word-guess', tags: ['word game', 'word puzzle', 'five letter words', 'guess the word', 'brain teaser'],
  });
}

// =====================================================================================================
// Letter Hive: the site's daily hive. Find words with the centre letter, then the word that uses all seven.
// =====================================================================================================
function letterHive(date) {
  const P = hiveMake(rng(seedFrom('hive-' + date)));
  const outer = WL.shuffled([...P.letters].filter((ch) => ch !== P.centre), rng(seedFrom('hive-outer-' + date)));
  const pangrams = P.list.filter((w) => new Set(w).size === 7);
  const easy = P.list.filter((w) => !pangrams.includes(w)).sort((a, b) => WL.rank(a) - WL.rank(b)).slice(0, 4).sort((a, b) => a.length - b.length);
  const tl = new Timeline('hive', { found: [] });
  tl.s.extra = { centre: P.centre, outer };
  let t = frame(tl, {
    eyebrow: 'Daily challenge · Letter Hive',
    hook: 'Seven letters.<br><em>How many words?</em>',
    hookSub: 'Words of 4+ letters. Every word uses the gold centre letter.',
    timerTitle: 'Find the word that uses <em>all seven.</em>',
  });
  let found = [];
  tl.cap(t, t + 0.4 + easy.length * 1.1, 'title', 'Start <em>small.</em>');
  t += 0.4;
  for (const w of easy) {
    found = found.concat([w]);
    tl.anim(t, t + 0.7, { type: 'word', word: w }, { found }, [0, 'found']);
    t += 1.1;
  }
  const pg = pangrams.sort((a, b) => WL.rank(a) - WL.rank(b))[0];
  tl.cap(t, t + 4.4, 'title', 'The one with all seven:');
  found = found.concat([pg]);
  tl.anim(t + 0.6, t + 1.6, { type: 'word', word: pg, big: true }, { found, pangram: pg }, [[0, 'found'], [0.05, 'win']]);
  tl.cap(t + 1.6, t + 4.4, 'sub', 'There were ' + P.list.length + ' words in all. How many did you get?');
  t += 4.5;
  return finish(tl, t, {
    game: 'letter-hive', name: 'Letter Hive',
    title: 'Seven letters. Find the word that uses them all. (Letter Hive)',
    hook: 'Seven letters, one centre letter: how many words can you make?',
    learn: '/play/letter-hive', tags: ['word game', 'word puzzle', 'vocabulary', 'anagram', 'brain teaser'],
  });
}

const MAKERS = { 'four-in-a-row': fourInARow, chess, checkers, mancala, sudoku, 'word-guess': wordGuess, 'letter-hive': letterHive };
export const GAMES = Object.keys(MAKERS);

// One script for a game's challenge on `puzzleDate`.
export function scriptFor(game, puzzleDate) {
  const s = MAKERS[game](puzzleDate);
  s.meta.puzzleDate = puzzleDate;
  s.meta.dateText = nice(puzzleDate);
  return s;
}
// The three Shorts posted on `postDate`: the previous day's three challenges, in the site's order.
export function shortsFor(postDate) {
  const puzzleDate = dayBefore(postDate);
  return Daily.todaysGames(dateOf(puzzleDate)).map((g) => scriptFor(g.game, puzzleDate));
}
