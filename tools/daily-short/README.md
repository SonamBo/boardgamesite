# Daily challenge Shorts

Three YouTube Shorts a day, one for each of the day before's daily challenges. Each Short sets the puzzle
up from scratch (what you're looking at, what counts as a win), gives the viewer five seconds, shows the
tempting wrong move where there is one, then the answer, and ends on "Three new challenges every day" and
boardgamesite.com/daily.

`.github/workflows/daily-shorts.yml` posts them at about **4:04 pm, 7:04 pm and 9:34 pm India time**.
That's after midnight everywhere in the Americas, so nobody is still playing the puzzle being solved.

| File | What it does |
|---|---|
| `shorts.mjs` | Decides each Short: which game (the site's own `daily.js` picker), the puzzle (the site's own generators and learning-path puzzles), the solution and tempting wrong move (worked out with the site's rules engines), captions and timing. |
| `short.html` | Draws any frame of a Short, for all seven daily games: Chess, Checkers, Mancala, Four in a Row, Sudoku, Word Guess, Letter Hive. |
| `render.mjs` | Films it with Chromium and ffmpeg, adds the site's own sound effects, and writes `dist/short/<date>-<slot>-<game>.mp4` and `.json` (title, description, tags). |
| `upload.mjs` | Posts one to YouTube. Skips a Short already posted. |
| `auth.mjs` | One-time: the refresh token that lets the job post. Run on your own computer. |

Try it locally:

```bash
node tools/daily-short/render.mjs --date 2026-11-01            # the 3 Shorts posted that day
node tools/daily-short/render.mjs --date 2026-11-01 --slot 2   # just the second
node tools/daily-short/render.mjs --game chess --puzzle-date 2026-10-30
```

Run the job by hand: GitHub → Actions → Daily Shorts → Run workflow. Leave "Upload" unticked to only
render; the videos are under the run's **Artifacts**.

## Turning on the upload

The BoardGameSite and Cash Paws Shorts go to the same channel (Pixel Art Games), so if Cash Paws already
uploads, **reuse its three secrets**: add `YT_CLIENT_ID`, `YT_CLIENT_SECRET` and `YT_REFRESH_TOKEN` to this
repo too (Settings → Secrets and variables → Actions → New repository secret). That's all.

Starting from nothing (about 15 minutes, all in your own Google account):

1. **Project.** console.cloud.google.com → create a project (e.g. "Pixel Art Games Shorts").
2. **API.** APIs & Services → Library → "YouTube Data API v3" → Enable.
3. **Consent screen.** APIs & Services → OAuth consent screen: External; your email for both contacts;
   add yourself as a test user; then **Publish app** ("In production"). Skip that and Google expires the
   token after 7 days. You'll see "Google hasn't verified this app" once when signing in; continue past it.
4. **Client.** Credentials → Create credentials → OAuth client ID → **Desktop app**. Copy the ID and secret.
5. **Token.** On your computer, in this repo:
   `YT_CLIENT_ID=… YT_CLIENT_SECRET=… node tools/daily-short/auth.mjs`, open the link, sign in with the
   account that owns the channel, pick the channel, allow. Copy the token it prints.
6. **Secrets.** Add the three as repository secrets (above).
7. **Test.** Actions → Daily Shorts → Run workflow with "Upload" ticked. The log ends with the links.

Optional: a repository *variable* `YT_PRIVACY` = `unlisted` to check a few before they go public.

## Notes

- **Quota.** Each upload uses about 1,600 of YouTube's 10,000 free daily API units (at the time of writing), so 3 Shorts a day (4,800) plus
  Cash Paws' one (1,600) fit with room to spare. A fourth daily Short on the same Google project would not.
- **New daily games.** A game added to `DAILY_GAMES` in `daily.js` needs a maker in `shorts.mjs` and a
  drawer in `short.html`; until then the build fails loudly for days it's picked, rather than posting
  something wrong.
- **Copied helpers.** A few small functions are copied from page scripts that only run in a browser
  (the daily word, the hive maker, the seeded random numbers). If those pages change how they pick a
  day's puzzle, change the copies in `shorts.mjs` too.
- **GitHub schedules** run only from the default branch, and can start late when GitHub is busy.
