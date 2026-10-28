# BoardGameSite

Source for [boardgamesite.com](https://boardgamesite.com): free board games in the browser, hosted on Firebase (project `boardgamesite-80e80`).

Every push to `main` builds the pages and deploys the site and the database rules automatically (see `.github/workflows/deploy.yml`).

## What's where

| Path | What it is |
|---|---|
| `src/layout.html` | The shared frame for every page: head tags, menu, footer |
| `src/pages/*.html` | One file per page (settings lines at the top, then the content). The settings are listed at the top of `build.py` |
| `src/pages/learn/*.html` | The rules and strategy guides (`/learn/checkers` and so on) |
| `build.py` | Combines layout + pages into `public/` (`python3 build.py`), writes the sitemap and structured data, and checks every page for SEO basics |
| `tools/make_share_images.py` | Draws each game's link-preview picture into `public/assets/img/og/` |
| `tools/make_word_list.py` | Builds the word lists for the word games (`words.js`, `words-5.js`) from the public-domain ENABLE list, ranked by everyday use |
| `tools/make_box_levels.py` | Makes Box Pusher levels (boxes pulled back from their targets, then checked with a solver); the levels live in `public/assets/js/box-levels.js` |
| `tools/indexnow.py` | Run after each deploy: tells Bing and other IndexNow search engines which pages changed |
| `public/assets/fonts/` | The site's two fonts, hosted here instead of Google Fonts (Latin characters only) |
| `public/` | The website that gets deployed. Images, CSS and JS live in `public/assets/` |
| `public/assets/js/*-engine.js` | Game rules and computer players (Four in a Row, Checkers, Reversi, Solitaire), no page code |
| `public/assets/js/four-in-a-row.js`, `checkers.js`, `reversi.js`, `solitaire.js` | Each game's page |
| `public/assets/js/solo.js` | Shared pieces for single-player games: clock, games played and won, best times, seeded daily puzzles |
| `public/assets/js/game-ui.js` | Shared game page pieces: status line, result panel, difficulty switch, win/loss record |
| `public/assets/js/site.js` | Menu, cookie banner, newsletter and contact forms |
| `public/assets/js/accounts.js` | Sign-up / log-in dialog (Google or email), the signed-in menu, and copying each player's record to their account |
| `public/assets/js/account-page.js` | The `/account` page: record, name change, log out, delete account |
| `public/assets/js/store.js` | Browser storage helper; tells `accounts.js` when progress changes |
| `public/assets/js/firebase-config.js` | Firebase web app settings (fill in once, see below) |
| `firestore.rules` | Database rules: visitors can only add newsletter signups and contact messages; signed-in players can read and change only their own record (`users/{id}`) |

To change a page, edit its file in `src/pages/` (or `src/layout.html` for the menu/footer), run `python3 build.py`, and push.

## SEO

- **Every build checks the basics** and stops (so nothing deploys) if a page has a missing or duplicate title or description, more or fewer than one `<h1>`, a link to a page that doesn't exist, an image with no alt text, or a missing share image. Warnings (titles over ~60 characters, very short or long descriptions) are printed but don't stop the build.
- **Structured data** (the hidden labels Google reads) is added automatically from each page's settings: the site and organisation on the home page, a free web game on each game page, an article on each guide, breadcrumbs everywhere, and FAQ data from any `<section class="faq">` (pairs of `<h3>` question and `<p>` answer).
- **The sitemap** lists every page with the date its source file last changed in git.
- **Adding a game:** add it to `GAMES` in `build.py` and `tools/make_share_images.py`, give its page `kind: game` and `game: <slug>`, write `src/pages/learn/<slug>.html`, run `python3 tools/make_share_images.py`, then `python3 build.py`.
- **Fonts** are cached by browsers for a year. If you ever replace a font file, give it a new file name and update `site.css` and `layout.html`.

## One-time setup

Steps 1–3 are done (October 2026); they're kept here for reference.

1. **Register the web app.** Firebase console → Settings → Project settings → General → *Your apps* → Web (`</>`). Name it `website`, then copy the `firebaseConfig` values into `public/assets/js/firebase-config.js`. These values are public by design.
2. **Create the database.** Firebase console → Databases & Storage → Firestore → Create database → Standard edition → location `asia-south1 (Mumbai)` → *Production mode*.
3. **Deploy key.** Deploys run as a dedicated service account with only the access it needs.
   1. Google Cloud → IAM & Admin → Service Accounts (project `boardgamesite-80e80`): `github-deployer` with the roles **Firebase Hosting Admin**, **Firebase Rules Admin** and **Service Usage Consumer**.
   2. Its JSON key is stored as the GitHub secret `FIREBASE_SERVICE_ACCOUNT` (Settings → Secrets and variables → Actions). The key file itself should not be kept anywhere else.
   3. The organisation blocks key creation by default (`iam.disableServiceAccountKeyCreation`). To make a new key (for example to replace a leaked one), temporarily override that policy for this project, create the key, then set it back to *Inherit parent's policy*.
   4. To redeploy without a code change: GitHub → Actions → *Deploy to Firebase* → *Run workflow*.
4. **Connect the domain** (done October 2026). Firebase console → Hosting → custom domains: `boardgamesite.com` and `www.boardgamesite.com`, both set to *serve traffic* (no redirect; pages carry a canonical link to `boardgamesite.com`). GoDaddy DNS: `A @ 199.36.158.100`, `TXT @ hosting-site=boardgamesite-80e80`, `CNAME www boardgamesite-80e80.web.app`. Don't set either domain to redirect to the other: browsers that saw an early www redirect would loop.

## Reading signups and messages

Firebase console → Firestore Database → `newsletter` (email signups) and `messages` (contact form).

## Accounts

- **Sign-in** is Firebase Authentication with Google and email + password (Firebase console → Authentication). Google sign-in runs through `boardgamesite.com/__/auth/handler`, which is listed in Google Cloud → Google Auth Platform → Clients → *Web client* (authorised origins and redirect URIs).
- **What's saved:** each player's record (the `SYNC_KEYS` in `accounts.js`) lives in their browser as before, and is also copied to `users/{their id}` in Firestore while they're signed in. On sign-in the two are combined (higher numbers win). Logging out removes the account's copy from that browser.
- **Adding a game with a record:** add its storage key to `SYNC_KEYS` and `MERGE` in `accounts.js`, to the list in `firestore.rules`, and a card to `account-page.js`.
- **The browser API key** is restricted to the site's four addresses (Google Cloud → APIs & Services → Credentials). Add any new domain there and in Authentication → Settings → Authorised domains.
