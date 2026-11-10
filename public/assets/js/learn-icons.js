// Icons for the learning paths: the game switcher, path nodes and the dashboard.
import { pieceSvg } from './chess-pieces.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const LEARN_ICONS = [
  { game: 'chess', name: 'Chess', icon: 'piece:N' },
  { game: 'checkers', name: 'Checkers', icon: 'ck' },
  { game: 'russian-checkers', name: 'Russian Checkers', icon: 'ck-king' },
  { game: 'mancala', name: 'Mancala', icon: 'seeds' },
  { game: 'go', name: 'Go', icon: 'go' },
  { game: 'reversi', name: 'Reversi', icon: 'rv' },
  { game: 'four-in-a-row', name: 'Four in a Row', icon: 'c4' },
  { game: 'five-in-a-row', name: 'Five in a Row', icon: 'gm' },
  { game: 'hex', name: 'Hex', icon: 'hx' },
  { game: 'nine-mens-morris', name: 'Nine Men’s Morris', icon: 'nm' },
  { game: 'dots-and-boxes', name: 'Dots and Boxes', icon: 'db' },
  { game: 'spades', name: 'Spades', icon: '♠' },
  { game: 'hearts', name: 'Hearts', icon: '♥' },
  { game: 'gin-rummy', name: 'Gin Rummy', icon: '♣' },
  { game: 'freecell', name: 'FreeCell', icon: '♦' },
  { game: 'sudoku', name: 'Sudoku', icon: 'sdk' },
  { game: 'backgammon', name: 'Backgammon', icon: 'bgm' },
  { game: 'solitaire', name: 'Solitaire', icon: 'card' }
];

export function iconHtml(icon) {
  if (!icon) return '';
  if (icon.startsWith('piece:')) return '<span class="ni ni-piece">' + pieceSvg(icon.slice(6)) + '</span>';
  if (icon === 'ck') return '<span class="ni ni-ck"></span>';
  if (icon === 'ck-king') return '<span class="ni ni-ck"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 18h18l-1.6-10.5-4.6 4.2L12 4.5 9.2 11.7 4.6 7.5z"/></svg></span>';
  if (icon === 'go') return '<span class="ni ni-go"><i></i><i></i></span>';
  if (icon === 'db') return '<span class="ni ni-db"><i></i><i></i><i></i><i></i></span>';
  if (icon === 'nm') return '<span class="ni ni-nm"><i></i></span>';
  if (icon === 'hx') return '<span class="ni ni-hx"><i></i><i></i></span>';
  if (icon === 'gm') return '<span class="ni ni-gm"><i></i><i></i><i></i></span>';
  if (icon === 'rv') return '<span class="ni ni-rv"></span>';
  if (icon === 'c4') return '<span class="ni ni-c4"><i></i><i></i><i></i><i></i></span>';
  if (icon === 'sdk') return '<span class="ni ni-sdk"><i></i><i></i><i></i><i></i></span>';
  if (icon === 'bgm') return '<span class="ni ni-bgm"><i></i><i></i></span>';
  if (icon === 'card') return '<span class="ni ni-card">A</span>';
  if (icon === 'seeds') return '<span class="ni ni-seeds"><i></i><i></i><i></i></span>';
  return '<span class="ni ni-text' + ([...icon].length > 2 ? ' small' : '') + '">' + esc(icon) + '</span>';
}
