// First-visit welcome. First: play now, or learn a game?
//   Play now → pick from popular games → straight into the game (two taps, nothing else asked).
//   Learn    → a game, how well you know it, a daily goal → the path, a jump test past the rules, or a rated bot.
//   bgs-onboarded   set once finished or skipped, so it never shows again
//   bgs-goal        daily goal in activity points (a lesson is 3, a daily challenge or rated game 2, a review 1)
import { store } from './store.js';
import { track } from './firebase.js';
import { GAMES as ALL } from './games-data.js';

const GAMES = [
  { id: 'chess', name: 'Chess', blurb: 'The classic. 23 lessons from the moves to mating patterns.' },
  { id: 'checkers', name: 'Checkers', blurb: 'Quick to learn, full of clever jumps.' },
  { id: 'russian-checkers', name: 'Russian Checkers', blurb: 'Flying kings and captures in every direction.' },
  { id: 'mancala', name: 'Mancala', blurb: 'Sow seeds, plan ahead, fill your store.' },
  { id: 'go', name: 'Go', blurb: 'Simple rules, endless depth. Learn on 9×9.' },
  { id: 'reversi', name: 'Reversi', blurb: 'Flip discs to your colour and grab the corners.' },
  { id: 'four-in-a-row', name: 'Four in a Row', blurb: 'Block, then build double threats.' },
  { id: 'five-in-a-row', name: 'Five in a Row', blurb: 'Fours, open threes and the winning four-three.' },
  { id: 'hex', name: 'Hex', blurb: 'Bridges, edge templates and the swap rule.' },
  { id: 'nine-mens-morris', name: 'Nine Men’s Morris', blurb: 'Mills, running mills and the flying endgame.' },
  { id: 'dots-and-boxes', name: 'Dots and Boxes', blurb: 'Safe lines, chains and the double-cross.' },
  { id: 'spades', name: 'Spades', blurb: 'Bidding, trumps, bags and teamwork.' },
  { id: 'hearts', name: 'Hearts', blurb: 'Ducking, the queen of spades and the moon.' },
  { id: 'gin-rummy', name: 'Gin Rummy', blurb: 'Melds, deadwood, knocking and gin.' },
  { id: 'freecell', name: 'FreeCell', blurb: 'Free cells, empty columns and planning.' },
  { id: 'sudoku', name: 'Sudoku', blurb: 'From the rules to pairs and pointing pairs.' },
  { id: 'backgammon', name: 'Backgammon', blurb: 'Dice, hitting, bearing off and opening moves.' },
  { id: 'solitaire', name: 'Solitaire', blurb: 'Win more Klondike games with a few habits.' }
];
// popular games for someone who just wants to play (all have thumbnails in /assets/img/thumb/)
const PLAY = [
  { id: 'solitaire', name: 'Solitaire' }, { id: 'chess', name: 'Chess' }, { id: 'checkers', name: 'Checkers' },
  { id: 'sudoku', name: 'Sudoku' }, { id: 'word-guess', name: 'Word Guess' }, { id: 'four-in-a-row', name: 'Four in a Row' }
];
const LEVELS = [
  { id: 'new', name: 'I’m new to it', sub: 'Start from the very first move', img: 'fox-study' },
  { id: 'rules', name: 'I know the rules', sub: 'Take a short test and skip ahead', img: 'fox-think' },
  { id: 'play', name: 'I play often', sub: 'Jump into a game with a rated bot', img: 'fox-trophy' }
];
export const GOALS = [
  { id: 3, name: 'Casual', sub: 'About 1 lesson a day' },
  { id: 9, name: 'Regular', sub: 'About 3 lessons a day' },
  { id: 15, name: 'Serious', sub: 'About 5 lessons a day' }
];

export function shouldWelcome() {
  return !store.get('bgs-onboarded', false);
}

export function welcome() {
  const box = document.createElement('div');
  box.className = 'onb';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.setAttribute('aria-label', 'Welcome to BoardGameSite');
  document.body.appendChild(box);
  document.body.classList.add('jtest-open');
  track('welcome_start');
  const pick = { game: null, level: null, intent: null };

  const done = (how) => {
    store.set('bgs-onboarded', (pick.intent === 'learn' && pick.game) || true);   // the game they picked steers the home page's first card
    box.remove();
    document.body.classList.remove('jtest-open');
    track('welcome_end', { how, intent: pick.intent || '', game: pick.game || '', level: pick.level || '' });
  };
  // step: this step's number; of: steps in this route; back: where Back goes (none on the first screen = Skip)
  const frame = (step, of, back, img, title, sub, body) => {
    box.innerHTML = '<div class="onb-inner">' +
      '<div class="onb-top"><div class="onb-dots" aria-label="Step ' + step + ' of ' + of + '">' + Array.from({ length: of }, (_, k) => '<i class="' + (k < step ? 'on' : '') + '"></i>').join('') + '</div>' +
      '<button type="button" class="link-btn onb-skip">' + (back ? 'Back' : 'Skip') + '</button></div>' +
      '<div class="onb-hello"><img src="/assets/img/' + img + '.webp" alt="" width="160" height="160"><div class="onb-bubble"><p class="onb-title">' + title + '</p><p class="onb-sub">' + sub + '</p></div></div>' +
      '<div class="onb-body">' + body + '</div></div>';
    box.querySelector('.onb-skip').addEventListener('click', () => (back ? back() : done('skip')));
    const first = box.querySelector('.onb-opt');
    if (first) first.focus();
  };

  function stepIntent() {
    frame(1, 4, null, 'fox-wave', 'Hi! Welcome to BoardGameSite.', 'What would you like to do today?',
      '<div class="onb-opts onb-intent">' +
        '<button type="button" class="onb-opt card" data-v="play"><img src="/assets/img/fox-three.webp" alt="" width="120" height="120"><span><b>Play a game now</b><small>' + ALL.length + ' free games: cards, strategy, puzzles and words. No sign-up.</small></span></button>' +
        '<button type="button" class="onb-opt card" data-v="learn"><img src="/assets/img/fox-study.webp" alt="" width="120" height="120"><span><b>Learn a game</b><small>Short hands-on lessons for Chess, Go, Sudoku, Solitaire and more.</small></span></button>' +
      '</div><button type="button" class="link-btn onb-browse">I just want to look around</button>');
    box.querySelectorAll('.onb-opt').forEach((b) => b.addEventListener('click', () => { pick.intent = b.dataset.v; (pick.intent === 'play' ? stepPlay : stepGame)(); }));
    box.querySelector('.onb-browse').addEventListener('click', () => done('browse'));
  }
  function stepPlay() {
    frame(2, 2, stepIntent, 'fox-point', 'Let’s play!', 'Pick one to start. Every game is on the home page too.',
      '<div class="onb-opts onb-games onb-play">' + PLAY.map((g) => '<button type="button" class="onb-opt card" data-v="' + g.id + '">' +
        '<img src="/assets/img/thumb/' + g.id + '.webp" alt="" width="480" height="360"><b>' + g.name + '</b></button>').join('') +
      '</div><button type="button" class="btn btn-outline onb-browse onb-all">Browse all ' + ALL.length + ' games</button>');
    box.querySelectorAll('.onb-opt').forEach((b) => b.addEventListener('click', () => {
      pick.game = b.dataset.v;
      done('play');
      location.href = '/play/' + pick.game;
    }));
    box.querySelector('.onb-browse').addEventListener('click', () => {
      done('browse');
      const all = document.getElementById('games');
      if (all) all.scrollIntoView({ block: 'start' });
    });
  }

  function stepGame() {
    frame(2, 4, stepIntent, 'fox-hello', 'Great, let’s learn!', 'Which game would you like to get good at?',
      '<div class="onb-opts onb-games">' + GAMES.map((g) => '<button type="button" class="onb-opt card" data-v="' + g.id + '">' +
        '<img src="/assets/img/thumb/' + g.id + '.webp" alt="" width="480" height="360"><b>' + g.name + '</b><span>' + g.blurb + '</span></button>').join('') + '</div>');
    box.querySelectorAll('.onb-opt').forEach((b) => b.addEventListener('click', () => { pick.game = b.dataset.v; stepLevel(); }));
  }
  function stepLevel() {
    const g = GAMES.find((x) => x.id === pick.game);
    frame(3, 4, stepGame, 'fox-point', g.name + ', great choice!', 'How well do you know it?',
      '<div class="onb-opts onb-list">' + LEVELS.map((l) => '<button type="button" class="onb-opt card" data-v="' + l.id + '">' +
        '<img src="/assets/img/' + l.img + '.webp" alt="" width="64" height="64"><span><b>' + l.name + '</b><small>' + l.sub + '</small></span></button>').join('') + '</div>');
    box.querySelectorAll('.onb-opt').forEach((b) => b.addEventListener('click', () => { pick.level = b.dataset.v; stepGoal(); }));
  }
  function stepGoal() {
    const cur = store.get('bgs-goal', 9);
    frame(4, 4, stepLevel, 'fox-flame', 'Last thing: a daily goal.', 'A little every day is how streaks are made. You can change it any time.',
      '<div class="onb-opts onb-list">' + GOALS.map((x) => '<button type="button" class="onb-opt card' + (x.id === cur ? ' sel' : '') + '" data-v="' + x.id + '">' +
        '<span><b>' + x.name + '</b><small>' + x.sub + '</small></span></button>').join('') + '</div>');
    box.querySelectorAll('.onb-opt').forEach((b) => b.addEventListener('click', () => {
      store.set('bgs-goal', Number(b.dataset.v));
      done('finish');
      const g = pick.game;
      location.href = pick.level === 'play' ? '/play/' + g + (['chess', 'checkers', 'russian-checkers', 'mancala'].includes(g) ? '?bot=mira' : '') : '/learn/' + g + '/path' + (pick.level === 'rules' ? '?jump=strategy' : '');
    }));
  }
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') done('skip'); });
  stepIntent();
}
