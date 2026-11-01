// Post-game review, like chess.com's Game Review: accuracy, how each move rated, the key moments with the
// better move, and a chance to find that move yourself. Opened from a game's result box.
//   offerReview(() => ({ game, board, plies, me }))   adds a "Review game" button to the result box
import { analyseGame, summarise, CLASSES } from './analysis.js';
import { makeBoard } from './learn-boards.js';
import * as C from './chess-engine.js';
import { track } from './firebase.js';
import { logActivity } from './learn-progress.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const CLASS_NAME = Object.fromEntries(CLASSES.map((c) => [c.id, c.name]));
const ICON = { best: '★', good: '✓', inaccuracy: '?!', mistake: '?', blunder: '??' };
const FILES = 'abcdefgh';
const plural = (c, n) => (n === 1 || c.id === 'best' || c.id === 'good' ? c.name.toLowerCase() : c.id === 'inaccuracy' ? 'inaccuracies' : c.name.toLowerCase() + 's');

export function offerReview(getGame) {
  const box = document.getElementById('result');
  if (!box) return;
  let btn = box.querySelector('.review-btn');
  if (!btn) {
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-outline review-btn';
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>Review game';
    const again = box.querySelector('#again');
    if (again) again.before(btn); else box.appendChild(btn);
  }
  const g = getGame();
  btn.hidden = !g || g.plies.filter((p) => p.side === g.me).length < 2;
  btn.onclick = () => openReview(getGame());
}
export function hideReview() {
  const btn = document.querySelector('#result .review-btn');
  if (btn) btn.hidden = true;
}

// Squares or pits to highlight for a move.
function marksFor(game, move, kind, base = {}) {
  const out = { ...base };
  if (!move) return out;
  if (game === 'chess') { out[move.slice(0, 2)] = kind; out[move.slice(2, 4)] = kind; }
  else if (game === 'checkers') move.split('-').forEach((sq) => { out[sq] = kind; });
  else out[move] = kind;
  return out;
}
function label(game, position, move) {
  if (!move) return '';
  if (game === 'chess') {
    const s = C.fromFen(position);
    const m = C.legal(s).find((x) => {
      const n = FILES[x.from % 8] + (8 - Math.floor(x.from / 8)) + FILES[x.to % 8] + (8 - Math.floor(x.to / 8)) + (x.promo ? x.promo.toLowerCase() : '');
      return n === move || n === move + 'q';
    });
    return m ? C.san(s, m) : move;
  }
  if (game === 'checkers') return move.replace(/-/g, move.split('-').length > 2 ? '×' : '-');
  return 'pit ' + move.replace('t', '');
}

async function openReview(g) {
  if (!g) return;
  track('review_open', { game: g.game, moves: g.plies.length });
  const box = document.createElement('div');
  box.className = 'jtest game-review';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', 'Game review');
  box.innerHTML = `<div class="jtest-inner">
    <div class="jtest-head"><p>Game review</p><button type="button" class="jtest-x" aria-label="Close">✕</button></div>
    <div class="rv-main">
      <div class="rv-board-wrap"><div class="rv-board"></div><p class="rv-caption muted"></p></div>
      <div class="rv-side">
        <div class="rv-card card rv-status">
          <img class="rv-fox" src="/assets/img/fox-face-think.webp" alt="" width="64" height="64">
          <div><p class="rv-title">The fox is reviewing your game…</p><div class="lp-bar rv-progress" aria-hidden="true"><span></span></div><p class="rv-sub muted"></p></div>
        </div>
        <div class="rv-card card rv-moment" hidden></div>
        <div class="rv-card card rv-moves-card" hidden><p class="rv-h">Your moves</p><div class="rv-moves"></div></div>
        ${g.game === 'chess' ? '<p class="rv-credit muted">Analysis by <a href="/about#credits">Stockfish 10</a> (GPL-3.0).</p>' : ''}
      </div>
    </div></div>`;
  document.body.appendChild(box);
  document.body.classList.add('jtest-open');
  const close = () => { box.remove(); document.body.classList.remove('jtest-open'); };
  box.querySelector('.jtest-x').addEventListener('click', close);
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  box.querySelector('.jtest-x').focus();

  const $ = (s) => box.querySelector(s);
  const board = makeBoard(g.board, $('.rv-board'));
  const last = g.plies[g.plies.length - 1];
  board.set(g.final || last.position);
  board.interactive(false);

  const results = await analyseGame(g, (k, n, r) => {
    $('.rv-progress span').style.width = Math.round((k / n) * 100) + '%';
    $('.rv-sub').textContent = 'Move ' + k + ' of ' + n;
    addMoveChip(r);
  });
  const sum = summarise(results);
  track('review_done', { game: g.game, accuracy: sum.accuracy, blunders: sum.counts.blunder });
  logActivity(g.game, 1);

  // ---- summary ----
  const face = sum.accuracy >= 85 ? 'laugh' : sum.accuracy >= 65 ? 'think' : sum.counts.blunder ? 'surprised' : 'sad';
  $('.rv-fox').src = '/assets/img/fox-face-' + face + '.webp';
  const verdict = sum.accuracy >= 90 ? 'Brilliant game!' : sum.accuracy >= 80 ? 'Great game!' : sum.accuracy >= 65 ? 'Good game, with a few slips.' : 'Lots to learn from this one.';
  $('.rv-status').innerHTML = '<img class="rv-fox" src="/assets/img/fox-face-' + face + '.webp" alt="" width="64" height="64">' +
    '<div class="rv-sum"><p class="rv-title">' + verdict + '</p><p class="rv-acc"><b>' + sum.accuracy + '%</b> accuracy</p>' +
    '<div class="rv-counts">' + CLASSES.filter((c) => sum.counts[c.id]).map((c) => '<span class="rv-c ' + c.id + '"><i>' + ICON[c.id] + '</i>' + sum.counts[c.id] + ' ' + plural(c, sum.counts[c.id]) + '</span>').join('') + '</div></div>';

  // ---- key moments ----
  const moment = $('.rv-moment');
  if (sum.key.length) {
    moment.hidden = false;
    let at = 0;
    const show = (i) => {
      at = i;
      const r = sum.key[i];
      const n = results.indexOf(r) + 1;
      board.set(r.position);
      board.interactive(false);
      board.onMove(null);
      board.mark(marksFor(g.game, r.move, 'bad', marksFor(g.game, r.best, 'good')));
      $('.rv-caption').textContent = 'Your move ' + n + ': red is what you played, green is better.';
      moment.innerHTML = '<p class="rv-h">Key moment ' + (i + 1) + ' of ' + sum.key.length + '</p>' +
        '<p class="rv-line"><span class="rv-c ' + r.cls + '"><i>' + ICON[r.cls] + '</i>' + CLASS_NAME[r.cls] + '</span> You played <b>' + esc(label(g.game, r.position, r.move)) + '</b>.</p>' +
        '<p class="rv-line">Better was <b class="rv-best">' + esc(label(g.game, r.position, r.best)) + '</b>.</p>' +
        '<p class="rv-feedback muted"></p>' +
        '<div class="rv-actions"><button type="button" class="btn btn-gold rv-try">Try it yourself</button>' +
        (sum.key.length > 1 ? '<button type="button" class="btn btn-outline rv-next">' + (i + 1 < sum.key.length ? 'Next moment' : 'First moment') + '</button>' : '') + '</div>';
      moment.querySelector('.rv-try').onclick = () => tryIt(r);
      const nb = moment.querySelector('.rv-next');
      if (nb) nb.onclick = () => show((at + 1) % sum.key.length);
    };
    const tryIt = (r) => {
      board.set(r.position);
      board.mark({});
      board.interactive(true);
      $('.rv-caption').textContent = 'Find a better move than the one you played.';
      const fb = moment.querySelector('.rv-feedback');
      fb.textContent = 'Your turn: find the better move.';
      fb.className = 'rv-feedback';
      board.onMove((name) => {
        const ok = name === r.best || name === r.best + 'q';
        fb.textContent = ok ? 'That’s it! The fox approves.' : 'Not that one. Look again.';
        fb.className = 'rv-feedback ' + (ok ? 'good' : 'bad');
        if (ok) { board.interactive(false); board.mark(marksFor(g.game, r.best, 'good')); track('review_try', { game: g.game, solved: true }); }
        return ok;
      });
    };
    show(0);
  } else {
    $('.rv-caption').textContent = 'No real mistakes to show. Nicely played!';
  }

  function addMoveChip(r) {
    const card = $('.rv-moves-card');
    card.hidden = false;
    const n = $('.rv-moves').children.length + 1;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'rv-move rv-c ' + r.cls;
    b.title = CLASS_NAME[r.cls];
    b.innerHTML = '<small>' + n + '</small>' + esc(label(g.game, r.position, r.move)) + '<i>' + ICON[r.cls] + '</i>';
    b.onclick = () => {
      board.set(r.position);
      board.interactive(false);
      board.mark(marksFor(g.game, r.move, r.cls === 'best' || r.cls === 'good' ? 'good' : 'bad', r.cls === 'best' ? {} : marksFor(g.game, r.best, 'good')));
      $('.rv-caption').textContent = 'Your move ' + n + ': ' + CLASS_NAME[r.cls].toLowerCase() + (r.cls === 'best' ? '.' : '. Best was ' + label(g.game, r.position, r.best) + '.');
    };
    $('.rv-moves').appendChild(b);
  }
}
