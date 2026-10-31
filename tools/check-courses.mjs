// Checks every course in src/courses/ against the real game engines:
// positions are valid, every move a lesson expects is legal, goals can be met, tap targets are right.
// Run: node tools/check-courses.mjs   (build.py runs it too, and stops the build on errors)
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as C from '../public/assets/js/chess-engine.js';
import * as K from '../public/assets/js/checkers-engine.js';
import * as M from '../public/assets/js/mancala-rules.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'src/courses');
const verbose = process.argv.includes('-v');
let errors = 0;
const err = (where, msg) => { errors++; console.error('✗ ' + where + ': ' + msg); };
const info = (where, msg) => { if (verbose) console.log('  ' + where + ': ' + msg); };

const FILES = 'abcdefgh';
const nameOf = (i) => FILES[i % 8] + (8 - Math.floor(i / 8));
const SQ = /^[a-h][1-8]$/;

// ---- per-game adapters: the same move names and facts as learn-boards.js ----
const chess = {
  load(p, where) {
    let s;
    try { s = C.fromFen(p); } catch (e) { err(where, 'bad FEN ' + p); return null; }
    if (s.board.length !== 64) { err(where, 'FEN does not have 64 squares: ' + p); return null; }
    if (s.board.filter((x) => x === 'K').length !== 1 || s.board.filter((x) => x === 'k').length !== 1) { err(where, 'needs exactly one king each: ' + p); return null; }
    if (C.inCheck(s, s.turn === 'w' ? 'b' : 'w')) { err(where, 'the side not to move is in check (impossible position): ' + p); return null; }
    if (s.board.some((x, i) => (x === 'P' || x === 'p') && (i < 8 || i >= 56))) { err(where, 'pawn on the first or last row: ' + p); return null; }
    return s;
  },
  uci: (m) => nameOf(m.from) + nameOf(m.to) + (m.promo ? m.promo.toLowerCase() : ''),
  list(s) { return C.legal(s).map((m) => ({ name: this.uci(m), m })); },
  find(s, name) { return this.list(s).find((x) => x.name === name || x.name === name + 'q'); },
  apply(s, x) {
    const next = C.make(s, x.m);
    const st = C.status(next);
    return { s: next, f: { check: C.inCheck(next), mate: st.over && st.reason === 'checkmate', stalemate: st.over && st.reason === 'stalemate', capture: !!x.m.captured, castle: !!x.m.castle, promote: !!x.m.promo } };
  },
  dests(s, from) { return C.legal(s).filter((m) => nameOf(m.from) === from).map((m) => nameOf(m.to)); },
  isSquare: (n) => SQ.test(n)
};

const checkers = {
  load(p, where) {
    const rows = String(p).split('/');
    if (rows.length !== 8 || rows.some((r) => r.length !== 8 || /[^.gGbB]/.test(r))) { err(where, 'checkers position needs 8 rows of 8 from . g G b B: ' + p); return null; }
    const b = new Array(64).fill(0);
    rows.forEach((row, r) => [...row].forEach((ch, c) => { b[r * 8 + c] = { g: 1, G: 2, b: -1, B: -2 }[ch] || 0; }));
    for (let i = 0; i < 64; i++) if (b[i] && !K.isDark(i)) { err(where, 'piece on a light square ' + nameOf(i)); return null; }
    if (b.slice(0, 8).includes(1) || b.slice(56).includes(-1)) { err(where, 'an uncrowned piece on its crowning row'); return null; }
    return { b, side: 1 };
  },
  list(s) { return K.legalMoves(s.b, s.side).map((m) => ({ name: m.path.map(nameOf).join('-'), m })); },
  find(s, name) { return this.list(s).find((x) => x.name === name); },
  apply(s, x) {
    const before = s.b[x.m.path[0]];
    const b = K.applyMove(s.b, x.m);
    const after = b[x.m.path[x.m.path.length - 1]];
    const next = { b, side: -s.side };
    const stuck = K.legalMoves(b, next.side).length === 0;
    return { s: next, f: { capture: x.m.caps.length > 0, captured: x.m.caps.length, king: Math.abs(before) === 1 && Math.abs(after) === 2, win: stuck } };
  },
  dests(s, from) { return this.list(s).filter((x) => x.name.startsWith(from + '-')).map((x) => x.name.split('-').pop()); },
  isSquare: (n) => SQ.test(n)
};

const pitName = (i) => (i <= 5 ? String(i + 1) : 't' + (13 - i));
const mancala = {
  load(p, where) {
    if (!Array.isArray(p) || p.length !== 14 || p.some((x) => !Number.isInteger(x) || x < 0)) { err(where, 'mancala position needs 14 whole numbers'); return null; }
    return { b: p.slice(), turn: 0 };
  },
  list(s) { return M.moves(s.b, s.turn).map((i) => ({ name: pitName(i), i })); },
  find(s, name) { return this.list(s).find((x) => x.name === name); },
  apply(s, x) {
    const r = M.sow(s.b, s.turn, x.i);
    return { s: { b: r.b, turn: r.again ? s.turn : 1 - s.turn }, f: { again: r.again, capture: r.captured > 0, captured: r.captured, store: r.b[6] } };
  },
  dests: () => [],
  isSquare: (n) => /^(t?[1-6]|store|tstore)$/.test(n)
};
const ADAPTERS = { chess, checkers, mancala };

function checkCourse(file) {
  const course = JSON.parse(readFileSync(join(dir, file), 'utf8'));
  const A = ADAPTERS[course.board];
  const tag = course.game;
  if (!A) return err(tag, 'unknown board ' + course.board);
  for (const key of ['game', 'name', 'board', 'intro', 'units']) if (!course[key]) err(tag, 'missing ' + key);
  const slugs = new Set();
  let lessons = 0, steps = 0;
  for (const unit of course.units) {
    if (!unit.id || !unit.name || !unit.lessons || !unit.stage) err(tag, 'unit needs id, name, stage and lessons');
    if (!['rules', 'check', 'strategy'].includes(unit.stage)) err(tag + '/' + unit.id, 'stage must be rules, check or strategy');
    for (const lesson of unit.lessons) {
      lessons++;
      const L = tag + '/' + lesson.slug;
      if (!/^[a-z0-9-]+$/.test(lesson.slug || '')) err(L, 'slug must be lower-case words and hyphens');
      if (slugs.has(lesson.slug)) err(L, 'duplicate slug');
      slugs.add(lesson.slug);
      for (const key of ['title', 'summary', 'wrap', 'steps']) if (!lesson[key]) err(L, 'missing ' + key);
      if (lesson.summary && (lesson.summary.length < 70 || lesson.summary.length > 170)) err(L, 'summary should be 70–170 characters for search results (is ' + lesson.summary.length + ')');
      if (lesson.steps && lesson.steps[0] && lesson.steps[0].position === undefined) err(L, 'the first step needs a position');
      let state = null;
      (lesson.steps || []).forEach((s, k) => {
        steps++;
        const W = L + ' step ' + (k + 1);
        if (!['info', 'tap', 'move', 'choice'].includes(s.type)) return err(W, 'unknown type ' + s.type);
        if (!s.text) err(W, 'missing text');
        if (s.type !== 'info' && !s.prompt) err(W, 'missing prompt');
        if (s.position !== undefined) state = A.load(s.position, W);
        if (!state) return;
        for (const sq of Object.keys(s.marks || {})) {
          if (!A.isSquare(sq)) err(W, 'bad mark square ' + sq);
          if (!['good', 'bad', 'hint', 'target'].includes(s.marks[sq])) err(W, 'bad mark kind ' + s.marks[sq]);
        }
        const play = (name, why) => {
          const x = A.find(state, name);
          if (!x) { err(W, why + ' move ' + name + ' is not legal. Legal: ' + A.list(state).map((y) => y.name).join(' ')); return null; }
          const r = A.apply(state, x);
          state = r.s;
          return r.f;
        };
        if (s.demo) { for (const mv of s.demo) if (!play(mv, 'demo')) return; }

        if (s.type === 'tap') {
          if (!Array.isArray(s.targets) || !s.targets.length) return err(W, 'tap needs targets');
          for (const t of s.targets) if (!A.isSquare(t)) err(W, 'bad target ' + t);
          if (s.pick && s.targets.length !== 1) err(W, 'a pick step has exactly one target');
          if (s.from) {
            const want = A.dests(state, s.from).sort().join(' ');
            const got = s.targets.slice().sort().join(' ');
            if (want !== got) err(W, 'targets from ' + s.from + ' should be: ' + want + ' (lesson has: ' + got + ')');
          }
        }
        if (s.type === 'choice') {
          if (!Array.isArray(s.options) || s.options.length < 2) err(W, 'choice needs 2+ options');
          else if (!(s.answer >= 0 && s.answer < s.options.length)) err(W, 'answer index out of range');
        }
        if (s.type === 'move') {
          if (!s.accept && !s.goal && !s.line) return err(W, 'move needs accept, goal or line');
          if (s.goal && !['check', 'mate', 'capture', 'castle', 'promote', 'king', 'again', 'any', 'win'].includes(s.goal)) err(W, 'unknown goal ' + s.goal);
          const before = state;
          if (s.line) {
            if (s.line.length % 2 !== 1) err(W, 'a line ends on the person’s move (odd length)');
            let f = null;
            for (let n = 0; n < s.line.length; n++) {
              const legalNow = A.list(state);
              if (n % 2 === 0 && s.goal === 'mate' && n === s.line.length - 1) {
                const mates = legalNow.filter((x) => A.apply(state, x).f.mate).map((x) => x.name);
                if (mates.length > 1) info(W, 'last move has several mates: ' + mates.join(' '));
              }
              f = play(s.line[n], n % 2 ? 'reply' : 'line');
              if (!f) return;
            }
            if (s.goal && s.goal !== 'any' && !f[s.goal]) err(W, 'line does not end in ' + s.goal);
            return;
          }
          const all = A.list(before);
          const ok = all.filter((x) => {
            const f = A.apply(before, x).f;
            return (s.accept && s.accept.some((a) => x.name === a || x.name === a + 'q')) || (s.goal && (s.goal === 'any' || f[s.goal]));
          });
          if (s.accept) for (const a of s.accept) if (!A.find(before, a)) err(W, 'accepted move ' + a + ' is not legal. Legal: ' + all.map((y) => y.name).join(' '));
          if (!ok.length) err(W, 'no legal move meets the goal ' + (s.goal || ''));
          else info(W, 'accepted: ' + ok.map((x) => x.name).join(' ') + ' of ' + all.length);
          // the board keeps the first accepted move for any following step without a position
          state = A.apply(before, ok[0] || all[0]).s;
          if (lesson.steps[k + 1] && lesson.steps[k + 1].position === undefined && ok.length > 1 && lesson.steps[k + 1].type !== 'choice' && lesson.steps[k + 1].type !== 'info')
            err(W, 'the next step has no position but this step accepts several moves');
        }
      });
    }
  }
  if (course.ladder) for (const b of course.ladder) if (!b.id || !b.name || !b.rating || !b.level) err(tag, 'ladder bot needs id, name, rating, level');
  console.log((errors ? '…' : '✓') + ' ' + course.game + ': ' + lessons + ' lessons, ' + steps + ' steps');
}

for (const f of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) checkCourse(f);
if (errors) { console.error(errors + ' problem(s) in the courses.'); process.exit(1); }
