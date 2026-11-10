// Post-game analysis. Chess uses Stockfish 10 (GPL-3.0, /assets/engine/, run as a separate Web Worker);
// Checkers, Russian Checkers and Mancala use the site's own engines searching deeper in a Web Worker (analysis-worker.js).
//
// analyseGame({ game, plies, me }, onProgress) → [{ ...ply, best, bestScore, playedScore, drop, cls, accuracy }]
//   plies: [{ position, side, move, label }]   position before the move; move by its name (chess UCI,
//   checkers 'c3-d4', mancala '3'); side: the player who moved ('w'/'b', 1/-1, 0/1). Only `me`'s moves are graded.
import * as C from './chess-engine.js';

// Winning chances in [-1, 1] from a score, per game (chess: centipawns, as lichess does).
const CHANCES = {
  // Stockfish 10's centipawns run about 1.4× today's normalised scale, so they are scaled down first.
  chess: (s) => 2 / (1 + Math.exp(-0.00368208 * 0.7 * s)) - 1,
  checkers: (s) => 2 / (1 + Math.exp(-s / 140)) - 1,
  'russian-checkers': (s) => 2 / (1 + Math.exp(-s / 140)) - 1,
  mancala: (s) => 2 / (1 + Math.exp(-s / 8)) - 1
};
// The size of the drop in winning chances that makes a move an inaccuracy, mistake or blunder (lichess's scale).
export const CLASSES = [
  { id: 'best', name: 'Best', max: 0.02 },
  { id: 'good', name: 'Good', max: 0.1 },
  { id: 'inaccuracy', name: 'Inaccuracy', max: 0.2 },
  { id: 'mistake', name: 'Mistake', max: 0.3 },
  { id: 'blunder', name: 'Blunder', max: Infinity }
];
const classify = (drop, isBest) => (isBest ? CLASSES[0] : CLASSES.find((c) => drop <= c.max) || CLASSES[4]).id;
// Accuracy for one move (lichess's formula on win percentages).
const accuracyOf = (before, after) => {
  const wp = (w) => 50 + 50 * w;
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * Math.max(0, wp(before) - wp(after))) - 3.1669));
};

// ---------- Stockfish (chess) ----------
let sf = null;
function stockfish() {
  if (sf) return sf;
  const wasm = typeof WebAssembly === 'object' && WebAssembly.validate(Uint8Array.of(0x0, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00));
  const w = new Worker(wasm ? '/assets/engine/stockfish.wasm.js' : '/assets/engine/stockfish.js');
  let pending = null, last = null;
  w.onmessage = (e) => {
    const line = String(e.data);
    if (line.startsWith('info') && / score /.test(line) && / pv /.test(line)) {
      const cp = line.match(/ score cp (-?\d+)/), mate = line.match(/ score mate (-?\d+)/);
      const score = cp ? Number(cp[1]) : mate ? (Number(mate[1]) > 0 ? 10000 - Number(mate[1]) * 10 : -10000 - Number(mate[1]) * 10) : 0;
      last = { score, pv: line.match(/ pv (.+)$/)[1].split(' ') };
    } else if (line.startsWith('bestmove') && pending) {
      const done = pending; pending = null;
      done({ best: line.split(' ')[1], score: last ? last.score : 0 });
      last = null;
    }
  };
  w.postMessage('uci');
  w.postMessage('setoption name Hash value 16');
  sf = {
    // Score of the position for the side to move, and the best move.
    // `only`: search just that move (the score of playing it, from the same position and point of view)
    evaluate(fen, ms = 300, only = '') {
      return new Promise((resolve) => {
        pending = resolve; last = null;
        w.postMessage('position fen ' + fen);
        w.postMessage('go depth 18 movetime ' + ms + (only ? ' searchmoves ' + only : ''));
      });
    }
  };
  return sf;
}

async function chessScores(fen, played, ms) {
  // The best move and its score, then the score of the move played, searched from the same position so the two
  // numbers are directly comparable (both from the mover's point of view).
  const s = C.fromFen(fen);
  const m = C.legal(s).find((x) => uci(x) === played || uci(x) === played + 'q');
  const before = await stockfish().evaluate(fen, ms);
  if (!m || uci(m) === before.best) return { best: before.best, bestScore: before.score, playedScore: before.score };
  const st = C.status(C.make(s, m));
  let after;
  if (st.over) after = st.reason === 'checkmate' ? 10000 : 0;
  else after = (await stockfish().evaluate(fen, ms, uci(m))).score;
  return { best: before.best, bestScore: before.score, playedScore: Math.min(after, before.score) };
}
const FILES = 'abcdefgh';
const sqName = (i) => FILES[i % 8] + (8 - Math.floor(i / 8));
const uci = (m) => sqName(m.from) + sqName(m.to) + (m.promo ? m.promo.toLowerCase() : '');

// ---------- Checkers and Mancala (our engines, in a worker) ----------
let worker = null, nextId = 1;
const waiting = new Map();
function ourEngine() {
  if (!worker) {
    worker = new Worker('/assets/js/analysis-worker.js', { type: 'module' });
    worker.onmessage = (e) => { const r = waiting.get(e.data.id); waiting.delete(e.data.id); if (r) r(e.data); };
  }
  return worker;
}
function analyse(game, position, side, timeMs) {
  return new Promise((resolve) => {
    const id = nextId++;
    waiting.set(id, resolve);
    ourEngine().postMessage({ id, game, position, side, timeMs });
  });
}

export async function analyseGame({ game, plies, me }, onProgress = () => {}) {
  const mine = plies.filter((p) => p.side === me);
  const out = [];
  let k = 0;
  for (const p of mine) {
    let best, bestScore, playedScore;
    if (game === 'chess') {
      ({ best, bestScore, playedScore } = await chessScores(p.position, p.move, 450));
    } else {
      const r = await analyse(game, p.position, p.side, 900);
      best = r.scores[0] ? r.scores[0].name : p.move;
      bestScore = r.scores[0] ? r.scores[0].score : 0;
      const mineScore = r.scores.find((x) => x.name === p.move);
      playedScore = mineScore ? mineScore.score : bestScore;
    }
    const W = CHANCES[game];
    const drop = Math.max(0, W(bestScore) - W(playedScore));
    const isBest = p.move === best || p.move === best + 'q' || drop < 0.005;
    out.push({ ...p, best, bestScore, playedScore, drop, cls: classify(drop, isBest), accuracy: accuracyOf(W(bestScore), W(playedScore)) });
    onProgress(++k, mine.length, out[out.length - 1]);
  }
  return out;
}

export function summarise(results) {
  const counts = Object.fromEntries(CLASSES.map((c) => [c.id, 0]));
  results.forEach((r) => { counts[r.cls]++; });
  const accuracy = results.length ? Math.round(results.reduce((n, r) => n + r.accuracy, 0) / results.length) : 100;
  const key = results.filter((r) => r.cls === 'mistake' || r.cls === 'blunder' || r.cls === 'inaccuracy')
    .sort((a, b) => b.drop - a.drop).slice(0, 3);
  return { counts, accuracy, key };
}
