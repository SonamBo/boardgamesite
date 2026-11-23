# Board game origins map

"Where the world's board games were born": 20 classic games pinned where and when they first show up,
as a numbered poster (2400×1640 PNG, for Reddit) and a vertical Short (1080×1920) that travels from
game to game in date order.

    node tools/origins-video/make.mjs --out dist/origins     # poster + video
    node tools/origins-video/make.mjs --stills 3,9,30        # check frames

- `events.json`: game, place, date, map position, one-line fact. Dates are the earliest sure
  evidence from each game's Wikipedia article (the Royal Game of Ur's from the British Museum's
  dating): Senet c. 2620 BC (Hesy-Re), Go's first mention in the Zuo Zhuan, the Gedera mancala boards
  (2nd–3rd c. AD), the Kōfuku-ji shogi pieces (c. 1058), Akbar's pachisi boards, and so on.
- Map: `../map-video/shapes.json` (Natural Earth, Equal Earth projection).
- On the poster, pins that would overlap are nudged apart with a short line back to the real spot
  (`NUDGE` in `origins.html`).
