# BoardGameSite

Source for [boardgamesite.com](https://boardgamesite.com): free board games in the browser, hosted on Firebase (project `boardgamesite-80e80`).

Every push to `main` builds the pages and deploys the site and the database rules automatically (see `.github/workflows/deploy.yml`).

## What's where

| Path | What it is |
|---|---|
| `src/layout.html` | The shared frame for every page: head tags, menu, footer |
| `src/pages/*.html` | One file per page (settings lines at the top, then the content) |
| `build.py` | Combines layout + pages into `public/` (`python3 build.py`) |
| `public/` | The website that gets deployed. Images, CSS and JS live in `public/assets/` |
| `public/assets/js/*-engine.js` | Game rules and computer players (Four in a Row, Checkers, Reversi, Solitaire), no page code |
| `public/assets/js/four-in-a-row.js`, `checkers.js`, `reversi.js`, `solitaire.js` | Each game's page |
| `public/assets/js/game-ui.js` | Shared game page pieces: status line, result panel, difficulty switch, win/loss record |
| `public/assets/js/site.js` | Menu, cookie banner, sign-up dialog, newsletter and contact forms |
| `public/assets/js/firebase-config.js` | Firebase web app settings (fill in once, see below) |
| `firestore.rules` | Database rules: visitors can only add newsletter signups and contact messages |

To change a page, edit its file in `src/pages/` (or `src/layout.html` for the menu/footer), run `python3 build.py`, and push.

## One-time setup

Steps 1–3 are done (October 2026); they're kept here for reference.

1. **Register the web app.** Firebase console → Settings → Project settings → General → *Your apps* → Web (`</>`). Name it `website`, then copy the `firebaseConfig` values into `public/assets/js/firebase-config.js`. These values are public by design.
2. **Create the database.** Firebase console → Databases & Storage → Firestore → Create database → Standard edition → location `asia-south1 (Mumbai)` → *Production mode*.
3. **Deploy key.** Deploys run as a dedicated service account with only the access it needs.
   1. Google Cloud → IAM & Admin → Service Accounts (project `boardgamesite-80e80`): `github-deployer` with the roles **Firebase Hosting Admin**, **Firebase Rules Admin** and **Service Usage Consumer**.
   2. Its JSON key is stored as the GitHub secret `FIREBASE_SERVICE_ACCOUNT` (Settings → Secrets and variables → Actions). The key file itself should not be kept anywhere else.
   3. The organisation blocks key creation by default (`iam.disableServiceAccountKeyCreation`). To make a new key (for example to replace a leaked one), temporarily override that policy for this project, create the key, then set it back to *Inherit parent's policy*.
   4. To redeploy without a code change: GitHub → Actions → *Deploy to Firebase* → *Run workflow*.
4. **Connect the domain.** Firebase console → Hosting → *Add custom domain* → `boardgamesite.com` (and `www.boardgamesite.com`, redirecting to it). Add the records Firebase shows in GoDaddy → My Products → boardgamesite.com → DNS. HTTPS is set up automatically once the records are live.

## Reading signups and messages

Firebase console → Firestore Database → `newsletter` (email signups) and `messages` (contact form).
