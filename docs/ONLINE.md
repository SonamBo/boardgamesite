# Online play with a friend — handoff notes

Read this file first when resuming. It is the whole plan and the current state; you do not need old chats.

## Goal
"Play a friend online" for the turn-based games, using as little Firebase as possible (Spark plan).

## Design (keep it this way)
- One Firestore doc per game: `rooms/{id}` (id: 8 chars, a–z0–9, made in the browser).
- Fields (short names on purpose): `g` game slug, `p` [uid0, uid1 or ''], `n` [name0, name1],
  `m` list of move tokens (append-only), `t` seat to move (0/1), `s` 'wait' | 'play' | 'done',
  `x` seat that resigned (optional), `r` rematch room id (optional), `c` created, `u` updated.
- Seat 0 always moves first (White in Chess, Black in Go, Gold elsewhere). The room creator is seat 0.
- Cost per game: 1 write to create, 1 to join, 1 per move, 1 to finish/resign; every write is read
  by the two open boards. A chess game ≈ 100 writes + 200 reads. No presence, no heartbeats, no polling.
- Firestore is only loaded when a player chooses online play or opens a room link.
- Players are signed in; guests use Firebase anonymous sign-in (must be ON in Firebase console →
  Authentication → Sign-in method → Anonymous). If it is off, the page asks the player to log in.
- Security rules (firestore.rules, `match /rooms/{id}`): anyone signed in can GET a room by id (the id is
  the invite), nobody can LIST rooms; create only as seat 0 with an empty move list; join only an empty
  seat 1 while waiting; only the player to move can append exactly one move; players can resign, set a
  rematch id, or delete a finished room. Moves are NOT checked for legality (needs Cloud Functions/Blaze).
- Shared code: `public/assets/js/online.js` (rooms, invite box UI, sync). Each game adds a small
  adapter: `encode(move) → token`, `apply(token)`, `reset()`, seat → side mapping.
- Local test without Firebase: add `&fake=1` to a room link; online.js then uses localStorage between
  two tabs of the same browser (see `fakeBackend` in online.js).

## Status
- [x] online.js, rooms rules, firebase.js helpers
- [x] Chess (live; tested between two tabs with &fake=1)
- [x] Five in a Row, Hex (board size stored in the room as `hex:9`), Go (end-of-game scoring is seeded so both boards agree)
- [x] Checkers (moves sent as one character per square; board turned round for seat 1), Reversi (passes handled by the page), Four in a Row (classic mode only, not the daily puzzle)
- [ ] Owner to test on two real devices (needs Anonymous sign-in ON)
- [ ] Later, needs Blaze: card and dice games with hidden hands (server-side dealing)
- After each batch: build, PR, merge, check the deploy log (`gh`-style API calls with the token in
      /home/claude/.ghtoken), ask the owner to try one game on two devices.

## How a game is wired (copy Chess: public/assets/js/chess.js, search for `onlineOn`)
1. `import { online, roomInLink } from './online.js'`; start `onlineOn = roomInLink`.
2. Local move → after applying, `ol.send(token, nextSeat, gameOver)`. Remote move → `adapter.apply(token)` replays it.
3. While online: no computer moves, no undo, no local save, flip the board for seat 1, results not counted in the record.
4. Last line: `if (roomInLink || !resume()) newGame();`

## Resume prompt (paste into a new chat)
"Continue the online-play work on github.com/SonamBo/boardgamesite. Clone it, read docs/ONLINE.md,
and do the next unchecked item. Here is a GitHub token: <token>."
