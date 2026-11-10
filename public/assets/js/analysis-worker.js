// Background analysis for Checkers, Russian Checkers and Mancala game reviews, so the page stays responsive.
// Message in: { id, game, position, side, timeMs }. Message out: { id, scores: [{ name, score }], depth }.
import * as K from './checkers-engine.js';
import * as RK from './russian-checkers-engine.js';
import * as M from './mancala-rules.js';

const FILES = 'abcdefgh';
const sqName = (i) => FILES[i % 8] + (8 - Math.floor(i / 8));
const pitName = (i) => (i <= 5 ? String(i + 1) : 't' + (13 - i));

self.onmessage = (e) => {
  const { id, game, position, side, timeMs } = e.data;
  let out;
  if (game === 'checkers' || game === 'russian-checkers') {
    const r = (game === 'checkers' ? K : RK).analysePosition(position, side, timeMs);
    out = { scores: r.scores.map((x) => ({ name: x.move.path.map(sqName).join('-'), score: x.score })), depth: r.depth };
  } else {
    const r = M.analysePosition(position, side, timeMs);
    out = { scores: r.scores.map((x) => ({ name: pitName(x.pit), score: x.score })), depth: r.depth };
  }
  self.postMessage({ id, ...out });
};
