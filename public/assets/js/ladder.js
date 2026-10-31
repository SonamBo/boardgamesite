// Practice-ladder (rated) games on a game page: /play/<game>?bot=<id>
// The page asks ladder(game, hooks) at start-up. Outside the ladder it returns null and the page works as usual.
// In the ladder: the computer plays at the bot's level, no take-backs or level changes, a Resign button,
// and the result updates the player's BGS Rating. Leaving a started game counts as a loss.
import { botById, BOTS, ratingOf, show, isProvisional, recordResult, markPending, clearPending, settlePending, markBeaten } from './rating.js';
import { track } from './firebase.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function ladder(game, hooks = {}) {
  const left = settlePending();   // an earlier rated game that was abandoned
  const id = new URLSearchParams(location.search).get('bot');
  const bot = id && botById(id);
  if (!bot) {
    if (left) notice('Your unfinished rated ' + left.game + ' game against ' + left.bot.name + ' counted as a loss (' + signed(left.delta) + ').');
    return null;
  }
  document.body.classList.add('ladder');
  // hide the controls a rated game doesn't allow
  document.querySelectorAll('[data-opponent], [data-level], [data-side]').forEach((b) => {
    const seg = b.closest('.seg');
    if (!seg) return;
    seg.hidden = true;
    const label = seg.previousElementSibling;
    if (label && label.classList.contains('seg-label')) label.hidden = true;
  });
  document.querySelectorAll('[data-name="p2"], #name-cpu').forEach((el) => { el.textContent = bot.name; });

  let inGame = false, done = false;
  const games = () => ratingOf(game).n;
  const L = {
    bot,
    level: bot.level,
    // chess: alternate colours between rated games
    side: games() % 2 ? 'b' : 'w',
    start() {
      if (inGame || done) return;
      inGame = true;
      markPending(game, bot);
      paint();
    },
    finish(result) {
      if (done) return null;
      done = true; inGame = false;
      const r = recordResult(game, bot, result);
      if (result === 'win') markBeaten(game, bot);
      track('rated_game', { game, bot: bot.id, result, rating: r.after });
      paint(result, r);
      return r;
    },
    newGame() {
      if (inGame && !done) L.finish('lose');   // starting over mid-game is a resignation
      inGame = false; done = false;
      L.side = games() % 2 ? 'b' : 'w';
      paint();
    }
  };

  const box = document.createElement('div');
  box.className = 'ladder-box card';
  box.setAttribute('aria-live', 'polite');
  const panel = document.querySelector('.panel');
  if (panel) panel.prepend(box);

  function paint(result, r) {
    const p = ratingOf(game);
    const idx = BOTS.indexOf(bot), next = BOTS[idx + 1];
    let html = '<img class="ladder-fox" src="/assets/img/' + (result === 'win' ? 'fox-trophy' : result ? 'fox-shrug' : 'fox-cross') + '.webp" alt="" width="280" height="280">' +
      '<p class="ladder-kicker">Rated game · Practice ladder</p>' +
      '<div class="ladder-vs"><span><b>You</b><em>' + show(p) + '</em></span><i>vs</i><span><b>' + esc(bot.name) + '</b><em>' + bot.rating + '</em></span></div>';
    if (r) {
      const word = result === 'win' ? 'You beat ' + bot.name : result === 'draw' ? 'Draw with ' + bot.name : bot.name + ' won';
      html += '<p class="ladder-result ' + (r.delta >= 0 ? 'up' : 'down') + '">' + esc(word) + '. BGS Rating ' + r.before + ' → <b>' + r.after + '</b> (' + signed(r.delta) + ')</p>';
      if (isProvisional(p)) html += '<p class="muted ladder-note">Provisional until you’ve played ' + (5 - p.n) + ' more rated game' + (5 - p.n === 1 ? '' : 's') + '.</p>';
      html += '<div class="ladder-actions">' +
        (result === 'win' && next ? '<a class="btn btn-gold" href="?bot=' + next.id + '">Next: ' + esc(next.name) + ' (' + next.rating + ')</a>' : '') +
        '<button type="button" class="btn ' + (result === 'win' && next ? 'btn-outline' : 'btn-gold') + '" data-ladder="again">Rematch</button>' +
        '<a class="btn btn-outline" href="/dashboard">Your dashboard</a></div>';
    } else {
      html += '<p class="muted ladder-note">No take-backs. Leaving a game you’ve started counts as a loss.</p>' +
        '<div class="ladder-actions">' + (inGame ? '<button type="button" class="btn btn-outline" data-ladder="resign">Resign</button>' : '') +
        '<a class="link-btn" href="/learn/' + game + '#path">Back to the path</a></div>';
    }
    box.innerHTML = html;
  }
  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ladder]');
    if (!b) return;
    if (b.dataset.ladder === 'resign' && inGame && hooks.resign) hooks.resign();
    if (b.dataset.ladder === 'again' && hooks.again) hooks.again();
  });
  paint();
  if (left) notice('Your unfinished rated game against ' + left.bot.name + ' counted as a loss (' + signed(left.delta) + ').');
  // leaving mid-game: the pending marker stays and is settled as a loss on the next visit
  window.addEventListener('pagehide', () => { if (!inGame) clearPending(); });
  return L;
}

const signed = (n) => (n >= 0 ? '+' : '−') + Math.abs(n);

function notice(text) {
  const n = document.createElement('p');
  n.className = 'ladder-notice card';
  n.textContent = text;
  const at = document.querySelector('.panel') || document.querySelector('main');
  if (at) at.prepend(n);
}
