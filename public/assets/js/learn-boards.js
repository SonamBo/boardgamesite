// Boards for lessons and puzzles: Chess, Checkers, Russian Checkers, Hex, Mancala, Go, Reversi and Four in a Row, driven by the real rules engines.
//
// makeBoard(kind, el) returns:
//   set(position)       show a position (chess: FEN; checkers: 8 rows like '.b.b.b.b/...'; mancala: 14 numbers)
//   play(move)          make a move by its name (opponent replies, demonstrations); returns the move's facts or null
//   onMove(fn)          the person made a legal move: fn(name, facts). Return false from fn to undo it.
//   onTap(fn)           tap mode: fn(squareName) for any square (used by "tap every square…" steps)
//   interactive(on)     whether the person may move
//   mark(map)           highlight squares/pits: { e4: 'good' | 'bad' | 'hint' | 'target' }
//   moves()             the legal moves for the side to move, by name
// Move names: chess 'e2e4' ('e7e8q' to promote); checkers 'c3-d4' or 'c3-e5-c7' for jumps; mancala '1'–'6' for
// the bottom pits left to right ('t1'–'t6' for the top player's pits, from their left).
// Facts: { check, mate, capture, castle, promote, king, again, captured (count) }
import * as C from './chess-engine.js';
import { pieceSvg, PIECE_NAME } from './chess-pieces.js';
import * as CK from './checkers-engine.js';
import * as RK from './russian-checkers-engine.js';
import * as M from './mancala-rules.js';
import { RULES } from './lesson-rules.js';
import * as BGE from './backgammon-engine.js';
import { makeDie, paintDie } from './dice-ui.js';   // Go, Reversi, Four in a Row (positions and move names documented there)
import { play as sound } from './sound.js';

const FILES = 'abcdefgh';
const nameOf = (i) => FILES[i % 8] + (8 - Math.floor(i / 8));
const indexOf = (n) => (8 - Number(n[1])) * 8 + FILES.indexOf(n[0]);
const CROWN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18h18l-1.6-10.5-4.6 4.2L12 4.5 9.2 11.7 4.6 7.5z"/></svg>';

function base(el) {
  return { el, moveFn: null, tapFn: null, live: false, marks: {} };
}

// ---------- Chess ----------
function chessBoard(el) {
  const b = base(el);
  let S, sel = null, legalNow = [], last = null, promoFor = null;
  el.className = 'cs-board lp-board';
  el.setAttribute('role', 'group');
  const cells = [];
  for (let i = 0; i < 64; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cs ' + ((Math.floor(i / 8) + i) % 2 ? 'dk' : 'lt');
    btn.addEventListener('click', () => tap(i));
    btn.dataset.rank = String(8 - Math.floor(i / 8));
    btn.dataset.file = FILES[i % 8];
    if (i % 8 === 0) btn.classList.add('edge-rank');
    if (i >= 56) btn.classList.add('edge-file');
    el.appendChild(btn);
    cells.push(btn);
  }
  const facts = (m, next) => {
    const st = C.status(next);
    return { check: C.inCheck(next), mate: st.over && st.reason === 'checkmate', stalemate: st.over && st.reason === 'stalemate', capture: !!m.captured, castle: !!m.castle, promote: !!m.promo };
  };
  const uci = (m) => nameOf(m.from) + nameOf(m.to) + (m.promo ? m.promo.toLowerCase() : '');
  function render() {
    const dests = sel != null ? legalNow.filter((m) => m.from === sel).map((m) => m.to) : [];
    const check = C.inCheck(S) ? S.board.indexOf(S.turn === 'w' ? 'K' : 'k') : -1;
    for (let i = 0; i < 64; i++) {
      const p = S.board[i], c = cells[i];
      c.innerHTML = (p ? pieceSvg(p) : '') + (dests.includes(i) ? '<i class="' + (p ? 'cap' : 'dot') + '"></i>' : '');
      c.classList.toggle('sel', i === sel);
      c.classList.toggle('last', !!last && (i === last.from || i === last.to));
      c.classList.toggle('chk', i === check);
      const mk = b.marks[nameOf(i)];
      c.dataset.mark = mk || '';
      c.setAttribute('aria-label', nameOf(i) + (p ? ', ' + (p === p.toUpperCase() ? 'white ' : 'black ') + PIECE_NAME[p.toLowerCase()] : '') + (dests.includes(i) ? ', move here' : ''));
    }
  }
  function doMove(m, fromPerson) {
    const next = C.make(S, m);
    const f = facts(m, next);
    const prev = { S, last };
    S = next; last = m; sel = null; legalNow = C.legal(S);
    sound(m.captured ? 'capture' : m.castle ? 'king' : 'move');
    render();
    if (fromPerson && b.moveFn && b.moveFn(uci(m), f) === false) {
      // the lesson rejected it: put the board back
      setTimeout(() => { S = prev.S; last = prev.last; legalNow = C.legal(S); render(); }, 650);
    }
    return f;
  }
  function tap(i) {
    if (b.tapFn) return b.tapFn(nameOf(i));
    if (!b.live) return;
    const p = S.board[i];
    if (sel != null) {
      const ms = legalNow.filter((m) => m.from === sel && m.to === i);
      if (ms.length) return doMove(ms.find((m) => !m.promo || m.promo.toLowerCase() === 'q') || ms[0], true);
    }
    if (p && (p === p.toUpperCase()) === (S.turn === 'w') && legalNow.some((m) => m.from === i)) { sel = i; sound('select'); }
    else sel = null;
    render();
  }
  return Object.assign(b, {
    set(fen) { S = C.fromFen(fen); sel = null; last = null; legalNow = C.legal(S); render(); },
    play(name) {
      const m = legalNow.find((x) => uci(x) === name || (uci(x) === name + 'q'));
      return m ? doMove(m, false) : null;
    },
    moves: () => legalNow.map(uci),
    mark(map) { b.marks = map || {}; render(); },
    interactive(on) { b.live = on; if (!on) sel = null; render(); },
    side: () => S.turn
  });
}

// ---------- Checkers ----------
// Position rows, top (row 8) first: '.' empty, 'g' gold man, 'G' gold king, 'b' black man, 'B' black king.
// Gold moves up the board and always moves first in a lesson.
export function checkersFrom(rows) {
  const out = new Array(64).fill(0);
  rows.split('/').forEach((row, r) => [...row].forEach((ch, c) => { out[r * 8 + c] = { g: 1, G: 2, b: -1, B: -2 }[ch] || 0; }));
  return out;
}
// K: the rules engine (checkers-engine.js, or russian-checkers-engine.js for Russian Checkers)
function checkersBoard(el, K = CK) {
  const b = base(el);
  let B, side = 1, partial = [], last = null;
  el.className = 'grid8 ck lp-board';
  el.setAttribute('role', 'group');
  const cells = [];
  for (let i = 0; i < 64; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = K.isDark(i) ? 'dark' : 'light';
    btn.addEventListener('click', () => tap(i));
    el.appendChild(btn);
    cells.push(btn);
  }
  const name = (m) => m.path.map(nameOf).join('-');
  const legal = () => K.legalMoves(B, side);
  function render() {
    const moves = b.live ? legal() : [];
    const matching = moves.filter((m) => partial.every((p, k) => m.path[k] === p));
    const pickable = new Set(partial.length <= 1 ? moves.map((m) => m.path[0]) : []);
    const targets = new Set(partial.length ? matching.map((m) => m.path[partial.length]).filter((x) => x !== undefined) : []);
    for (let i = 0; i < 64; i++) {
      const c = cells[i], p = B[i];
      let h = '';
      if (p) h = '<span class="piece ' + (p > 0 ? 'you' : 'cpu') + '">' + (Math.abs(p) === 2 ? CROWN : '') + '</span>';
      else if (targets.has(i)) h = '<span class="hint-dot"></span>';
      c.innerHTML = h;
      c.classList.toggle('sel', partial.includes(i));
      c.classList.toggle('last', !!last && last.includes(i));
      c.classList.toggle('can', b.tapFn ? K.isDark(i) : pickable.has(i) || targets.has(i));
      c.dataset.mark = b.marks[nameOf(i)] || '';
      c.setAttribute('aria-label', nameOf(i) + (p ? ', ' + (p > 0 ? 'gold ' : 'black ') + (Math.abs(p) === 2 ? 'king' : 'piece') : ''));
    }
  }
  function doMove(m, fromPerson) {
    const before = B[m.path[0]];
    const prev = { B, side, last };
    B = K.applyMove(B, m);
    const after = B[m.path[m.path.length - 1]];
    const f = { capture: m.caps.length > 0, captured: m.caps.length, king: Math.abs(before) === 1 && Math.abs(after) === 2 };
    last = m.path; partial = [];
    side = -side;
    f.win = K.legalMoves(B, side).length === 0;
    sound(m.caps.length ? 'capture' : 'move');
    if (f.king) sound('king', 0.2);
    render();
    if (fromPerson && b.moveFn && b.moveFn(name(m), f) === false) {
      setTimeout(() => { B = prev.B; side = prev.side; last = prev.last; render(); }, 650);
    }
    return f;
  }
  function tap(i) {
    if (b.tapFn) return b.tapFn(nameOf(i));
    if (!b.live) return;
    const moves = legal();
    const firsts = new Set(moves.map((m) => m.path[0]));
    if (partial.length <= 1 && firsts.has(i)) { partial = partial[0] === i ? [] : [i]; if (partial.length) sound('select'); render(); return; }
    if (!partial.length) return;
    const matching = moves.filter((m) => partial.every((p, k) => m.path[k] === p));
    if (!matching.some((m) => m.path[partial.length] === i)) return;
    partial = partial.concat(i);
    const done = matching.find((m) => m.path.length === partial.length && m.path[partial.length - 1] === i);
    if (done) doMove(done, true); else render();
  }
  return Object.assign(b, {
    set(rows) { B = Array.isArray(rows) ? rows.slice() : checkersFrom(rows); side = 1; partial = []; last = null; render(); },
    play(n) {
      const m = legal().find((x) => name(x) === n);
      return m ? doMove(m, false) : null;
    },
    moves: () => legal().map(name),
    mark(map) { b.marks = map || {}; render(); },
    interactive(on) { b.live = on; partial = []; render(); },
    side: () => side
  });
}

// ---------- Mancala ----------
function mancalaBoard(el) {
  const b = base(el);
  let P, turn = 0, last = -1;
  el.className = 'mc-board lp-board';
  el.setAttribute('role', 'group');
  const order = [13, 12, 11, 10, 9, 8, 7, 0, 1, 2, 3, 4, 5, 6];
  const els = [];
  order.forEach((i) => {
    const node = document.createElement(i === 6 || i === 13 ? 'div' : 'button');
    node.className = 'mc-pit' + (i === 6 || i === 13 ? ' store' : '');
    node.dataset.i = String(i);
    if (node.tagName === 'BUTTON') { node.type = 'button'; node.addEventListener('click', () => tap(i)); }
    node.innerHTML = '<span class="seeds"></span><b>0</b>';
    els[i] = node;
  });
  const top = document.createElement('div'); top.className = 'mc-row top';
  const bot = document.createElement('div'); bot.className = 'mc-row bot';
  [12, 11, 10, 9, 8, 7].forEach((i) => top.appendChild(els[i]));
  [0, 1, 2, 3, 4, 5].forEach((i) => bot.appendChild(els[i]));
  el.append(els[13], top, bot, els[6]);
  const pitName = (i) => (i <= 5 ? String(i + 1) : 't' + (13 - i));
  const pitIndex = (n) => (n[0] === 't' ? 13 - Number(n.slice(1)) : Number(n) - 1);
  function seeds(n) {
    let h = '';
    const shown = Math.min(n, 18);
    for (let k = 0; k < shown; k++) {
      const a = k * 2.399, r = 15 * Math.sqrt((k + 0.5) / Math.max(shown, 6));
      h += '<i style="left:' + (50 + Math.cos(a) * r * 2.4).toFixed(1) + '%;top:' + (50 + Math.sin(a) * r * 2.4).toFixed(1) + '%;--h:' + ((k * 47) % 360) + '"></i>';
    }
    return h;
  }
  function render() {
    for (let i = 0; i < 14; i++) {
      const node = els[i];
      node.querySelector('.seeds').innerHTML = seeds(P[i]);
      node.querySelector('b').textContent = String(P[i]);
      const can = b.tapFn ? !(i === 6 || i === 13) : b.live && M.own(turn, i) && P[i] > 0;
      node.classList.toggle('can', can);
      node.classList.toggle('last', i === last);
      node.dataset.mark = b.marks[i === 6 ? 'store' : i === 13 ? 'tstore' : pitName(i)] || '';
      if (node.tagName === 'BUTTON') node.disabled = !can;
      node.setAttribute('aria-label', (i === 6 ? 'Your store' : i === 13 ? 'Opponent’s store' : (i <= 5 ? 'Your pit ' : 'Opponent pit ') + pitName(i).replace('t', '')) + ': ' + P[i]);
    }
  }
  function doMove(i, fromPerson) {
    const prev = { P, turn, last };
    const r = M.sow(P, turn, i);
    P = r.b; last = r.last;
    const f = { again: r.again, capture: r.captured > 0, captured: r.captured, store: P[6] };
    if (!r.again) turn = 1 - turn;
    sound(r.captured ? 'capture' : 'place');
    render();
    if (fromPerson && b.moveFn && b.moveFn(pitName(i), f) === false) {
      setTimeout(() => { P = prev.P; turn = prev.turn; last = prev.last; render(); }, 650);
    }
    return f;
  }
  function tap(i) {
    if (b.tapFn) return b.tapFn(pitName(i));
    if (!b.live || !M.own(turn, i) || !P[i]) return;
    doMove(i, true);
  }
  return Object.assign(b, {
    set(pits) { P = pits.slice(); turn = 0; last = -1; render(); },
    play(n) { const i = pitIndex(n); return M.own(turn, i) && P[i] ? doMove(i, false) : null; },
    moves: () => M.moves(P, turn).map(pitName),
    mark(map) { b.marks = map || {}; render(); },
    interactive(on) { b.live = on; render(); },
    side: () => turn
  });
}

// ---------- Go, Reversi, Four in a Row ----------
// One board for the three, on the shared lesson rules; each draws itself like its game page.
function ruleBoard(kind, el) {
  const b = base(el);
  const A = RULES[kind];
  let S, last = null, extra = new Set();
  const n = A.cells.length;
  el.className = (kind === 'go' ? 'go-board' : kind === 'reversi' ? 'grid8 rv' : kind === 'gomoku' ? 'gm-board' : 'board c4-lesson') + ' lp-board';
  el.setAttribute('role', 'group');
  const cells = [];
  for (let i = 0; i < n; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    if (kind === 'go') {
      const r = Math.floor(i / 9), c = i % 9;
      btn.className = 'gp' + ([2, 4, 6].includes(r) && [2, 4, 6].includes(c) && (r === 4) === (c === 4) ? ' star' : '');
    } else if (kind === 'gomoku') btn.className = 'gm';
    else btn.innerHTML = '<span></span>';
    btn.addEventListener('click', () => tap(i));
    el.appendChild(btn);
    cells.push(btn);
  }
  const legal = () => (b.live ? A.list(S) : []);
  function render() {
    const can = new Set(legal().map((x) => (kind === 'c4' ? x.c : x.i)));
    for (let i = 0; i < n; i++) {
      const v = S.b[i], c = cells[i], nm = A.name(i);
      if (kind === 'go') {
        c.className = 'gp' + (c.classList.contains('star') ? ' star' : '') + (v === 1 ? ' bk' : v === 2 ? ' wh' : '') + (i === last ? ' last' : '');
        c.disabled = !!v;   // empty points stay tappable; tap() decides what a tap does
        c.setAttribute('aria-label', nm + (v ? (v === 1 ? ', black' : ', white') : ''));
      } else if (kind === 'gomoku') {
        c.className = 'gm' + (v === 1 ? ' p1' : v === 2 ? ' p2' : '') + (i === last ? ' last' : '') + (extra.has(i) ? ' win' : '');
        c.disabled = !!v && !b.tapFn;
        c.setAttribute('aria-label', nm + (v === 1 ? ', gold' : v === 2 ? ', ivory' : ''));
      } else if (kind === 'reversi') {
        c.firstChild.className = v === 1 ? 'disc you' : v === -1 ? 'disc cpu' : can.has(i) ? 'move-dot' : '';
        c.classList.toggle('last', i === last);
        c.classList.toggle('flip', extra.has(i));
        c.classList.toggle('can', !!b.tapFn || can.has(i));
        c.setAttribute('aria-label', nm + (v === 1 ? ', gold' : v === -1 ? ', black' : can.has(i) ? ', you can play here' : ''));
      } else {
        c.firstChild.className = 'disc' + (v === 1 ? ' p1' : v === 2 ? ' p2' : '') + (extra.has(i) ? ' win' : '') + (i === last ? ' drop' : '');
        c.disabled = !S.b[i % 7] ? false : !b.tapFn;   // full columns can't take a disc
        c.setAttribute('aria-label', 'Column ' + (i % 7 + 1) + ', ' + nm + (v === 1 ? ', gold' : v === 2 ? ', ivory' : ''));
      }
      c.dataset.mark = b.marks[nm] || (kind === 'c4' && i >= 35 ? b.marks[String(i % 7 + 1)] || '' : '');
    }
  }
  function doMove(x, fromPerson) {
    const prev = { S, last, extra };
    const r = A.apply(S, x);
    S = r.s;
    last = kind === 'c4' ? r.cell : x.i;
    extra = new Set(kind === 'reversi' ? r.flips : kind === 'c4' || kind === 'gomoku' ? r.line || [] : []);
    sound(kind === 'go' || kind === 'gomoku' ? (r.f.capture ? 'capture' : 'place') : kind === 'reversi' ? 'flip' : 'drop');
    render();
    if (fromPerson && b.moveFn && b.moveFn(x.name, r.f) === false) {
      setTimeout(() => { S = prev.S; last = prev.last; extra = prev.extra; render(); }, 650);
    }
    return r.f;
  }
  function tap(i) {
    if (b.tapFn) return b.tapFn(A.name(i));
    if (!b.live) return;
    const x = legal().find((m) => (kind === 'c4' ? m.c === i % 7 : m.i === i));
    if (x) doMove(x, true);
  }
  return Object.assign(b, {
    set(p) { S = A.load(p); last = null; extra = new Set(); render(); },
    play(name) { const x = A.find(S, name); return x ? doMove(x, false) : null; },
    moves: () => A.list(S).map((x) => x.name),
    mark(map) { b.marks = map || {}; render(); },
    interactive(on) { b.live = on; render(); },
    side: () => S.side
  });
}

// ---------- Sudoku ----------
// Tap an empty cell, then a number. A clashing number counts as a wrong answer and is taken back.
function sudokuBoard(el) {
  const b = base(el);
  const A = RULES.sudoku;
  let S, givens = [], sel = null, last = null, flash = null;
  el.className = 'sdk-lesson lp-board';
  el.innerHTML = '';
  const grid = document.createElement('div'); grid.className = 'sdk';
  const pad = document.createElement('div'); pad.className = 'sdk-pad';
  el.append(grid, pad);
  const boxes = Array.from({ length: 9 }, () => { const d = document.createElement('div'); d.className = 'sdk-box'; grid.appendChild(d); return d; });
  const cells = [];
  for (let i = 0; i < 81; i++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'sdk-cell';
    btn.dataset.i = String(i);
    btn.addEventListener('click', () => tap(i));
    boxes[Math.floor(i / 27) * 3 + Math.floor((i % 9) / 3)].appendChild(btn);
    cells.push(btn);
  }
  for (let v = 1; v <= 9; v++) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pad-num';
    btn.innerHTML = '<b>' + v + '</b>';
    btn.setAttribute('aria-label', 'Enter ' + v);
    btn.addEventListener('click', () => enter(v));
    pad.appendChild(btn);
  }
  function notesFor(i) {
    if (!S.notes || S.g[i]) return '';
    const n = S.notes === 'auto' ? A.candidates(S.g, i).join('') : S.notes[A.name(i)] || '';
    if (!n) return '';
    return '<span class="notes">' + [1, 2, 3, 4, 5, 6, 7, 8, 9].map((v) => '<i>' + (n.includes(String(v)) ? v : '') + '</i>').join('') + '</span>';
  }
  function render() {
    const selVal = sel != null ? S.g[sel] : 0;
    for (let i = 0; i < 81; i++) {
      const c = cells[i], v = S.g[i], nm = A.name(i);
      c.innerHTML = v ? String(v) : notesFor(i);
      c.classList.toggle('given', !!v && givens[i]);
      c.classList.toggle('mine', !!v && !givens[i]);
      c.classList.toggle('sel', i === sel);
      c.classList.toggle('peer', sel != null && i !== sel && (Math.floor(i / 9) === Math.floor(sel / 9) || i % 9 === sel % 9));
      c.classList.toggle('last', i === last);
      c.classList.toggle('bad', i === flash);
      c.dataset.mark = b.marks[nm] || '';
      c.setAttribute('aria-label', 'Row ' + (Math.floor(i / 9) + 1) + ', column ' + (i % 9 + 1) + (v ? ', ' + v : ', empty'));
    }
    pad.classList.toggle('off', !(b.live && sel != null));
  }
  function doMove(x, fromPerson) {
    const prev = { S, last };
    const r = A.apply(S, x);
    S = r.s; last = x.i; sel = null;
    sound('place');
    render();
    if (fromPerson && b.moveFn && b.moveFn(x.name, r.f) === false) {
      setTimeout(() => { S = prev.S; last = prev.last; render(); }, 650);
    }
    return r.f;
  }
  function tap(i) {
    if (b.tapFn) return b.tapFn(A.name(i));
    if (!b.live || S.g[i]) return;
    sel = sel === i ? null : i;
    if (sel != null) sound('select');
    render();
  }
  function enter(v) {
    if (!b.live || sel == null) return;
    const name = A.name(sel) + '=' + v;
    const x = A.find(S, name);
    if (x) return doMove(x, true);
    // a clash: show it, count it as a wrong answer, then clear it
    const i = sel;
    S = { ...S, g: S.g.map((w, k) => (k === i ? v : w)) };
    flash = i; sel = null;
    render();
    if (b.moveFn) b.moveFn(name, { clash: true });
    setTimeout(() => { S = { ...S, g: S.g.map((w, k) => (k === i ? 0 : w)) }; flash = null; render(); }, 650);
  }
  return Object.assign(b, {
    set(p) { S = A.load(p); givens = S.g.map(Boolean); sel = null; last = null; flash = null; render(); },
    play(name) { const x = A.find(S, name); return x ? doMove(x, false) : null; },
    moves: () => A.list(S).map((x) => x.name),
    mark(map) { b.marks = map || {}; render(); },
    interactive(on) { b.live = on; if (!on) sel = null; render(); },
    side: () => 0
  });
}

// ---------- Backgammon ----------
// Drawn like the game page. Tap a checker, then where it goes, once per die; when the roll is used up the
// whole play is reported, e.g. '8/5 6/5'. Points, the bar and the tray can be tapped in tap steps too.
function backgammonBoard(el) {
  const b = base(el);
  const A = RULES.backgammon;
  let T, cur, made = [], sel = null, lastTo = [];
  el.className = 'bg-lesson lp-board';
  el.innerHTML = '<svg class="bg-board" viewBox="0 0 300 220" role="group" aria-label="Backgammon board"></svg><div class="bg-ldice"></div>';
  const svg = el.querySelector('svg');
  const dieEls = [makeDie(el.querySelector('.bg-ldice')), makeDie(el.querySelector('.bg-ldice'))];
  const colX = (col) => 10 + col * 20 + (col >= 6 ? 20 : 0);
  const spot = (i) => (i < 12 ? { col: 11 - i, top: false } : { col: i - 12, top: true });
  const zone = (i) => { const { col, top } = spot(i); return { x: colX(col) + 1, y: top ? 9 : 127, w: 18, h: 84 }; };
  const ZONES = { bar: { x: 131, y: 10, w: 18, h: 200 }, off: { x: 274, y: 112, w: 20, h: 100 } };
  let stat = '<rect x="0" y="0" width="300" height="220" rx="8" class="frame"/><rect x="8" y="8" width="122" height="204" class="felt"/><rect x="150" y="8" width="122" height="204" class="felt"/>' +
    '<rect x="130" y="8" width="20" height="204" class="bar"/><rect x="274" y="8" width="20" height="204" rx="3" class="tray"/>';
  for (let i = 0; i < 24; i++) {
    const { col, top } = spot(i), x = colX(col);
    stat += '<polygon points="' + (top ? x + ',8 ' + (x + 20) + ',8 ' + (x + 10) + ',92' : x + ',212 ' + (x + 20) + ',212 ' + (x + 10) + ',128') + '" class="pt ' + (i % 2 ? 'p1' : 'p2') + '"/>' +
      '<text x="' + (x + 10) + '" y="' + (top ? 5.8 : 218.6) + '" class="lbl">' + (i + 1) + '</text>';
  }
  svg.innerHTML = stat + '<g class="bgl-marks"></g><g class="bgl-ck"></g><g class="bgl-hl"></g><g class="bgl-hit"></g>';
  // invisible tap targets: 24 points, the bar and the tray
  let hits = '';
  for (let i = 0; i < 24; i++) { const z = zone(i); hits += '<rect data-at="' + i + '" x="' + (z.x - 1) + '" y="' + (z.y - 1) + '" width="20" height="86" fill="transparent"><title>Point ' + (i + 1) + '</title></rect>'; }
  hits += '<rect data-at="bar" x="130" y="8" width="20" height="204" fill="transparent"><title>Bar</title></rect><rect data-at="off" x="274" y="8" width="20" height="204" fill="transparent"><title>Borne off</title></rect>';
  svg.querySelector('.bgl-hit').innerHTML = hits;
  svg.addEventListener('click', (e) => { const r = e.target.closest('[data-at]'); if (r) tap(r.dataset.at === 'bar' || r.dataset.at === 'off' ? r.dataset.at : Number(r.dataset.at)); });
  const ptName = (at) => (typeof at === 'number' ? String(at + 1) : at);
  const box = (z, cls) => '<rect x="' + z.x + '" y="' + z.y + '" width="' + z.w + '" height="' + z.h + '" class="' + cls + '"/>';
  // next single moves allowed, given what has been played so far this turn
  function nextMoves() {
    if (!T.dice || !b.live) return [];
    const all = BGE.plays(T.s, 0, T.dice, false);
    const out = [], seen = new Set();
    all.forEach((p) => {
      if (!made.every((m, j) => p.seq[j] && String(p.seq[j].from) === String(m.from) && String(p.seq[j].to) === String(m.to))) return;
      const m = p.seq[made.length];
      if (m && !seen.has(m.from + '>' + m.to)) { seen.add(m.from + '>' + m.to); out.push(m); }
    });
    return out;
  }
  function render() {
    const disc = (x, y, side, cls = '', label = '') => '<g class="ck s' + side + ' ' + cls + '"><circle cx="' + x + '" cy="' + y + '" r="8.6"/><circle cx="' + x + '" cy="' + y + '" r="5.4" class="ring"/>' + (label ? '<text x="' + x + '" y="' + (y + 2.6) + '" class="cnt">' + label + '</text>' : '') + '</g>';
    let h = '';
    for (let i = 0; i < 24; i++) {
      const n = Math.abs(cur.pts[i]);
      if (!n) continue;
      const side = cur.pts[i] > 0 ? 0 : 1, x = colX(spot(i).col) + 10, top = spot(i).top, shown = Math.min(n, 5);
      for (let k = 0; k < shown; k++) h += disc(x, top ? 17 + k * 17 : 203 - k * 17, side, (sel === i && k === shown - 1 ? 'sel' : '') + (lastTo.includes(i) && k === shown - 1 ? ' moved' : ''), k === shown - 1 && n > 5 ? String(n) : '');
    }
    [0, 1].forEach((side) => { for (let k = 0; k < Math.min(cur.bar[side], 3); k++) h += disc(140, side === 0 ? 70 - k * 17 : 150 + k * 17, side, sel === 'bar' && side === 0 && k === 0 ? 'sel' : '', k === 0 && cur.bar[side] > 3 ? String(cur.bar[side]) : ''); });
    [0, 1].forEach((side) => { for (let k = 0; k < cur.off[side]; k++) { const y = side === 0 ? 209 - k * 6 : 11 + k * 6; h += '<rect x="276" y="' + (side === 0 ? y - 4.6 : y) + '" width="16" height="4.6" rx="1.2" class="offck s' + side + '"/>'; } });
    svg.querySelector('.bgl-ck').innerHTML = h;
    let mk = '';
    for (const [k, v] of Object.entries(b.marks)) { const z = k === 'bar' || k === 'off' ? ZONES[k] : zone(Number(k) - 1); if (z) mk += box(z, 'mk ' + v); }
    svg.querySelector('.bgl-marks').innerHTML = mk;
    let hl = '';
    const nx = nextMoves();
    if (sel == null) new Set(nx.map((m) => m.from)).forEach((f) => { hl += box(f === 'bar' ? { x: 131, y: 10, w: 18, h: 98 } : zone(f), 'can'); });
    else nx.filter((m) => m.from === sel).forEach((m) => { hl += box(m.to === 'off' ? ZONES.off : zone(m.to), 'dest'); });
    svg.querySelector('.bgl-hl').innerHTML = hl;
    const used = made.map((m) => m.d);
    dieEls.forEach((d, k) => {
      el.querySelector('.bg-ldice').hidden = !T.dice;
      const v = T.dice ? T.dice[k] : 0;
      const dim = T.dice ? (T.dice[0] === T.dice[1] ? used.length >= (k === 0 ? 2 : 4) : used.includes(v)) : false;
      paintDie(d, v, { dim });
    });
  }
  function finishPlay(fromPerson) {
    const key = A.key(cur);
    const x = A.list(T).find((p) => A.key(p.end) === key);
    const r = A.apply(T, x);
    const start = T;
    T = { ...r.s, s: cur };
    if (fromPerson && b.moveFn && b.moveFn(x.name, r.f) === false) {
      setTimeout(() => { T = start; cur = start.s; made = []; lastTo = []; sel = null; render(); }, 650);
    }
    render();
    return r.f;
  }
  function step(m, fromPerson) {
    const hit = typeof m.to === 'number' && cur.pts[m.to] === -1;
    cur = BGE.apply(cur, 0, { ...m });
    made.push(m); lastTo.push(m.to); sel = null;
    sound(hit ? 'capture' : 'move');
    if (!nextMoves().length) return finishPlay(fromPerson);
    render();
    return null;
  }
  function tap(at) {
    if (b.tapFn) return b.tapFn(ptName(at));
    if (!b.live) return;
    const nx = nextMoves();
    if (sel != null) {
      const m = nx.find((x) => x.from === sel && x.to === at);
      if (m) return step(m, true);
    }
    sel = nx.some((x) => x.from === at) && sel !== at ? at : null;
    if (sel != null) sound('select');
    render();
  }
  return Object.assign(b, {
    set(p) { T = A.load(p); cur = T.s; made = []; sel = null; lastTo = []; render(); },
    play(name) {
      const x = A.find(T, name);
      if (!x) return null;
      cur = x.end; made = x.seq.slice(); lastTo = x.seq.map((m) => m.to);
      return finishPlay(false);
    },
    moves: () => A.list(T).map((x) => x.name),
    mark(map) { b.marks = map || {}; render(); },
    interactive(on) { b.live = on; if (!on) sel = null; else { cur = T.s; made = []; lastTo = []; } render(); },
    side: () => T.side
  });
}

// ---------- Solitaire ----------
// A card table like the game page. Tap a card (or the deck to draw), then where it should go.
const SUIT_SVG = ['M12 2C9 6 3 9.5 3 14a4.5 4.5 0 0 0 7.6 3.2c-.3 1.9-1 3.3-2.6 4.8h8c-1.6-1.5-2.3-2.9-2.6-4.8A4.5 4.5 0 0 0 21 14c0-4.5-6-8-9-12z',
  'M12 21.5s-7.6-4.8-9.7-9.4C.7 8.5 2.7 4 6.7 4c2.3 0 3.8 1.3 5.3 3.2C13.5 5.3 15 4 17.3 4c4 0 6 4.5 4.4 8.1-2.1 4.6-9.7 9.4-9.7 9.4z',
  'M12 1.5l8.5 10.5L12 22.5 3.5 12z',
  'M12 2.5a4.3 4.3 0 0 0-3.7 6.5A4.3 4.3 0 1 0 10.6 16c-.3 2.3-1.1 4-2.8 5.5h8.4c-1.7-1.5-2.5-3.2-2.8-5.5a4.3 4.3 0 1 0 2.3-7A4.3 4.3 0 0 0 12 2.5z'];
const suitIcon = (su, cls = '') => '<svg viewBox="0 0 24 24"' + (cls ? ' class="' + cls + '"' : '') + ' aria-hidden="true"><path d="' + SUIT_SVG[su] + '"/></svg>';
function solitaireBoard(el) {
  const b = base(el);
  const A = RULES.solitaire;
  let T, sel = null, lastCard = null;
  el.className = 'sol-lesson lp-board';
  el.innerHTML = '<div class="sl-top"></div><div class="sl-tab"></div>';
  // card width comes from the CSS (--cw, sized to the table with container units)
  const R = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const face = (n) => {
    const r = R[n % 13], su = Math.floor(n / 13), code = A.cardCode(n);
    return '<button type="button" class="pc face' + (su === 1 || su === 2 ? ' red' : '') + (sel === code ? ' sel' : '') + (lastCard === code ? ' moved' : '') + '" data-at="' + code + '" data-mark="' + (b.marks[code] || '') + '" aria-label="' + code + '">' +
      '<span class="ix"><span>' + r + '</span>' + suitIcon(su) + '</span>' + suitIcon(su, 'pip') + '</button>';
  };
  const slot = (at, inner, label) => '<button type="button" class="sl-slot" data-at="' + at + '" data-mark="' + (b.marks[at] || '') + '" aria-label="' + label + '">' + (inner || '') + '</button>';
  function render() {
    const k = T.k;
    const top = (arr) => arr[arr.length - 1];
    let h = '<div class="sl-pile">' + (k.stock.length ? '<button type="button" class="pc back" data-at="stock" data-mark="' + (b.marks.stock || '') + '" aria-label="Deck, ' + k.stock.length + ' cards"></button>' : slot('stock', '<svg viewBox="0 0 24 24" class="recycle" aria-hidden="true"><path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7"/></svg>', 'Deck: turn the pile over')) + '</div>';
    h += '<div class="sl-pile">' + (k.waste.length ? face(top(k.waste)) : slot('waste', '', 'Waste pile, empty')) + '</div><div></div>';
    k.found.forEach((f, su) => { h += '<div class="sl-pile sl-found" data-mark="' + (b.marks.f || '') + '">' + (f.length ? face(top(f)) : slot('f', suitIcon(su), 'Foundation')) + '</div>'; });
    el.querySelector('.sl-top').innerHTML = h;
    el.querySelector('.sl-tab').innerHTML = k.tab.map((pile, col) => {
      let y = 0, cards = '';
      pile.forEach((x, idx) => {
        cards += '<div class="sl-card" style="top:calc(var(--cw) * ' + y.toFixed(2) + ')">' + (x.up ? face(x.c) : '<span class="pc back" aria-label="Face-down card"></span>') + '</div>';
        if (idx < pile.length - 1) y += x.up ? 0.38 : 0.16;
      });
      return '<div class="sl-col" style="height:calc(var(--cw) * ' + (y + 1.4).toFixed(2) + ')">' + slot('t' + (col + 1), '', 'Column ' + (col + 1) + (pile.length ? '' : ', empty')) + cards + '</div>';
    }).join('');
  }
  // where a tap on a card or slot would send the selected card
  function destFor(at) {
    if (at === 'f' || /^(A|[2-9]|10|J|Q|K)[SHDC]$/.test(at) && T.k.found.some((f) => f.length && A.cardCode(f[f.length - 1]) === at)) return 'f';
    if (/^t[1-7]$/.test(at)) return at;
    const col = T.k.tab.findIndex((p) => p.some((x) => x.up && A.cardCode(x.c) === at));
    return col >= 0 ? 't' + (col + 1) : null;
  }
  function doMove(x, fromPerson) {
    const prev = { T, lastCard };
    const r = A.apply(T, x);
    T = r.s; sel = null;
    lastCard = x.draw ? null : x.name.split('-')[0];
    sound(x.draw ? 'card' : r.f.found ? 'found' : 'card');
    render();
    if (fromPerson && b.moveFn && b.moveFn(x.name, r.f) === false) {
      setTimeout(() => { T = prev.T; lastCard = prev.lastCard; render(); }, 650);
    }
    return r.f;
  }
  function tap(at) {
    if (b.tapFn) return b.tapFn(at);
    if (!b.live) return;
    const all = A.list(T);
    if (at === 'stock') { const d = all.find((x) => x.draw); if (d) doMove(d, true); return; }
    if (sel) {
      const dest = destFor(at);
      const m = dest && all.find((x) => x.name === sel + '-' + dest);
      if (m) return doMove(m, true);
    }
    sel = all.some((x) => x.name.startsWith(at + '-')) && sel !== at ? at : null;
    if (sel) sound('select');
    render();
  }
  el.addEventListener('click', (e) => { const t = e.target.closest('[data-at]'); if (t) tap(t.dataset.at); });
  return Object.assign(b, {
    set(p) { T = A.load(p); sel = null; lastCard = null; render(); },
    play(name) { const x = A.find(T, name); return x ? doMove(x, false) : null; },
    moves: () => A.list(T).map((x) => x.name),
    mark(map) { b.marks = map || {}; render(); },
    interactive(on) { b.live = on; if (!on) sel = null; render(); },
    side: () => 0
  });
}


// ---------- Hex ----------
// The same rhombus of hexagons as the game page, drawn in SVG. Cells are named column a… row 1… from the top.
function hexBoard(el) {
  const b = base(el);
  const A = RULES.hex;
  let S, last = null, line = new Set();
  const svgNS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('class', 'hx-board');
  svg.setAttribute('role', 'group');
  el.className = 'hxw lp-board hx-lesson';
  el.textContent = '';
  el.appendChild(svg);
  const R = 1, W = Math.sqrt(3) * R;
  svg.addEventListener('click', (e) => { const h = e.target.closest('.hx'); if (h) tap(Number(h.dataset.i)); });
  svg.addEventListener('keydown', (e) => { const h = e.target.closest('.hx'); if (h && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); tap(Number(h.dataset.i)); } });
  function render() {
    const n = S.n;
    const center = (i) => { const r = Math.floor(i / n), c = i % n; return [W * (c + r / 2) + W, 1.5 * R * r + 2 * R]; };
    const w = W * (n + (n - 1) / 2) + 2 * W, h = 1.5 * R * (n - 1) + 4 * R;
    svg.setAttribute('viewBox', '0 0 ' + w.toFixed(2) + ' ' + h.toFixed(2));
    const [ax, ay] = center(0), [bx, by] = center(n - 1), [cx, cy] = center(n * n - n), [dx, dy] = center(n * n - 1), pad = 1.25;
    let out = '<path d="M' + (ax - W * 0.6) + ' ' + (ay - pad) + 'L' + (bx + W * 0.6) + ' ' + (by - pad) + '" class="edge e1"/>' +
      '<path d="M' + (cx - W * 0.6) + ' ' + (cy + pad) + 'L' + (dx + W * 0.6) + ' ' + (dy + pad) + '" class="edge e1"/>' +
      '<path d="M' + (ax - pad) + ' ' + (ay - 0.6) + 'L' + (cx - pad) + ' ' + (cy + 0.6) + '" class="edge e2"/>' +
      '<path d="M' + (bx + pad) + ' ' + (by - 0.6) + 'L' + (dx + pad) + ' ' + (dy + 0.6) + '" class="edge e2"/>';
    const can = new Set(b.live ? A.list(S).map((x) => x.i) : []);
    for (let i = 0; i < n * n; i++) {
      const [x, y] = center(i), v = S.b[i], nm = A.name(i, n);
      const pts = [0, 1, 2, 3, 4, 5].map((k) => { const a = Math.PI / 6 + k * Math.PI / 3; return (x + R * 0.98 * Math.cos(a)).toFixed(3) + ',' + (y + R * 0.98 * Math.sin(a)).toFixed(3); }).join(' ');
      const mark = b.marks[nm] || '';
      out += '<polygon points="' + pts + '" class="hx' + (v ? ' p' + v : '') + (i === last ? ' last' : '') + (line.has(i) ? ' win' : '') + (can.has(i) || b.tapFn ? ' can' : '') +
        '" data-i="' + i + '" data-mark="' + mark + '" tabindex="' + (can.has(i) || b.tapFn ? 0 : -1) + '" role="button" aria-label="' + nm + (v === 1 ? ', gold' : v === 2 ? ', ivory' : ', empty') + (mark ? ', ' + mark : '') + '"/>';
      if (mark === 'hint' && !v) out += '<circle cx="' + x.toFixed(3) + '" cy="' + y.toFixed(3) + '" r=".28" class="hx-hint"/>';
    }
    svg.innerHTML = out;
  }
  function doMove(x, fromPerson) {
    const prev = { S, last, line };
    const r = A.apply(S, x);
    S = r.s; last = x.i; line = new Set(r.line || []);
    sound('place');
    render();
    if (fromPerson && b.moveFn && b.moveFn(x.name, r.f) === false) setTimeout(() => { ({ S, last, line } = prev); render(); }, 650);
    return r.f;
  }
  function tap(i) {
    if (b.tapFn) return b.tapFn(A.name(i, S.n));
    if (!b.live || S.b[i]) return;
    doMove({ name: A.name(i, S.n), i }, true);
  }
  return Object.assign(b, {
    set(p) { S = A.load(p); last = null; line = new Set(); render(); },
    play(name) { const x = A.find(S, name); return x ? doMove(x, false) : null; },
    moves: () => A.list(S).map((x) => x.name),
    mark(map) { b.marks = map || {}; render(); },
    interactive(on) { b.live = on; render(); },
    side: () => S.side
  });
}

export function makeBoard(kind, el) {
  const board = kind === 'chess' ? chessBoard(el) : kind === 'checkers' ? checkersBoard(el) : kind === 'russian-checkers' ? checkersBoard(el, RK) : kind === 'hex' ? hexBoard(el) : kind === 'mancala' ? mancalaBoard(el) : kind === 'sudoku' ? sudokuBoard(el) : kind === 'backgammon' ? backgammonBoard(el) : kind === 'solitaire' ? solitaireBoard(el) : ruleBoard(kind, el);
  board.onMove = (fn) => { board.moveFn = fn; };
  board.onTap = (fn) => { board.tapFn = fn; };
  return board;
}
