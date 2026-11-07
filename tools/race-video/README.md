# Popularity race video

A vertical (1080×1920) video of the board game popularity race from
`/articles/board-game-popularity-over-time`, for YouTube Shorts, Reels and Reddit.

    node tools/race-video/make.mjs --out dist/race

- Data: `public/assets/data/popularity.json` (the same file the article's chart uses).
- Layout and animation: `race.html` (`setup(data, timing)`, then `render(t)` for each frame).
- Sound: the Shorts' signature and calm bed from `tools/daily-short/synth.mjs`, with a chime
  whenever the leader changes and a fanfare on the end card.
