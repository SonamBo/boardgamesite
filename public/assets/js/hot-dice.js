// Hot Dice (Farkle rules): roll six dice, set aside scoring dice, and roll on or bank.
// Roll nothing that scores and you lose the turn's points. First to 4,000 wins.
import { setStatus, levelSwitch, opponentSwitch, record, showResult } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { shake } from './solo.js';
import { makeDie, paintDie, tumble, wait, d6 } from './dice-ui.js';

const $ = (id) => document.getElementById(id);
const GOAL = 4000;
const score = record('hotdice');
const getLevel = levelSwitch('hotdice', () => newGame());
const getOpp = opponentSwitch('hotdice', () => newGame(), { you: 'You', cpu: 'Computer', p1: 'Player 1', p2: 'Player 2' });
const vsCpu = () => getOpp() === 'cpu';
const names = () => (vsCpu() ? ['You', 'Computer'] : ['Player 1', 'Player 2']);

// Score a set of dice where every die must count. Returns 0 if any die doesn't score.
export function scoreSet(d) {
  if (!d.length) return 0;
  const c = [0, 0, 0, 0, 0, 0, 0];
  d.forEach((v) => c[v]++);
  if (d.length === 6 && [1, 2, 3, 4, 5, 6].every((v) => c[v] === 1)) return 1500;
  if (d.length === 6 && [1, 2, 3, 4, 5, 6].filter((v) => c[v] === 2).length === 3) return 750;
  let s = 0;
  for (let v = 1; v <= 6; v++) {
    let n = c[v];
    if (n >= 3) { s += (v === 1 ? 1000 : v * 100) * (n - 2); n = 0; }
    if (v === 1) s += n * 100;
    else if (v === 5) s += n * 50;
    else if (n) return 0;
  }
  return s;
}
// The best scoring choice from a roll: { score, keep: [indexes] }.
export function best(d) {
  let top = { score: 0, keep: [] };
  for (let m = 1; m < 1 << d.length; m++) {
    const idx = d.map((_, i) => i).filter((i) => m & (1 << i));
    const s = scoreSet(idx.map((i) => d[i]));
    if (s > top.score || (s === top.score && s && idx.length > top.keep.length)) top = { score: s, keep: idx };
  }
  return top;
}

const dieEls = [0, 1, 2, 3, 4, 5].map((j) => makeDie($('hd-dice'), { keep: true, onClick: () => toggle(j) }));
let totals, turn, dice, live, pick, pot, over, busy, started, rolled;
// live[j]: die j is still in play this turn (not yet set aside)

function picked() { return [...pick].map((j) => dice[j]); }
function render() {
  dieEls.forEach((el, j) => paintDie(el, dice[j], {
    held: pick.has(j), p2: turn === 1, dim: !live[j], keepLabel: 'Score', keptLabel: 'Scoring',
    disabled: over || busy || !rolled || !live[j] || (vsCpu() && turn === 1)
  }));
  const sel = scoreSet(picked());
  const mine = !(vsCpu() && turn === 1);
  $('pot').textContent = String(pot + sel);
  $('roll').disabled = over || busy || !mine || (rolled && !sel);
  const left = live.filter(Boolean).length - pick.size;
  $('roll').textContent = !rolled ? 'Roll' : left === 0 ? 'Hot dice! Roll all 6' : 'Roll ' + left + (left === 1 ? ' die' : ' dice');
  $('bank').disabled = over || busy || !mine || !(pot + sel) || (rolled && !sel);
  $('bank').textContent = 'Bank ' + (pot + sel);
  [0, 1].forEach((p) => {
    $('bar' + p).style.setProperty('--v', String(Math.min(100, totals[p] / GOAL * 100)));
    $('num' + p).textContent = String(totals[p]);
    $('name' + p).textContent = names()[p];
  });
  $('score-you').textContent = String(totals[0]);
  $('score-cpu').textContent = String(totals[1]);
  $('row-you').classList.toggle('turn-you', turn === 0 && !over);
  $('row-cpu').classList.toggle('turn-cpu', turn === 1 && !over);
}

function toggle(j) {
  if (over || busy || !rolled || !live[j] || (vsCpu() && turn === 1)) return;
  pick.has(j) ? pick.delete(j) : pick.add(j);
  play('select');
  const s = scoreSet(picked());
  setStatus(pick.size ? (s ? 'These score ' + s : 'Every die you pick must score') : 'Pick scoring dice', s || !pick.size ? '' : 'neutral');
  render();
}

async function roll() {
  if (over || busy) return;
  if (rolled) {
    const s = scoreSet(picked());
    if (!s) { shake($('hd-dice'), play); setStatus('Pick at least one scoring die first', 'neutral'); return; }
    pot += s;
    pick.forEach((j) => { live[j] = false; });
    pick = new Set();
    if (!live.some(Boolean)) { live = live.map(() => true); setStatus('Hot dice! All six back in play', ''); play('king'); }
  }
  if (!started) { started = true; track('game_start', { game: 'hot-dice', opponent: getOpp() }); }
  busy = true;
  const idx = live.map((l, j) => (l ? j : -1)).filter((j) => j >= 0);
  const vals = idx.map(d6);
  await tumble((vv) => { vv.forEach((v, k) => { dice[idx[k]] = v; }); render(); }, idx, vals);
  busy = false;
  rolled = true;
  const b = best(idx.map((j) => dice[j]));
  if (!b.score) {
    play('error');
    setStatus('No scoring dice! ' + (turn === 0 && vsCpu() ? 'You lose' : names()[turn] + ' loses') + ' ' + pot + ' points', 'cpu');
    pot = 0;
    render();
    await wait(1400);
    return nextTurn();
  }
  setStatus('Pick scoring dice: 1s, 5s, or three of a kind', turn ? 'cpu' : '');
  render();
}

async function bank() {
  const s = rolled ? scoreSet(picked()) : 0;
  if (over || busy || (rolled && !s)) return;
  pot += s;
  totals[turn] += pot;
  play('place');
  setStatus((turn === 0 && vsCpu() ? 'You bank ' : names()[turn] + ' banks ') + pot, turn ? 'cpu' : '');
  pot = 0;
  render();
  if (totals[turn] >= GOAL) return finish(turn);
  await wait(800);
  nextTurn();
}

function nextTurn() {
  turn = 1 - turn; reset();
  render();
  if (vsCpu() && turn === 1) cpuTurn();
  else setStatus((vsCpu() ? 'Your' : names()[turn] + '’s') + ' turn: roll', turn ? 'cpu' : '');
}

// The computer keeps its best scoring dice, then decides whether to bank.
async function cpuTurn() {
  setStatus('Computer’s turn', 'cpu');
  await wait(700);
  await roll();
  while (!over && turn === 1 && rolled) {
    await wait(700);
    const idx = live.map((l, j) => (l ? j : -1)).filter((j) => j >= 0);
    const b = best(idx.map((j) => dice[j]));
    const lvl = getLevel();
    const keep = b.keep.map((k) => idx[k]);
    pick = new Set(keep);
    render();
    await wait(600);
    const s = scoreSet(picked());
    const left = live.filter(Boolean).length - pick.size;
    const need = GOAL - totals[1];
    const behind = totals[0] - totals[1];
    let limit = lvl === 'easy' ? 250 : left >= 3 ? 600 : 300;
    if (lvl === 'hard') { if (behind > 1000) limit += 300; if (totals[0] >= GOAL - 500) limit = 99999; }
    if (left === 0) { await roll(); continue; }
    if (pot + s >= need || pot + s >= limit) { await bank(); return; }
    await roll();
  }
}

function finish(p) {
  over = true;
  render();
  const [a, b] = totals;
  if (vsCpu()) {
    const res = p === 0 ? 'win' : 'lose';
    score.add(res);
    showResult(res, res === 'win' ? 'You won!' : 'The computer won', 'You ' + a + ', computer ' + b + '.');
    play(res === 'win' ? 'win' : 'lose', 0.1);
    track('game_end', { game: 'hot-dice', result: res });
  } else {
    showResult('win', names()[p] + ' wins!', 'Player 1 ' + a + ', Player 2 ' + b + '.');
    play('win', 0.1);
  }
}

function reset() { dice = [0, 0, 0, 0, 0, 0]; live = [true, true, true, true, true, true]; pick = new Set(); pot = 0; rolled = false; }
function newGame() {
  totals = [0, 0]; turn = 0; over = false; busy = false; started = false;
  reset();
  $('result').hidden = true;
  setStatus((vsCpu() ? 'Your' : 'Player 1’s') + ' turn: roll', '');
  render();
}
$('roll').addEventListener('click', () => { if (!(vsCpu() && turn === 1)) roll(); });
$('bank').addEventListener('click', () => { if (!(vsCpu() && turn === 1)) bank(); });
$('new-game').addEventListener('click', () => { if (!(vsCpu() && turn === 1) || over) newGame(); });
$('again').addEventListener('click', newGame);
newGame();
