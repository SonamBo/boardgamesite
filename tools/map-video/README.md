# World map video

A vertical (1080×1920) video for Shorts, Reels and Reddit: the most-searched board game in every
country (Chess, almost everywhere), then each country's "signature" game, the one it searches far
more than the rest of the world, with a tour of Europe, the Middle East and South Asia, East Asia,
Africa and the Americas.

    python3 tools/map-video/build-data.py           # trends-raw.txt -> map-data.json
    node tools/map-video/make.mjs --out dist/map    # -> dist/map/board-game-world-map.mp4
    node tools/map-video/make.mjs --stills 7,18     # PNG frames, to check the layout

- Data: `trends-raw.txt`, from Google Trends' "compared breakdown by region" (worldwide, past 12
  months, low-volume regions included), using each game's Google topic so every language counts.
  Games went in batches of five that all include Chess, so each is measured against Chess.
- Topics that pick up other searches are left out (see `build-data.py`): Dominoes (Domino's Pizza),
  Go, Clue, Tic-tac-toe, Jenga (Swahili for "build"), and Mahjong in Indonesia and Timor-Leste
  (slot games). Checked against each topic's related queries.
- Map: `shapes.json`, Natural Earth 1:110m countries (world-atlas), Equal Earth projection.
- Layout, story and captions: `map.html` (`setup(data, shapes)`, then `render(t)` per frame).
- Sound: the Shorts' signature and calm bed from `tools/daily-short/synth.mjs`.
