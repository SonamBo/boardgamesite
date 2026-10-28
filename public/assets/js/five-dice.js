// Five Dice page: roll up to three times a turn, keep the dice you want, then pick a box to score.
// Play solo for a high score, against the computer, or with a friend on one device.
import * as E from './dice5-engine.js';
import { store } from './site.js';
import { setStatus, MASCOT } from './game-ui.js';
import { track } from './firebase.js';
import { play } from './sound.js';
import { soloRecord, shake } from './solo.js';

const $ = (id) => document.getElementById(id);
const SAVE = 'bgs-dice5-game';
const MODE_KEY = 'bgs-dice5-mode';
const rec = soloRecord('bgs-dice5-stats', { onPaint: paintRecord });

let mode = ['solo', 'cpu', 'friend'].includes(store.get(MODE_KEY, 'cpu')) ? store.get(MODE_KEY, 'cpu') : 'cpu';
let cards, turn, dice, held, rollsLeft, over, busy, started;
const names = () => mode === 'friend' ? ['Player 1', 'Player 2'] : mode === 'cpu' ? ['You', 'Computer'] : ['You'];
const players = () => (mode === 'solo' ? 1 : 2);
const isCpu = () => mode === 'cpu' && turn === 1;

// ---------- Dice ----------
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const tray = $('tray');
const dieEls = [0, 1, 2, 3, 4].map((i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'die';
  b.innerHTML = '<span class="face">' + '<i></i>'.repeat(9) + '</span><small>Keep</small>';
  b.addEventListener('click', () => toggleHold(i));
  tray.appendChild(b);
  return b;
});

function paintDice(rolling = []) {
  dieEls.forEach((b, i) => {
    const v = dice[i];
    const pips = v ? PIPS[v] : [];
    b.querySelectorAll('.face i').forEach((p, k) => p.classList.toggle('on', pips.includes(k)));
    b.classList.toggle('held', !!held[i]);
    b.classList.toggle('blank', !v);
    b.classList.toggle('p2', turn === 1 && mode !== 'solo');
    b.classList.toggle('rolling', rolling.includes(i));
    b.querySelector('small').textContent = held[i] ? 'Kept' : 'Keep';
    b.disabled = !v || rollsLeft === 3 || over || busy || isCpu();
    b.setAttribute('aria-label', v ? 'Die showing ' + v + (held[i] ? ', kept' : '') : 'Die, not rolled yet');
    b.setAttribute('aria-pressed', String(!!held[i]));
  });
  const rb = $('roll');
  rb.disabled = rollsLeft === 0 || over || busy || isCpu();
  rb.querySelector('span').textContent = rollsLeft === 3 ? 'Roll' : rollsLeft ? 'Roll again' : 'Pick a box';
  $('rolls-left').textContent = rollsLeft === 3 ? '3 rolls this turn' : rollsLeft + (rollsLeft === 1 ? ' roll left' : ' rolls left');
}

function toggleHold(i) {
  if (!dice[i] || rollsLeft === 3 || over || busy || isCpu()) return;
  held[i] = !held[i];
  play('select');
  paintDice();
}

function roll() {
  if (rollsLeft === 0 || over || busy) return Promise.resolve();
  if (!started) {
    started = true;
    if (mode !== 'friend') rec.played();
    track('game_start', { game: 'five-dice', mode });
  }
  const moving = [0, 1, 2, 3, 4].filter((i) => !held[i]);
  if (!moving.length) { shake(tray, play); return Promise.resolve(); }
  busy = true;
  rollsLeft--;
  play('shuffle');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  return new Promise((done) => {
    let n = reduce ? 0 : 6;
    (function tick() {
      moving.forEach((i) => { dice[i] = 1 + Math.floor(Math.random() * 6); });
      paintDice(n > 0 ? moving : []);
      if (n-- > 0) return setTimeout(tick, 60);
      busy = false;
      play('drop');
      paintDice();
      paintCard();
      if (!isCpu()) {
        const who = mode === 'friend' ? names()[turn] + ': ' : '';
        setStatus(who + (rollsLeft ? 'Keep dice and roll again, or score' : 'Pick a box to score'), mode === 'friend' && turn ? 'cpu' : '');
      }
      save();
      done();
    })();
  });
}

// ---------- Scorecard ----------
const cardBody = $('card-body');
function buildCard() {
  const n = players();
  $('card-head').innerHTML = '<th scope="col">Box</th>' + names().map((nm, p) => '<th scope="col" class="pcol p' + p + '">' + nm + '</th>').join('');
  cardBody.textContent = '';
  const row = (label, help, cls, cells) => {
    const tr = document.createElement('tr');
    if (cls) tr.className = cls;
    tr.innerHTML = '<th scope="row">' + label + (help ? '<small>' + help + '</small>' : '') + '</th>' + cells;
    cardBody.appendChild(tr);
    return tr;
  };
  E.CATS.forEach((k, idx) => {
    let cells = '';
    for (let p = 0; p < n; p++) cells += '<td><button type="button" class="box" data-box="' + k.id + '" data-p="' + p + '"></button></td>';
    row(k.name, k.help, idx === 6 ? 'gap' : '', cells);
    if (idx === 5) {
      let b = '';
      for (let p = 0; p < n; p++) b += '<td class="sum" data-bonus="' + p + '"></td>';
      row('Bonus', '35 if the top six reach 63', 'bonus', b);
    }
  });
  let t = '';
  for (let p = 0; p < n; p++) t += '<td class="sum" data-total="' + p + '"></td>';
  row('Total', '', 'total', t);
}

function paintCard() {
  const showing = dice.every(Boolean) && rollsLeft < 3 && !over;
  cardBody.querySelectorAll('.box').forEach((b) => {
    const p = Number(b.dataset.p), id = b.dataset.box;
    const v = cards[p][id];
    const mine = p === turn && showing && !isCpu();
    b.classList.toggle('done', v != null);
    b.classList.toggle('maybe', v == null && mine);
    b.classList.toggle('zero', v == null && mine && E.scoreFor(id, dice) === 0);
    b.classList.toggle('fresh', v != null && lastScored && lastScored.p === p && lastScored.id === id);
    b.textContent = v != null ? String(v) : mine ? String(E.scoreFor(id, dice)) : '';
    b.disabled = !(v == null && mine) || busy;
    const k = E.CATS.find((x) => x.id === id);
    b.setAttribute('aria-label', k.name + ' for ' + names()[p] + ': ' + (v != null ? v + ' scored' : mine ? 'score ' + E.scoreFor(id, dice) + ' here' : 'empty'));
  });
  for (let p = 0; p < players(); p++) {
    const up = E.upperTotal(cards[p]);
    const bonusCell = cardBody.querySelector('[data-bonus="' + p + '"]');
    bonusCell.textContent = E.bonus(cards[p]) ? '35' : up + '/63';
    bonusCell.classList.toggle('got', !!E.bonus(cards[p]));
    cardBody.querySelector('[data-total="' + p + '"]').textContent = String(E.total(cards[p]));
  }
  document.querySelectorAll('.pcol').forEach((th) => th.classList.toggle('now', Number(th.className.match(/p(\d)/)[1]) === turn && !over));
  paintPlayers();
}

let lastScored = null;
function scoreBox(id) {
  if (over || busy || cards[turn][id] != null || rollsLeft === 3) return;
  const s = E.scoreFor(id, dice);
  cards[turn][id] = s;
  lastScored = { p: turn, id };
  play(s ? (s >= 25 ? 'king' : 'place') : 'flip');
  nextTurn();
}
cardBody.addEventListener('click', (e) => {
  const b = e.target.closest('.box');
  if (b && !b.disabled) scoreBox(b.dataset.box);
});

function nextTurn() {
  dice = [0, 0, 0, 0, 0]; held = [false, false, false, false, false]; rollsLeft = 3;
  if (cards.every(E.full)) return finish();
  turn = (turn + 1) % players();
  paintAll();
  save();
  if (isCpu()) cpuTurn();
}

function paintAll() {
  paintDice();
  paintCard();
  const nm = names()[turn];
  if (over) return;
  if (isCpu()) setStatus('Computer’s turn', 'cpu');
  else if (mode === 'friend') setStatus(nm + '’s turn', turn ? 'cpu' : '');
  else setStatus(rollsLeft === 3 ? 'Your turn: roll the dice' : 'Keep dice and roll, or pick a box');
}

function paintPlayers() {
  const n = players();
  $('row-you').hidden = false;
  $('row-cpu').hidden = n < 2;
  $('score-you').textContent = String(E.total(cards[0]));
  if (n > 1) $('score-cpu').textContent = String(E.total(cards[1]));
  $('row-you').classList.toggle('turn-you', turn === 0 && !over);
  $('row-cpu').classList.toggle('turn-cpu', turn === 1 && !over);
  $('name-you').textContent = names()[0];
  $('name-cpu').textContent = names()[1] || '';
  const left = E.CATS.filter((k) => cards[turn] && cards[turn][k.id] == null).length;
  $('turns-left').textContent = over ? 'Game over' : left + (left === 1 ? ' box left' : ' boxes left') + (n > 1 ? ' for ' + (turn === 0 && mode === 'cpu' ? 'you' : names()[turn]) : '');
}

// ---------- Computer ----------
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function cpuTurn() {
  setStatus('Computer’s turn', 'cpu');
  await wait(600);
  await roll();
  for (let r = 2; r >= 1 && !over; r--) {
    await wait(700);
    const mask = E.chooseHolds(dice, cards[1], r);
    if (mask === 31) break;
    held = [0, 1, 2, 3, 4].map((i) => !!(mask & (1 << i)));
    paintDice();
    play('select');
    await wait(500);
    await roll();
  }
  await wait(800);
  const { id } = E.bestBox(dice, cards[1]);
  const k = E.CATS.find((x) => x.id === id);
  setStatus('Computer scores ' + E.scoreFor(id, dice) + ' for ' + k.name, 'cpu');
  await wait(700);
  scoreBox(id);
}

// ---------- End ----------
function finish() {
  over = true;
  dice = [0, 0, 0, 0, 0];
  const t = cards.map(E.total);
  paintAll();
  let kind = 'win', text, sub = '';
  if (mode === 'solo') {
    const record = rec.score(t[0], 'solo');
    text = 'You scored ' + t[0];
    sub = record ? 'A new best score!' : (rec.best.solo ? 'Your best: ' + rec.best.solo + '.' : '');
    setStatus('Final score: ' + t[0]);
  } else if (mode === 'cpu') {
    rec.score(t[0]);
    if (t[0] > t[1]) { rec.won(); text = 'You won!'; }
    else { rec.lost(); kind = t[0] === t[1] ? 'draw' : 'lose'; text = t[0] === t[1] ? 'It’s a tie' : 'The computer won'; }
    sub = 'You ' + t[0] + ', computer ' + t[1] + '.';
    setStatus(text, kind === 'win' ? '' : 'cpu');
  } else {
    kind = t[0] === t[1] ? 'draw' : 'win';
    text = t[0] === t[1] ? 'It’s a tie' : (t[0] > t[1] ? 'Player 1' : 'Player 2') + ' wins!';
    sub = 'Player 1 ' + t[0] + ', Player 2 ' + t[1] + '.';
    setStatus(text);
  }
  $('result-img').src = MASCOT[kind];
  $('result-text').textContent = text;
  $('result-sub').textContent = sub;
  $('result').hidden = false;
  play(kind === 'lose' ? 'lose' : 'win', 0.1);
  store.set(SAVE, null);
  track('game_end', { game: 'five-dice', mode, result: kind, score: t[0] });
}

function paintRecord(stats, best) {
  const el = $('record');
  if (!el) return;
  const parts = [(stats.won || 0) + (stats.won === 1 ? ' win' : ' wins') + ' against the computer'];
  if (stats.top) parts.push('best score ' + stats.top);
  el.textContent = parts.join(' · ');
}

// ---------- New game, save and resume ----------
function newGame() {
  cards = Array.from({ length: players() }, () => ({}));
  turn = 0; dice = [0, 0, 0, 0, 0]; held = [false, false, false, false, false]; rollsLeft = 3;
  over = false; busy = false; started = false; lastScored = null;
  $('result').hidden = true;
  store.set(SAVE, null);
  buildCard();
  paintAll();
}
function save() {
  if (over || !started) return;
  store.set(SAVE, { mode, cards, turn, dice, held, rollsLeft });
}
function resume() {
  const g = store.get(SAVE, null);
  if (!g || g.mode !== mode || !Array.isArray(g.cards) || g.cards.length !== players() || !Array.isArray(g.dice)) return false;
  cards = g.cards; turn = g.turn | 0; dice = g.dice.map((v) => v | 0); held = (g.held || []).map(Boolean);
  rollsLeft = Math.max(0, Math.min(3, g.rollsLeft | 0));
  over = false; busy = false; started = true; lastScored = null;
  buildCard();
  if (isCpu()) { dice = [0, 0, 0, 0, 0]; held = [false, false, false, false, false]; rollsLeft = 3; paintAll(); cpuTurn(); }
  else { paintAll(); setStatus('Welcome back. Your game is where you left it'); }
  return true;
}

function paintMode() {
  document.querySelectorAll('[data-dmode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.dmode === mode)));
}
document.querySelectorAll('[data-dmode]').forEach((b) => b.addEventListener('click', () => {
  if (b.dataset.dmode === mode || busy || isCpu()) return;
  mode = b.dataset.dmode;
  store.set(MODE_KEY, mode);
  paintMode();
  newGame();
}));
$('roll').addEventListener('click', () => roll());
$('new-game').addEventListener('click', () => { if (!isCpu() || over) newGame(); });
$('again').addEventListener('click', newGame);
document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea')) return;
  if (e.key === 'r' || e.key === 'R') roll();
  if (/^[1-5]$/.test(e.key)) toggleHold(Number(e.key) - 1);
});

paintMode();
if (!resume()) newGame();
