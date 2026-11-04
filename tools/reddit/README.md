# Reddit community art

`assets.html` lays out the community's banner and icon with the site's own
fox, fonts and game thumbnails; `make.mjs` screenshots them at Reddit's sizes.

    node tools/reddit/make.mjs <out-dir>

| File | Size | Reddit's limit |
|---|---|---|
| banner-desktop-1920x384.png | 1920×384 | 5 MB; edges crop on narrow screens, so the name sits in the middle |
| banner-mobile-1600x480.png | 1600×480 | 5 MB; the community name sits over it, so it has no text |
| icon-256.png | 256×256 | 256 KB; shown as a circle, down to 20 px |
