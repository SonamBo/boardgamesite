// Pig: roll one die as often as you like. A 1 loses everything you rolled this turn. Hold to bank it. First to 100 wins.
import { setStatus, levelSwitch, opponentSwitch, record, showResult } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { makeDie, paintDie, tumble, wait, d6 } from './dice-ui.js';

const $ = (id) => document.getElementById(id);
const GOAL = 100;
const score = record('pig');
const getLevel = levelSwitch('pig', () => newGame());
const getOpp = opponentSwitch('pig', () => newGame(), { you: 'You', cpu: 'Computer', p1: 'Player 1', p2: 'Player 2' });
const vsCpu = () => getOpp() === 'cpu';
const names = () => (vsCpu() ? ['You', 'Computer'] : ['Player 1', 'Player 2']);

const die = makeDie($('pig-die'));
let totals, turn, pot, value, over, busy, started;

function render() {
  paintDie(die, value, { p2: turn === 1 });
  $('pot').textContent = String(pot);
  const cpuTurn = vsCpu() && turn === 1;
  $('roll').disabled = over || busy || cpuTurn;
  $('hold').disabled = over || busy || cpuTurn || pot === 0;
  [0, 1].forEach((p) => {
    $('bar' + p).style.setProperty('--v', String(Math.min(100, totals[p])));
    $('num' + p).textContent = String(totals[p]);
    $('name' + p).textContent = names()[p];
  });
  $('score-you').textContent = String(totals[0]);
  $('score-cpu').textContent = String(totals[1]);
  $('row-you').classList.toggle('turn-you', turn === 0 && !over);
  $('row-cpu').classList.toggle('turn-cpu', turn === 1 && !over);
}

async function roll() {
  if (over || busy) return;
  if (!started) { started = true; track('game_start', { game: 'pig', opponent: getOpp() }); }
  busy = true;
  const v = d6();
  await tumble((vals) => { value = vals[0]; render(); }, [0], [v]);
  value = v;
  busy = false;
  if (v === 1) {
    pot = 0;
    play('error');
    setStatus((turn === 0 && vsCpu() ? 'You' : names()[turn]) + ' rolled a 1. Turn over!', turn ? 'cpu' : 'neutral');
    render();
    await wait(900);
    return switchTurn();
  }
  pot += v;
  setStatus(names()[turn] + ': ' + pot + ' this turn. Roll again or hold?', turn ? 'cpu' : '');
  render();
  if (totals[turn] + pot >= GOAL) return hold();
}

async function hold() {
  if (over || pot === 0) return;
  totals[turn] += pot;
  play('place');
  setStatus((turn === 0 && vsCpu() ? 'You' : names()[turn]) + ' banked ' + pot, turn ? 'cpu' : '');
  pot = 0;
  render();
  if (totals[turn] >= GOAL) return finish(turn);
  await wait(500);
  switchTurn();
}

function switchTurn() {
  turn = 1 - turn; pot = 0; value = 0;
  render();
  if (vsCpu() && turn === 1) cpuTurn();
  else setStatus(vsCpu() ? 'Your turn: roll' : names()[turn] + '’s turn: roll', turn ? 'cpu' : '');
}

// The computer: Easy holds early, Medium holds at about 20, Hard adjusts to the score.
async function cpuTurn() {
  setStatus('Computer’s turn', 'cpu');
  await wait(600);
  while (!over && turn === 1) {
    const lvl = getLevel();
    const me = totals[1], you = totals[0];
    let target = lvl === 'easy' ? 12 + Math.floor(Math.random() * 6) : 20;
    if (lvl === 'hard') target = you >= 71 ? 100 - me : Math.max(15, Math.min(30, 21 + Math.round((you - me) / 8)));
    if (pot > 0 && (pot >= target || me + pot >= GOAL)) { await hold(); return; }
    await roll();
    if (turn !== 1 || over) return;
    await wait(650);
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
    setStatus(res === 'win' ? 'You reached 100!' : 'The computer reached 100', res === 'win' ? '' : 'cpu');
    play(res === 'win' ? 'win' : 'lose', 0.1);
    track('game_end', { game: 'pig', result: res });
  } else {
    showResult('win', names()[p] + ' wins!', 'Player 1 ' + a + ', Player 2 ' + b + '.');
    setStatus(names()[p] + ' wins!');
    play('win', 0.1);
  }
}

function newGame() {
  totals = [0, 0]; turn = 0; pot = 0; value = 0; over = false; busy = false; started = false;
  $('result').hidden = true;
  setStatus(vsCpu() ? 'Your turn: roll the die' : 'Player 1: roll the die', '');
  render();
}
$('roll').addEventListener('click', roll);
$('hold').addEventListener('click', () => { if (!(vsCpu() && turn === 1) && !busy) hold(); });
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea, button')) return;
  if (e.key === 'r' || e.key === ' ') { e.preventDefault(); if (!(vsCpu() && turn === 1)) roll(); }
  if (e.key === 'h') { if (!(vsCpu() && turn === 1) && !busy) hold(); }
});
$('new-game').addEventListener('click', () => { if (!(vsCpu() && turn === 1) || over) newGame(); });
$('again').addEventListener('click', newGame);
newGame();
