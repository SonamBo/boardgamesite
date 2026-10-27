#!/usr/bin/env python3
"""Draws each game's pictures:
  public/assets/img/og/<game>.jpg      1200×630 link preview (WhatsApp, X, Facebook, Slack, Discord, Google Discover)
  public/assets/img/thumb/<game>.webp  480×360 card picture on the home and category pages


Re-run after adding a game (add its art function and an entry in ART below) or changing the brand colours.
Run with game names to redraw only those:  python3 tools/make_share_images.py chess mancala

Needs Playwright with Chromium:  pip install playwright && playwright install chromium
Run:  python3 tools/make_share_images.py
"""
import io
import pathlib
import sys

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from games import GAMES  # noqa: E402

PUB = ROOT / "public"
OUT = PUB / "assets" / "img" / "og"
THUMBS = PUB / "assets" / "img" / "thumb"

GOLD, IVORY, MERLOT = "#CFAA62", "#EFE6D8", "#8A2443"


def checkers():
    # A mid-game position: a few pieces each and one gold king.
    gold = {40, 42, 46, 49, 51, 53, 56, 58, 62, 35, 37}
    ivory = {1, 3, 5, 10, 12, 14, 17, 21, 24, 26}
    cells = []
    for i in range(64):
        dark = ((i >> 3) + (i & 7)) % 2 == 1
        piece = ""
        if dark and i in gold:
            piece = '<i class="pc g"></i>' if i != 35 else '<i class="pc g k"></i>'
        elif dark and i in ivory:
            piece = '<i class="pc d"></i>'
        cells.append(f'<b class="{"d" if dark else "l"}">{piece}</b>')
    return f'<div class="grid8 ck">{"".join(cells)}</div>'


def reversi():
    gold = {19, 27, 28, 29, 35, 36, 43, 20, 44, 37}
    ivory = {18, 26, 34, 42, 21, 30, 45, 52}
    cells = []
    for i in range(64):
        piece = '<i class="pc g"></i>' if i in gold else '<i class="pc d"></i>' if i in ivory else ""
        cells.append(f"<b>{piece}</b>")
    return f'<div class="grid8 rv">{"".join(cells)}</div>'


def four():
    # rows top to bottom, 7 columns; g = gold, v = ivory
    rows = [
        ".......",
        ".......",
        "...g...",
        "..gv...",
        "..vgv..",
        ".vggvg.",
    ]
    cells = "".join(
        f'<b>{"<i class=\"pc g\"></i>" if ch == "g" else "<i class=\"pc v\"></i>" if ch == "v" else ""}</b>'
        for row in rows for ch in row
    )
    return f'<div class="c4">{cells}</div>'


def solitaire():
    cards = [("A", "♠", False), ("K", "♥", True), ("Q", "♣", False), ("J", "♦", True), ("10", "♠", False)]
    out = []
    for n, (rank, suit, red) in enumerate(cards):
        rot = -16 + n * 8
        out.append(
            f'<div class="card {"red" if red else ""}" style="transform: rotate({rot}deg) translateY({abs(n - 2) * 14}px)">'
            f"<span>{rank}<br>{suit}</span><em>{suit}</em></div>"
        )
    return f'<div class="fan">{"".join(out)}</div>'


# Each game's tagline (on the share image) and art.
ART = {
    "solitaire": ("Classic Klondike.", solitaire),
    "checkers": ("Jump. Crown. Win.", checkers),
    "reversi": ("Flip the board.", reversi),
    "four-in-a-row": ("Line up four.", four),
}

CSS = f"""
@font-face {{ font-family: 'DM Sans'; src: url('{(PUB / "assets/fonts/dm-sans-latin.woff").as_uri()}'); font-weight: 400 700; }}
@font-face {{ font-family: 'Instrument Serif'; src: url('{(PUB / "assets/fonts/instrument-serif-latin.woff").as_uri()}'); }}
* {{ box-sizing: border-box; margin: 0; }}
body {{ width: 1200px; height: 630px; overflow: hidden; background: #110D0E; color: #F5EFE7; font-family: 'DM Sans', sans-serif; }}
.wrap {{ position: relative; width: 1200px; height: 630px; display: flex; }}
.left {{ width: 560px; padding: 70px 0 0 72px; display: flex; flex-direction: column; }}
.brand {{ display: flex; align-items: center; gap: 22px; }}
.brand img {{ width: 84px; height: 84px; border-radius: 18px; }}
.brand span {{ font-family: 'Instrument Serif', serif; font-size: 46px; }}
h1 {{ font-family: 'Instrument Serif', serif; font-weight: 400; font-size: 100px; line-height: 1; margin-top: 92px; letter-spacing: -0.01em; }}
h1.long {{ font-size: 84px; }}
.tag {{ font-family: 'Instrument Serif', serif; font-size: 60px; line-height: 1.05; color: {GOLD}; margin-top: 8px; }}
.sub {{ font-size: 27px; color: #C6BBB3; margin-top: 30px; }}
.url {{ font-size: 19px; letter-spacing: .06em; color: {GOLD}; position: absolute; left: 75px; bottom: 74px; }}
.right {{ position: absolute; right: 0; top: 0; width: 640px; height: 630px; display: grid; place-items: center;
  background: radial-gradient(120% 90% at 70% 40%, #5C1830 0%, #3D0F1F 45%, #1A0D11 80%, #110D0E 100%); }}
.right::before {{ content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, #110D0E 0%, rgba(17,13,14,0) 22%); }}
.grid8 {{ display: grid; grid-template-columns: repeat(8, 52px); grid-template-rows: repeat(8, 52px); padding: 14px; border-radius: 14px;
  background: #17110F; box-shadow: 0 30px 60px rgba(0,0,0,.55), 0 0 0 1px #2E2528; transform: rotate(-4deg); margin-left: 40px; }}
.grid8 b {{ display: grid; place-items: center; }}
.ck b.l {{ background: #EFE6D8; }} .ck b.d {{ background: #5E1A31; }}
.rv {{ gap: 3px; background: #2C0A16; grid-template-columns: repeat(8, 51px); grid-template-rows: repeat(8, 51px); }}
.rv b {{ background: #4F1428; border-radius: 4px; }}
.pc {{ width: 76%; height: 76%; border-radius: 50%; display: grid; place-items: center; font-style: normal; font-size: 22px; color: #2A1D0A; }}
.pc.g {{ background: radial-gradient(circle at 35% 30%, #E6C88A, {GOLD} 55%, #97793A); box-shadow: 0 3px 0 #6E5626, 0 6px 10px rgba(0,0,0,.4); }}
.pc.d {{ background: radial-gradient(circle at 35% 30%, #4C544E, #262A27 60%, #141614); box-shadow: 0 0 0 2px #4C544E inset, 0 3px 0 #0B0C0B, 0 6px 10px rgba(0,0,0,.5); }}
.pc.v {{ background: radial-gradient(circle at 35% 30%, #FFFFFF, {IVORY} 55%, #BFB3A2); box-shadow: 0 3px 0 #8C8273, 0 6px 10px rgba(0,0,0,.4); }}
.pc.k::after {{ content: ""; width: 52%; height: 52%; border-radius: 50%; border: 3px solid #6E5626; }}
.c4 {{ display: grid; grid-template-columns: repeat(7, 62px); grid-template-rows: repeat(6, 62px); gap: 8px; padding: 18px;
  background: {MERLOT}; border-radius: 22px; box-shadow: 0 30px 60px rgba(0,0,0,.55), inset 0 -6px 0 #5E1530; margin-left: 70px; }}
.c4 b {{ background: #1A0D11; border-radius: 50%; display: grid; place-items: center; box-shadow: inset 0 4px 6px rgba(0,0,0,.6); }}
.c4 .pc {{ width: 92%; height: 92%; }}
.fan {{ position: relative; width: 470px; height: 380px; margin-left: 80px; }}
.card {{ position: absolute; left: calc(50% - 95px); top: 40px; width: 190px; height: 266px; border-radius: 16px; background: #FBF8F3;
  color: #110D0E; box-shadow: 0 20px 40px rgba(0,0,0,.5); transform-origin: 50% 140%; padding: 14px 16px; }}
.card span {{ display: block; font-weight: 700; font-size: 30px; line-height: 1; text-align: center; width: 30px; }}
.card em {{ position: absolute; inset: 0; display: grid; place-items: center; font-style: normal; font-size: 110px; }}
.card.red {{ color: {MERLOT}; }}
"""


def page(name, tag, art):
    long = " long" if len(name) > 10 else ""
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body>
<div class="wrap">
  <div class="right">{art()}</div>
  <div class="left">
    <div class="brand"><img src="{(PUB / 'assets/img/logo.webp').as_uri()}" alt=""><span>BoardGameSite</span></div>
    <h1 class="{long.strip()}">{name}</h1>
    <p class="tag">{tag}</p>
    <p class="sub">Play free in your browser. No download.</p>
  </div>
  <p class="url">BOARDGAMESITE.COM</p>
</div></body></html>"""


def thumb(art):
    # The art panel on its own, 640×480, saved at 480×360.
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>{CSS}
body {{ width: 640px; height: 480px; }}
.right {{ position: static; width: 640px; height: 480px; }}
.right::before {{ display: none; }}
.right > * {{ margin-left: 0 !important; transform: scale(.74); }}
.right > .grid8 {{ transform: scale(.74) rotate(-4deg); }}
</style></head><body><div class="right">{art()}</div></body></html>"""


def main():
    only = set(sys.argv[1:])
    missing = [s for s in GAMES if s not in ART]
    if missing:
        sys.exit("No art for: " + ", ".join(missing))
    OUT.mkdir(parents=True, exist_ok=True)
    THUMBS.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch()
        tab = browser.new_page(viewport={"width": 1200, "height": 630})
        small = browser.new_page(viewport={"width": 640, "height": 480})
        for slug, (tag, art) in ART.items():
            if only and slug not in only:
                continue
            name = GAMES[slug]["name"]
            html_file = OUT / f".{slug}.html"
            html_file.write_text(page(name, tag, art), encoding="utf-8")
            tab.goto(html_file.as_uri())
            tab.evaluate("document.fonts.ready")
            tab.wait_for_timeout(150)
            tab.screenshot(path=str(OUT / f"{slug}.jpg"), type="jpeg", quality=86)
            html_file.write_text(thumb(art), encoding="utf-8")
            small.goto(html_file.as_uri())
            small.evaluate("document.fonts.ready")
            small.wait_for_timeout(100)
            img = Image.open(io.BytesIO(small.screenshot(type="png"))).convert("RGB").resize((480, 360), Image.LANCZOS)
            img.save(THUMBS / f"{slug}.webp", "WEBP", quality=82, method=6)
            html_file.unlink()
            print("drew", slug)
        browser.close()


if __name__ == "__main__":
    main()
