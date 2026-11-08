# Translations (Spanish, French, German, Portuguese and Russian)

Translated pages are built alongside the English ones by `build.py`.

- `src/i18n/<lang>/pages/*.html`: one page per translation, with its own title, description and
  local address (`/es/jugar/ajedrez`, `/fr/jouer/echecs`, `/de/spielen/schach`, `/pt/jogar/xadrez`). `<!-- alt: /play/chess -->` names the
  English page, which links the versions together (hreflang, the language links in the footer).
- `src/i18n/<lang>.json`:
  - `ui`: the layout's words (`{{t:...}}` in `src/layout.html`) and the game-card chips.
  - `games`: game names and card text, used for cards and structured data.
  - `runtime`: words the game scripts write on screen. `assets/js/i18n.js` swaps them in as they
    appear, so the games themselves stay in English. `common` applies everywhere; a game's own
    section (by its slug) only on that game's page. Patterns are regular expressions whose `{1}`,
    `{2}`… are the captured groups.
- Links inside a translated page point to the translation wherever one exists; everything else
  stays in English. A translated page that names a missing `ui` or `games` entry fails the build.
- To find English left on a page, open it with `?i18n-missing` and read the browser console.

Adding a game to a language: write its page, add its `games` entry, then add its `runtime`
section from the strings its script writes (play it with `?i18n-missing` to list them).

Portuguese is written for Brazil (pt_BR: Lig 4, Paciência, Gamão, Campo minado) but served as `pt`, so it also
reaches Portugal. To add a language: an entry in `LANGS` in `build.py`, `src/i18n/<lang>.json`, and its pages.

Russian (`/ru`) covers only Косынка (`/ru/igry/kosynka`) and Сапёр (`/ru/igry/saper`) so far, picked for
search demand. A language doesn't need every game: cards, related links and hreflang only use the pages it has.
