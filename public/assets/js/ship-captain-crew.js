// Ship, Captain and Crew: in three rolls, find a 6 (ship), then a 5 (captain), then a 4 (crew).
// Your other two dice are the cargo. Highest cargo wins the round; first to 3 rounds wins.
import { setStatus, levelSwitch, opponentSwitch, record, showResult } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { makeDie, paintDie, tumble, wait, d6 } from './dice-ui.js';

const $ = (id) => document.getElementById(id);
const WIN = 3;
const score = record('scc');
const getLevel = levelSwitch('scc', () => newGame());
const getOpp = opponentSwitch('scc', () => newGame(), { you: 'You', cpu: 'Computer', p1: 'Player 1', p2: 'Player 2' });
const vsCpu = () => getOpp() === 'cpu';
const names = () => (vsCpu() ? ['You', 'Computer'] : ['Player 1', 'Player 2']);
const dieEls = [0, 1, 2, 3, 4].map(() => makeDie($('scc-dice')));
const ROLE = ['Ship', 'Captain', 'Crew'];

let wins, turn, dice, locked, rollsLeft, results, over, busy, started, starter;

// Lock in 6, then 5, then 4, in that order, from the dice just rolled.
function lockInOrder() {
  for (const [k, need] of [[0, 6], [1, 5], [2, 4]]) {
    if (locked[k] != null) continue;
    const i = dice.findIndex((v, j) => v === need && !locked.includes(j));
    if (i < 0) break;
    locked[k] = i;
  }
}
const crewDone = () => locked.every((x) => x != null);
const cargo = () => (crewDone() ? dice.filter((_, j) => !locked.includes(j)).reduce((a, b) => a + b, 0) : 0);

function render() {
  dieEls.forEach((el, j) => {
    const role = locked.indexOf(j);
    paintDie(el, dice[j], { p2: turn === 1, dim: crewDone() ? false : role < 0 && rollsLeft < 3 });
    el.dataset.role = role >= 0 ? ROLE[role] : crewDone() && dice[j] ? 'Cargo' : '';
  });
  $('scc-slots').querySelectorAll('[data-slot]').forEach((s, k) => s.classList.toggle('got', locked[k] != null));
  const cpuTurn = vsCpu() && turn === 1;
  $('roll').disabled = over || busy || cpuTurn || rollsLeft === 0 || results[turn] != null;
  $('roll').textContent = rollsLeft === 3 ? 'Roll' : crewDone() ? 'Roll the cargo' : 'Roll again';
  $('stop').hidden = !crewDone() || rollsLeft === 0;
  $('stop').disabled = over || busy || cpuTurn;
  $('rolls').textContent = rollsLeft + (rollsLeft === 1 ? ' roll left' : ' rolls left');
  $('cargo').textContent = crewDone() ? String(cargo()) : '–';
  $('score-you').textContent = String(wins[0]);
  $('score-cpu').textContent = String(wins[1]);
  $('row-you').classList.toggle('turn-you', turn === 0 && !over);
  $('row-cpu').classList.toggle('turn-cpu', turn === 1 && !over);
  $('round-info').textContent = results.map((r, p) => r == null ? '' : names()[p] + ': ' + (r ? 'cargo ' + r : 'no crew')).filter(Boolean).join(' · ');
}

async function roll() {
  if (over || busy || rollsLeft === 0) return;
  if (!started) { started = true; track('game_start', { game: 'ship-captain-crew', opponent: getOpp() }); }
  busy = true;
  const idx = [0, 1, 2, 3, 4].filter((j) => !locked.includes(j));
  const vals = idx.map(d6);
  await tumble((vv) => { vv.forEach((v, k) => { dice[idx[k]] = v; }); render(); }, idx, vals);
  rollsLeft--;
  const had = locked.filter((x) => x != null).length;
  lockInOrder();
  const now = locked.filter((x) => x != null).length;
  if (now > had) play(now === 3 ? 'king' : 'place');
  busy = false;
  const who = turn === 0 && vsCpu() ? 'You' : names()[turn];
  if (crewDone()) setStatus(who + ' have ship, captain and crew! Cargo: ' + cargo(), turn ? 'cpu' : '');
  else setStatus(who + (who === 'You' ? ' need' : ' needs') + ' a ' + [6, 5, 4][now] + ' for the ' + ROLE[now].toLowerCase(), turn ? 'cpu' : '');
  render();
  if (rollsLeft === 0) { await wait(700); endTurn(); }
}

function endTurn() {
  if (results[turn] != null) return;
  results[turn] = cargo();
  render();
  if (results[1 - turn] == null) {
    turn = 1 - turn;
    resetDice();
    render();
    if (vsCpu() && turn === 1) cpuTurn();
    else setStatus(names()[turn] + ': beat ' + (results[1 - turn] ? 'cargo ' + results[1 - turn] : 'no crew'), turn ? 'cpu' : '');
    return;
  }
  // both have played: score the round
  const [a, b] = results;
  let msg;
  if (a === b) msg = 'Round tied' + (a ? ' on ' + a : '') + '. Play it again';
  else { const w = a > b ? 0 : 1; wins[w]++; msg = (w === 0 && vsCpu() ? 'You win' : names()[w] + ' wins') + ' the round, ' + Math.max(a, b) + ' to ' + Math.min(a, b); play(w === 0 ? 'found' : 'move'); }
  setStatus(msg, '');
  render();
  if (wins[0] >= WIN || wins[1] >= WIN) return finish();
  setTimeout(() => {
    starter = 1 - starter; turn = starter; results = [null, null]; resetDice(); render();
    if (vsCpu() && turn === 1) cpuTurn(); else setStatus((vsCpu() ? 'Your' : names()[turn] + '’s') + ' turn: roll', '');
  }, 1600);
}

async function cpuTurn() {
  busy = false;
  setStatus('Computer’s turn', 'cpu');
  await wait(700);
  while (!over && turn === 1 && rollsLeft > 0 && results[1] == null) {
    await roll();
    if (results[1] != null || turn !== 1) return;
    if (crewDone()) {
      const c = cargo(), need = results[0];
      const lvl = getLevel();
      let stop = lvl === 'easy' ? c >= 6 : c >= 9;
      if (lvl === 'hard' && need != null) stop = c > need || c >= 10;
      if (stop && rollsLeft > 0) { await wait(500); endTurn(); return; }
    }
    await wait(700);
  }
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
    track('game_end', { game: 'ship-captain-crew', result: res });
  } else {
    showResult('win', (a > b ? 'Player 1' : 'Player 2') + ' wins!', 'Rounds: ' + a + ' to ' + b + '.');
    play('win', 0.1);
  }
}

function resetDice() { dice = [0, 0, 0, 0, 0]; locked = [null, null, null]; rollsLeft = 3; }
function newGame() {
  wins = [0, 0]; turn = 0; starter = 0; results = [null, null]; over = false; busy = false; started = false;
  resetDice();
  $('result').hidden = true;
  setStatus((vsCpu() ? 'Your' : 'Player 1’s') + ' turn: roll', '');
  render();
}
$('roll').addEventListener('click', () => { if (!(vsCpu() && turn === 1)) roll(); });
$('stop').addEventListener('click', () => { if (!(vsCpu() && turn === 1) && !busy) endTurn(); });
$('new-game').addEventListener('click', () => { if (!(vsCpu() && turn === 1) || over) newGame(); });
$('again').addEventListener('click', newGame);
newGame();
