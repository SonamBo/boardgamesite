// Our own simple chess piece drawings (viewBox 0 0 40 40).
const BASE = '<path d="M9 34h22v3H9z"/>';
export const PIECE_SVG = {
  p: '<circle cx="20" cy="12" r="5"/><path d="M15.5 17h9l2.5 13h-14z"/>' + BASE,
  r: '<path d="M11 8h4v3h3V8h4v3h3V8h4v6l-3 2v12l3 3H11l3-3V16l-3-2z"/>' + BASE,
  n: '<path d="M13 31c0-6 3-9 6-12-2 0-5 1-7 3l-2-3c3-5 6-9 6-12l2 2c5 0 11 4 12 13l1 9z"/><circle cx="19" cy="11.5" r="1.4" class="eye"/>' + BASE,
  b: '<path d="M20 5c-5 4-8 9-8 13 0 4 3 6 8 6s8-2 8-6c0-4-3-9-8-13z"/><path d="M21 9l-4 7" class="cut"/><path d="M15 25h10l2 6H13z"/><circle cx="20" cy="4.5" r="2"/>' + BASE,
  q: '<path d="M9 13l4 11 3-12 4 11 4-11 3 12 4-11-2 18H11z"/><circle cx="9" cy="12" r="2"/><circle cx="16" cy="10.5" r="2"/><circle cx="24" cy="10.5" r="2"/><circle cx="31" cy="12" r="2"/><circle cx="20" cy="9" r="2"/>' + BASE,
  k: '<path d="M18.5 3h3v4h4v3h-4v4h-3v-4h-4V7h4z"/><path d="M12 16c3-2 13-2 16 0l-2 15H14z"/>' + BASE
};
export const pieceSvg = (p) => '<svg viewBox="0 0 40 40" class="pz ' + (p === p.toUpperCase() ? 'w' : 'b') + '" aria-hidden="true">' + PIECE_SVG[p.toLowerCase()] + '</svg>';
export const PIECE_NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
