// Boards for lessons and puzzles: Chess, Checkers and Mancala, driven by the real rules engines.
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
import * as K from './checkers-engine.js';
import * as M from './mancala-rules.js';
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
    if (i % 8 === 0) btn.dataset.rank = String(8 - Math.floor(i / 8));
    if (i >= 56) btn.dataset.file = FILES[i % 8];
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
function checkersBoard(el) {
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
    set(rows) { B = checkersFrom(rows); side = 1; partial = []; last = null; render(); },
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

export function makeBoard(kind, el) {
  const board = kind === 'chess' ? chessBoard(el) : kind === 'checkers' ? checkersBoard(el) : mancalaBoard(el);
  board.onMove = (fn) => { board.moveFn = fn; };
  board.onTap = (fn) => { board.tapFn = fn; };
  return board;
}
