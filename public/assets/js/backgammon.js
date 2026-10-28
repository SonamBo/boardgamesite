// Backgammon page: roll, then move your checkers by tapping a checker and then where it goes.
import * as B from './backgammon-engine.js';
import { store } from './site.js';
import { setStatus, levelSwitch, opponentSwitch, record, showResult } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { makeDie, paintDie, tumble, wait, d6 } from './dice-ui.js';

const $ = (id) => document.getElementById(id);
const SAVE = 'bgs-bg-game';
const score = record('backgammon');
const getLevel = levelSwitch('backgammon', () => newGame());
const getOpp = opponentSwitch('backgammon', () => newGame(), { you: 'You', cpu: 'Computer', p1: 'Gold', p2: 'Ivory' });
const vsCpu = () => getOpp() === 'cpu';
const names = () => (vsCpu() ? ['You', 'Computer'] : ['Gold', 'Ivory']);
const dieEls = [makeDie($('bg-dice')), makeDie($('bg-dice'))];
const svg = $('bg-board');

let st, turn, dice, used, legal, made, history, sel, over, busy, started;

// ---------- Drawing ----------
const colX = (col) => 10 + col * 20 + (col >= 6 ? 20 : 0);
const spot = (i) => (i < 12 ? { col: 11 - i, top: false } : { col: i - 12, top: true });
function drawStatic() {
  let h = '<rect x="0" y="0" width="300" height="220" rx="8" class="frame"/><rect x="8" y="8" width="122" height="204" class="felt"/><rect x="150" y="8" width="122" height="204" class="felt"/>';
  h += '<rect x="130" y="8" width="20" height="204" class="bar"/><rect x="274" y="8" width="20" height="204" rx="3" class="tray"/>';
  for (let i = 0; i < 24; i++) {
    const { col, top } = spot(i), x = colX(col);
    const pts = top ? x + ',8 ' + (x + 20) + ',8 ' + (x + 10) + ',92' : x + ',212 ' + (x + 20) + ',212 ' + (x + 10) + ',128';
    h += '<polygon points="' + pts + '" class="pt ' + ((i % 2) ? 'p1' : 'p2') + '" data-i="' + i + '"/>';
    h += '<text x="' + (x + 10) + '" y="' + (top ? 5.8 : 218.6) + '" class="lbl">' + (i + 1) + '</text>';
  }
  h += '<g id="bg-hl"></g><g id="bg-checkers"></g>';
  svg.innerHTML = h;
}
function drawCheckers() {
  let h = '';
  const disc = (x, y, side, cls = '', label = '') => '<g class="ck s' + side + ' ' + cls + '"><circle cx="' + x + '" cy="' + y + '" r="8.6"/><circle cx="' + x + '" cy="' + y + '" r="5.4" class="ring"/>' + (label ? '<text x="' + x + '" y="' + (y + 2.6) + '" class="cnt">' + label + '</text>' : '') + '</g>';
  for (let i = 0; i < 24; i++) {
    const n = Math.abs(st.pts[i]);
    if (!n) continue;
    const side = st.pts[i] > 0 ? 0 : 1;
    const { col, top } = spot(i), x = colX(col) + 10;
    const shown = Math.min(n, 5);
    for (let k = 0; k < shown; k++) {
      const y = top ? 17 + k * 17 : 203 - k * 17;
      h += disc(x, y, side, sel === i && k === shown - 1 ? 'sel' : '', k === shown - 1 && n > 5 ? String(n) : '');
    }
  }
  // bar: yours in the top half (you re-enter at the top right), computer's in the bottom half
  [0, 1].forEach((side) => {
    for (let k = 0; k < Math.min(st.bar[side], 3); k++) {
      const y = side === 0 ? 70 - k * 17 : 150 + k * 17;
      h += disc(140, y, side, sel === 'bar' && side === turn && k === 0 ? 'sel' : '', k === 0 && st.bar[side] > 3 ? String(st.bar[side]) : '');
    }
  });
  // borne off: thin stacks in the tray
  [0, 1].forEach((side) => {
    for (let k = 0; k < st.off[side]; k++) {
      const y = side === 0 ? 209 - k * 6 : 11 + k * 6;
      h += '<rect x="276" y="' + (side === 0 ? y - 4.6 : y) + '" width="16" height="4.6" rx="1.2" class="offck s' + side + '"/>';
    }
  });
  $('bg-checkers').innerHTML = h;
  // highlights for where the selected checker can go, and checkers that can move
  let hl = '';
  const froms = new Set(legal.map((m) => String(m.from)));
  if (sel == null && canAct()) {
    froms.forEach((f) => {
      if (f === 'bar') hl += '<rect x="131" y="' + (turn === 0 ? 10 : 112) + '" width="18" height="98" class="can"/>';
      else { const { col, top } = spot(+f); hl += '<rect x="' + (colX(col) + 1) + '" y="' + (top ? 9 : 127) + '" width="18" height="84" class="can"/>'; }
    });
  }
  if (sel != null) {
    legal.filter((m) => String(m.from) === String(sel)).forEach((m) => {
      if (m.to === 'off') hl += '<rect x="274" y="' + (turn === 0 ? 112 : 8) + '" width="20" height="100" rx="3" class="dest"/>';
      else { const { col, top } = spot(m.to); hl += '<rect x="' + (colX(col) + 1) + '" y="' + (top ? 9 : 127) + '" width="18" height="84" class="dest"/>'; }
    });
  }
  $('bg-hl').innerHTML = hl;
}
const canAct = () => !over && !busy && dice && legal.length && !(vsCpu() && turn === 1);

function render() {
  drawCheckers();
  dieEls.forEach((el, k) => paintDie(el, dice ? dice[k] : 0, { p2: turn === 1, dim: dice ? usedUp(k) : false }));
  $('roll').disabled = over || busy || !!dice || (vsCpu() && turn === 1);
  $('undo').disabled = !made.length || busy || (vsCpu() && turn === 1);
  $('score-you').textContent = 'Pips ' + B.pips(st, 0);
  $('score-cpu').textContent = 'Pips ' + B.pips(st, 1);
  $('row-you').classList.toggle('turn-you', turn === 0 && !over);
  $('row-cpu').classList.toggle('turn-cpu', turn === 1 && !over);
}
function usedUp(k) {
  if (!dice) return false;
  if (dice[0] === dice[1]) return used.length >= (k === 0 ? 2 : 4);
  return used.includes(dice[k]);
}

// Moves still allowed, given what's been played so far this turn.
function computeLegal() {
  const all = B.plays(history[0], turn, dice, false);
  const ok = all.filter((p) => made.every((m, j) => p.seq[j] && String(p.seq[j].from) === String(m.from) && String(p.seq[j].to) === String(m.to)));
  const out = [], seen = new Set();
  ok.forEach((p) => { const m = p.seq[made.length]; if (m && !seen.has(m.from + '>' + m.to)) { seen.add(m.from + '>' + m.to); out.push(m); } });
  return out;
}

async function roll() {
  if (over || busy || dice) return;
  if (!started) { started = true; track('game_start', { game: 'backgammon', opponent: getOpp() }); }
  busy = true;
  const v = [d6(), d6()];
  await tumble((vv) => { dice = vv; render(); }, [0, 1], v);
  dice = v; used = []; made = []; history = [st]; sel = null;
  busy = false;
  legal = computeLegal();
  if (!legal.length) {
    setStatus(names()[turn] + ' rolled ' + v.join(' and ') + ': no legal moves', 'neutral');
    render();
    await wait(1300);
    return endTurn();
  }
  setStatus((turn === 0 && vsCpu() ? 'You' : names()[turn]) + ' rolled ' + v.join(' and ') + (dice[0] === dice[1] ? ': doubles, four moves!' : ''), turn ? 'cpu' : '');
  render();
}

function doMove(m) {
  st = B.apply(st, turn, { ...m });
  made.push(m); used.push(m.d);
  play(m.hit ? 'capture' : m.to === 'off' ? 'king' : 'place');
  sel = null;
  if (B.winner(st) >= 0) { render(); return finish(B.winner(st)); }
  legal = computeLegal();
  render();
  if (!legal.length) setTimeout(endTurn, 500);
}

function endTurn() {
  if (over) return;
  dice = null; legal = []; made = []; used = []; sel = null;
  turn = 1 - turn;
  render();
  save();
  if (vsCpu() && turn === 1) cpuTurn();
  else setStatus((vsCpu() ? 'Your' : names()[turn] + '’s') + ' turn: roll', turn ? 'cpu' : '');
}

async function cpuTurn() {
  setStatus('Computer’s turn', 'cpu');
  await wait(600);
  await roll();
  if (!dice) return;
  const seq = B.choose(st, 1, dice, getLevel());
  for (const m of seq) {
    await wait(550);
    if (over) return;
    doMove(m);
  }
}

function finish(w) {
  over = true;
  const loser = 1 - w;
  // gammon: loser bore off nothing; backgammon: and still has a checker in the winner's home or on the bar
  const gammon = st.off[loser] === 0;
  const homeOfWinner = w === 0 ? [0, 5] : [18, 23];
  const bg = gammon && (st.bar[loser] > 0 || st.pts.some((v, i) => i >= homeOfWinner[0] && i <= homeOfWinner[1] && (loser === 0 ? v > 0 : v < 0)));
  const kind = bg ? 'a backgammon (triple win)' : gammon ? 'a gammon (double win)' : '';
  render();
  store.set(SAVE, null);
  if (vsCpu()) {
    const res = w === 0 ? 'win' : 'lose';
    score.add(res);
    showResult(res, w === 0 ? 'You won!' : 'The computer won', (w === 0 ? 'You bore off all 15 checkers first' : 'The computer bore off first') + (kind ? ', for ' + kind : '') + '.');
    play(res === 'win' ? 'win' : 'lose', 0.1);
    track('game_end', { game: 'backgammon', result: res, gammon: !!kind });
  } else { showResult('win', names()[w] + ' wins!', 'All 15 checkers borne off' + (kind ? ', for ' + kind : '') + '.'); play('win', 0.1); }
  setStatus(names()[w] + (w === 0 && vsCpu() ? ' win!' : ' wins!'));
}

// ---------- Input ----------
function pointFromEvent(e) {
  const r = svg.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width * 300, y = (e.clientY - r.top) / r.height * 220;
  if (x >= 274) return 'off';
  if (x >= 130 && x < 150) return 'bar';
  const col = x < 130 ? Math.floor((x - 10) / 20) : 6 + Math.floor((x - 150) / 20);
  if (col < 0 || col > 11) return null;
  return y < 110 ? 12 + col : 11 - col;
}
svg.addEventListener('click', (e) => {
  if (!canAct()) return;
  const p = pointFromEvent(e);
  if (p == null) return;
  if (sel != null) {
    const m = legal.find((x) => String(x.from) === String(sel) && String(x.to) === String(p));
    if (m) return doMove(m);
  }
  const froms = legal.filter((x) => String(x.from) === String(p));
  if (froms.length) {
    // one place to go and both dice agree? move straight away
    if (froms.length === 1 && new Set(legal.filter((x) => String(x.from) === String(p)).map((x) => x.to)).size === 1 && sel === p) return doMove(froms[0]);
    sel = p; play('select');
  } else sel = null;
  render();
});
svg.addEventListener('dblclick', (e) => {
  if (!canAct()) return;
  const p = pointFromEvent(e);
  const froms = legal.filter((x) => String(x.from) === String(p));
  if (froms.length) doMove(froms.sort((a, b) => b.d - a.d)[0]);
});

function save() { if (!over && started) store.set(SAVE, { opp: getOpp(), st, turn }); }
function resume() {
  const g = store.get(SAVE, null);
  if (!g || g.opp !== getOpp() || !g.st || !Array.isArray(g.st.pts)) return false;
  st = g.st; turn = g.turn | 0; dice = null; legal = []; made = []; used = []; sel = null; over = false; busy = false; started = true;
  render();
  if (vsCpu() && turn === 1) cpuTurn(); else setStatus('Welcome back. ' + (vsCpu() ? 'Your' : names()[turn] + '’s') + ' turn: roll', '');
  return true;
}
function newGame() {
  st = B.start(); turn = 0; dice = null; legal = []; made = []; used = []; history = []; sel = null; over = false; busy = false; started = false;
  $('result').hidden = true;
  store.set(SAVE, null);
  setStatus((vsCpu() ? 'Your' : 'Gold’s') + ' turn: roll', '');
  render();
}
window.addEventListener('pagehide', save);
$('roll').addEventListener('click', () => { if (!(vsCpu() && turn === 1)) roll(); });
$('undo').addEventListener('click', () => {
  if (!made.length || busy) return;
  made = []; used = []; st = history[0]; sel = null; legal = computeLegal(); play('card'); render();
});
$('new-game').addEventListener('click', () => { if (!busy && !(vsCpu() && turn === 1 && dice)) newGame(); });
$('again').addEventListener('click', newGame);
drawStatic();
if (!resume()) newGame();
