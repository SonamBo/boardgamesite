// First-visit welcome: three quick taps (a game, how well you know it, a daily goal), then straight into the right
// place: the start of the learning path, a jump test past the rules, or a game against a matching bot.
//   bgs-onboarded   set once finished or skipped, so it never shows again
//   bgs-goal        daily goal in activity points (a lesson is 3, a daily challenge or rated game 2, a review 1)
import { store } from './store.js';
import { track } from './firebase.js';

const GAMES = [
  { id: 'chess', name: 'Chess', blurb: 'The classic. 23 lessons from the moves to mating patterns.' },
  { id: 'checkers', name: 'Checkers', blurb: 'Quick to learn, full of clever jumps.' },
  { id: 'mancala', name: 'Mancala', blurb: 'Sow seeds, plan ahead, fill your store.' }
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
  const pick = { game: null, level: null };

  const done = (how) => {
    store.set('bgs-onboarded', pick.game || true);   // the game they picked steers the home page's first card
    box.remove();
    document.body.classList.remove('jtest-open');
    track('welcome_end', { how, game: pick.game || '', level: pick.level || '' });
  };
  const frame = (step, img, title, sub, body) => {
    box.innerHTML = '<div class="onb-inner">' +
      '<div class="onb-top"><div class="onb-dots" aria-label="Step ' + step + ' of 3">' + [1, 2, 3].map((n) => '<i class="' + (n <= step ? 'on' : '') + '"></i>').join('') + '</div>' +
      '<button type="button" class="link-btn onb-skip">' + (step === 1 ? 'Skip' : 'Back') + '</button></div>' +
      '<div class="onb-hello"><img src="/assets/img/' + img + '.webp" alt="" width="160" height="160"><div class="onb-bubble"><p class="onb-title">' + title + '</p><p class="onb-sub">' + sub + '</p></div></div>' +
      '<div class="onb-body">' + body + '</div></div>';
    box.querySelector('.onb-skip').addEventListener('click', () => (step === 1 ? done('skip') : step === 2 ? stepGame() : stepLevel()));
    const first = box.querySelector('.onb-opt');
    if (first) first.focus();
  };

  function stepGame() {
    frame(1, 'fox-wave', 'Hi! Welcome to BoardGameSite.', 'Which game would you like to get good at?',
      '<div class="onb-opts onb-games">' + GAMES.map((g) => '<button type="button" class="onb-opt card" data-v="' + g.id + '">' +
        '<img src="/assets/img/thumb/' + g.id + '.webp" alt="" width="480" height="360"><b>' + g.name + '</b><span>' + g.blurb + '</span></button>').join('') +
      '</div><button type="button" class="link-btn onb-browse">I just want to look around</button>');
    box.querySelectorAll('.onb-opt').forEach((b) => b.addEventListener('click', () => { pick.game = b.dataset.v; stepLevel(); }));
    box.querySelector('.onb-browse').addEventListener('click', () => done('browse'));
  }
  function stepLevel() {
    const g = GAMES.find((x) => x.id === pick.game);
    frame(2, 'fox-point', g.name + ', great choice!', 'How well do you know it?',
      '<div class="onb-opts onb-list">' + LEVELS.map((l) => '<button type="button" class="onb-opt card" data-v="' + l.id + '">' +
        '<img src="/assets/img/' + l.img + '.webp" alt="" width="64" height="64"><span><b>' + l.name + '</b><small>' + l.sub + '</small></span></button>').join('') + '</div>');
    box.querySelectorAll('.onb-opt').forEach((b) => b.addEventListener('click', () => { pick.level = b.dataset.v; stepGoal(); }));
  }
  function stepGoal() {
    const cur = store.get('bgs-goal', 9);
    frame(3, 'fox-flame', 'Last thing: a daily goal.', 'A little every day is how streaks are made. You can change it any time.',
      '<div class="onb-opts onb-list">' + GOALS.map((x) => '<button type="button" class="onb-opt card' + (x.id === cur ? ' sel' : '') + '" data-v="' + x.id + '">' +
        '<span><b>' + x.name + '</b><small>' + x.sub + '</small></span></button>').join('') + '</div>');
    box.querySelectorAll('.onb-opt').forEach((b) => b.addEventListener('click', () => {
      store.set('bgs-goal', Number(b.dataset.v));
      done('finish');
      const g = pick.game;
      location.href = pick.level === 'play' ? '/play/' + g + '?bot=mira' : '/learn/' + g + '/path' + (pick.level === 'rules' ? '?jump=strategy' : '');
    }));
  }
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') done('skip'); });
  stepGame();
}
