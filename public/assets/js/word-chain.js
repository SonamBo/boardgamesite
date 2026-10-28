// Word Chain: take turns saying a word that starts with the last letter of the word before.
// No repeats, and you have 20 seconds a turn. Play the computer or a friend.
import { setStatus, levelSwitch, opponentSwitch, record, showResult } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { shake } from './solo.js';
import { words, isWord, shuffled } from './word-lib.js';

const $ = (id) => document.getElementById(id);
const TURN = 20;
const POOL = { easy: 2500, medium: 9000, hard: 30000 };
const score = record('chain');

let chain, turn, over, deadline, tickId, busy;
const getLevel = levelSwitch('chain', () => newGame());
const getOpp = opponentSwitch('chain', () => newGame(), { you: 'You', cpu: 'Computer', p1: 'Player 1', p2: 'Player 2' });
const vsCpu = () => getOpp() === 'cpu';
const names = () => (vsCpu() ? ['You', 'Computer'] : ['Player 1', 'Player 2']);

function need() { return chain.length ? chain[chain.length - 1].slice(-1) : ''; }

function render() {
  const box = $('wc-chain');
  box.textContent = '';
  chain.slice(-12).forEach((w, k, arr) => {
    const li = document.createElement('li');
    const who = (chain.length - arr.length + k) % 2;
    li.className = who ? 'p2' : 'p1';
    li.innerHTML = '<span>' + w.slice(0, -1) + '</span><b>' + w.slice(-1) + '</b>';
    box.appendChild(li);
  });
  box.scrollTop = box.scrollHeight;
  const n = need();
  $('wc-need').textContent = n ? n.toUpperCase() : 'any letter';
  $('wc-input').disabled = over || busy || (vsCpu() && turn === 1);
  $('wc-input').placeholder = n ? 'Starts with ' + n.toUpperCase() : 'Any word';
  $('wc-len').textContent = String(chain.length);
  document.getElementById('row-you').classList.toggle('turn-you', turn === 0 && !over);
  document.getElementById('row-cpu').classList.toggle('turn-cpu', turn === 1 && !over);
}

function startClock() {
  clearInterval(tickId);
  deadline = Date.now() + TURN * 1000;
  const bar = $('wc-timer');
  tickId = setInterval(() => {
    const left = Math.max(0, deadline - Date.now());
    bar.style.setProperty('--t', String(left / (TURN * 1000)));
    $('wc-secs').textContent = String(Math.ceil(left / 1000));
    if (left <= 0) { clearInterval(tickId); lose(turn, 'ran out of time'); }
  }, 100);
}

function accept(w, by) {
  chain.push(w);
  play(by === 0 ? 'place' : 'move');
  turn = 1 - by;
  render();
  setStatus(names()[turn] + (turn === 0 && vsCpu() ? 'r turn' : '’s turn') + ': a word starting with ' + need().toUpperCase(), turn ? 'cpu' : '');
  startClock();
  if (vsCpu() && turn === 1) cpuMove();
  else $('wc-input').focus({ preventScroll: true });
}

function submit(e) {
  e.preventDefault();
  if (over || busy || (vsCpu() && turn === 1)) return;
  const inp = $('wc-input');
  const w = inp.value.trim().toLowerCase();
  const n = need();
  const bad = (msg) => { shake(inp, play); setStatus(msg, 'neutral'); };
  if (!/^[a-z]+$/.test(w)) return bad('Letters only, please');
  if (w.length < 3) return bad('Words need 3 or more letters');
  if (n && w[0] !== n) return bad('It has to start with ' + n.toUpperCase());
  if (chain.includes(w)) return bad(w.toUpperCase() + ' has already been used');
  if (!isWord(w)) return bad(w.toUpperCase() + ' isn’t in our word list');
  inp.value = '';
  if (!chain.length) track('game_start', { game: 'word-chain', opponent: getOpp(), level: getLevel() });
  accept(w, turn);
}

// The computer thinks for a moment, then picks a word. Harder levels know more words and aim for awkward endings.
function cpuMove() {
  busy = true;
  render();
  const level = getLevel();
  const n = need();
  const pool = words().slice(0, POOL[level]).filter((w) => w[0] === n && !chain.includes(w));
  const giveUp = level === 'easy' ? 0.04 + chain.length * 0.012 : level === 'medium' ? chain.length * 0.004 : 0;
  setTimeout(() => {
    busy = false;
    if (over) return;
    if (!pool.length || Math.random() < giveUp) return lose(1, 'couldn’t think of a word');
    let pick;
    if (level === 'hard') {
      const tough = pool.filter((w) => 'xzjqky'.includes(w.slice(-1)));
      pick = shuffled(tough.length && Math.random() < 0.6 ? tough : pool)[0];
    } else pick = shuffled(pool.slice(0, 400))[0];
    accept(pick, 1);
  }, 900 + Math.random() * 1200);
}

function lose(who, why) {
  if (over) return;
  over = true;
  clearInterval(tickId);
  const winner = 1 - who;
  render();
  const len = chain.length;
  if (vsCpu()) {
    score.add(winner === 0 ? 'win' : 'lose');
    const text = winner === 0 ? 'You won!' : 'The computer won';
    setStatus((who === 0 ? 'You ' : 'The computer ') + why, who === 0 ? 'cpu' : '');
    showResult(winner === 0 ? 'win' : 'lose', text, (who === 0 ? 'You ' : 'The computer ') + why + '. The chain was ' + len + (len === 1 ? ' word' : ' words') + ' long.');
    play(winner === 0 ? 'win' : 'lose', 0.1);
  } else {
    const text = names()[winner] + ' wins!';
    setStatus(names()[who] + ' ' + why);
    showResult('win', text, names()[who] + ' ' + why + '. The chain was ' + len + (len === 1 ? ' word' : ' words') + ' long.');
    play('win', 0.1);
  }
  track('game_end', { game: 'word-chain', result: winner === 0 ? 'win' : 'lose', length: len });
}

function newGame() {
  clearInterval(tickId);
  chain = []; turn = 0; over = false; busy = false;
  $('result').hidden = true;
  $('wc-input').value = '';
  $('wc-timer').style.setProperty('--t', '1');
  $('wc-secs').textContent = String(TURN);
  setStatus((vsCpu() ? 'You start' : 'Player 1 starts') + ': type any word', 'neutral');
  render();
}

$('wc-form').addEventListener('submit', submit);
$('wc-give').addEventListener('click', () => { if (!over && !(vsCpu() && turn === 1)) lose(turn, 'gave up'); });
$('new-game').addEventListener('click', () => { play('shuffle'); newGame(); });
$('again').addEventListener('click', () => { play('shuffle'); newGame(); });
newGame();
