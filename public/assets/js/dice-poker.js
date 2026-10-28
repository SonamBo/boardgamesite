// Dice Poker: roll five dice, keep the ones you like, roll the rest once more. Best hand wins the round.
import { setStatus, levelSwitch, opponentSwitch, record, showResult } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { makeDie, paintDie, tumble, wait, d6 } from './dice-ui.js';

const $ = (id) => document.getElementById(id);
const WIN = 3;
const score = record('poker');
const getLevel = levelSwitch('poker', () => newGame());
const getOpp = opponentSwitch('poker', () => newGame(), { you: 'You', cpu: 'Computer', p1: 'Player 1', p2: 'Player 2' });
const vsCpu = () => getOpp() === 'cpu';
const names = () => (vsCpu() ? ['You', 'Computer'] : ['Player 1', 'Player 2']);
const RANKS = ['Nothing', 'One pair', 'Two pair', 'Three of a kind', 'Low straight', 'High straight', 'Full house', 'Four of a kind', 'Five of a kind'];

// A hand as [rank, tie-breakers...] that compares from the left.
export function handValue(d) {
  const c = [0, 0, 0, 0, 0, 0, 0];
  d.forEach((v) => c[v]++);
  const groups = [1, 2, 3, 4, 5, 6].filter((v) => c[v]).sort((a, b) => c[b] - c[a] || b - a);
  const shape = groups.map((v) => c[v]).join('');
  const sorted = d.slice().sort().join('');
  if (shape === '5') return [8, groups[0]];
  if (shape === '41') return [7, ...groups];
  if (shape === '32') return [6, ...groups];
  if (sorted === '23456') return [5];
  if (sorted === '12345') return [4];
  if (shape === '311') return [3, ...groups];
  if (shape === '221') return [2, ...groups];
  if (shape === '2111') return [1, ...groups];
  return [0, ...groups];
}
const cmp = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0); return 0; };

const rows = [0, 1].map((p) => [0, 1, 2, 3, 4].map((j) => makeDie($('dp-dice' + p), { keep: true, onClick: () => toggle(p, j) })));
let wins, turn, dice, held, stage, hands, over, busy, started, starter;
// stage per player: 0 = not rolled, 1 = rolled once (can keep and reroll), 2 = done

function render() {
  [0, 1].forEach((p) => {
    rows[p].forEach((el, j) => paintDie(el, dice[p][j], { held: held[p][j], p2: p === 1, disabled: over || busy || turn !== p || stage[p] !== 1 || (vsCpu() && p === 1) }));
    $('hand' + p).textContent = stage[p] ? RANKS[handValue(dice[p])[0]] : '';
    $('dp-name' + p).textContent = names()[p];
  });
  const mine = !(vsCpu() && turn === 1);
  $('roll').disabled = over || busy || !mine || stage[turn] === 2;
  $('roll').textContent = stage[turn] === 0 ? 'Roll' : 'Roll the rest';
  $('stand').hidden = stage[turn] !== 1;
  $('stand').disabled = over || busy || !mine;
  $('score-you').textContent = String(wins[0]);
  $('score-cpu').textContent = String(wins[1]);
  $('row-you').classList.toggle('turn-you', turn === 0 && !over);
  $('row-cpu').classList.toggle('turn-cpu', turn === 1 && !over);
}
function toggle(p, j) {
  if (over || busy || turn !== p || stage[p] !== 1) return;
  held[p][j] = !held[p][j];
  play('select');
  render();
}

async function roll() {
  const p = turn;
  if (over || busy || stage[p] === 2) return;
  if (!started) { started = true; track('game_start', { game: 'dice-poker', opponent: getOpp() }); }
  busy = true;
  const idx = [0, 1, 2, 3, 4].filter((j) => stage[p] === 0 || !held[p][j]);
  const vals = idx.map(d6);
  await tumble((vv) => { vv.forEach((v, k) => { dice[p][idx[k]] = v; }); render(); }, idx, vals);
  busy = false;
  stage[p]++;
  const who = p === 0 && vsCpu() ? 'You' : names()[p];
  setStatus(who + ': ' + RANKS[handValue(dice[p])[0]] + (stage[p] === 1 ? '. Keep dice and roll again, or stand' : ''), p ? 'cpu' : '');
  render();
  if (stage[p] === 2) { await wait(700); next(); }
}
function stand() { if (stage[turn] !== 1) return; stage[turn] = 2; play('place'); next(); }

function next() {
  if (stage[0] === 2 && stage[1] === 2) return scoreRound();
  turn = 1 - turn;
  render();
  if (vsCpu() && turn === 1) cpuTurn();
  else setStatus(names()[turn] + '’s turn: roll', turn ? 'cpu' : '');
}

// The computer keeps its groups (or a straight draw) and rolls the rest.
async function cpuTurn() {
  setStatus('Computer’s turn', 'cpu');
  await wait(600);
  await roll();
  const d = dice[1], v = handValue(d), lvl = getLevel();
  const beat = cmp(v, handValue(dice[0])) > 0 && stage[0] === 2;
  if (v[0] >= 4 || (lvl !== 'easy' && beat)) { await wait(500); stand(); return; }
  const c = [0, 0, 0, 0, 0, 0, 0];
  d.forEach((x) => c[x]++);
  const keep = d.map((x) => c[x] >= 2);
  const uniq = new Set(d);
  const straightDraw = [[2, 3, 4, 5], [1, 2, 3, 4], [3, 4, 5, 6]].find((s) => s.every((x) => uniq.has(x)));
  if (lvl !== 'easy' && straightDraw && v[0] <= 1) {
    const used = new Set();
    held[1] = d.map((x) => (straightDraw.includes(x) && !used.has(x) ? (used.add(x), true) : false));
  } else if (!keep.some(Boolean)) {
    const hi = Math.max(...d);
    held[1] = d.map((x) => lvl === 'hard' && x === hi);
  } else held[1] = keep;
  render();
  await wait(700);
  await roll();
}

function scoreRound() {
  const a = handValue(dice[0]), b = handValue(dice[1]);
  const r = cmp(a, b);
  if (r === 0) setStatus('Tied hands: ' + RANKS[a[0]] + '. No point', 'neutral');
  else {
    const w = r > 0 ? 0 : 1;
    wins[w]++;
    setStatus((w === 0 && vsCpu() ? 'You win' : names()[w] + ' wins') + ' the round with ' + RANKS[(w ? b : a)[0]].toLowerCase(), w ? 'cpu' : '');
    play(w === 0 ? 'found' : 'move');
  }
  render();
  if (wins[0] >= WIN || wins[1] >= WIN) return finish();
  busy = true;
  setTimeout(() => {
    busy = false;
    starter = 1 - starter; turn = starter; resetRound(); render();
    if (vsCpu() && turn === 1) cpuTurn(); else setStatus((vsCpu() ? 'Your' : names()[turn] + '’s') + ' turn: roll', '');
  }, 2000);
}

function finish() {
  over = true;
  render();
  const [a, b] = wins;
  if (vsCpu()) {
    const res = a > b ? 'win' : 'lose';
    score.add(res);
    showResult(res, res === 'win' ? 'You won!' : 'The computer won', 'Rounds: you ' + a + ', computer ' + b + '.');
    play(res === 'win' ? 'win' : 'lose', 0.1);
    track('game_end', { game: 'dice-poker', result: res });
  } else {
    showResult('win', (a > b ? 'Player 1' : 'Player 2') + ' wins!', 'Rounds: ' + a + ' to ' + b + '.');
    play('win', 0.1);
  }
}

function resetRound() { dice = [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0]]; held = [[], []].map(() => [false, false, false, false, false]); stage = [0, 0]; }
function newGame() {
  wins = [0, 0]; turn = 0; starter = 0; over = false; busy = false; started = false;
  resetRound();
  $('result').hidden = true;
  setStatus((vsCpu() ? 'Your' : 'Player 1’s') + ' turn: roll', '');
  render();
}
$('roll').addEventListener('click', () => { if (!(vsCpu() && turn === 1)) roll(); });
$('stand').addEventListener('click', () => { if (!(vsCpu() && turn === 1) && !busy) stand(); });
$('new-game').addEventListener('click', () => { if (!(vsCpu() && turn === 1) || over) newGame(); });
$('again').addEventListener('click', newGame);
newGame();
