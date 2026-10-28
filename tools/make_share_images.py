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


def sudoku():
    g = "53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79"
    cells = []
    for i, ch in enumerate(g):
        r, c = divmod(i, 9)
        cls = []
        if c in (2, 5):
            cls.append("er")
        if r in (2, 5):
            cls.append("eb")
        if i in (2, 12, 30):
            cls.append("mine")
        val = ch if ch != "." else ("4" if i == 2 else "7" if i == 12 else "9" if i == 30 else "")
        if i == 40:
            cls.append("sel")
        cells.append(f'<b class="{" ".join(cls)}">{val}</b>')
    return f'<div class="sdk">{"".join(cells)}</div>'


def mines():
    rows = [
        "11100....",
        "1F21111..",
        "12F22F1..",
        "0123F21..",
        "001F21...",
        "00111....",
    ]
    cells = []
    for row in rows:
        for ch in row:
            if ch == ".":
                cells.append("<b></b>")
            elif ch == "F":
                cells.append('<b class="fl"><svg viewBox="0 0 24 24"><path d="M7 21V4"/><path d="M7 4h10l-2.5 4L17 12H7" fill="#CFAA62"/></svg></b>')
            elif ch == "0":
                cells.append('<b class="o"></b>')
            else:
                cells.append(f'<b class="o n{ch}">{ch}</b>')
    return f'<div class="mn">{"".join(cells)}</div>'


def slide_merge():
    vals = [2, 0, 4, 2, 0, 8, 16, 4, 4, 32, 128, 8, 2, 256, 1024, 2048]
    cells = "".join(f'<b class="v{v}">{v or ""}</b>' for v in vals)
    return f'<div class="mg">{cells}</div>'


def sliding_tiles():
    order = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0, 12, 13, 14, 11, 15]
    return '<div class="st">' + "".join(f'<b class="{"gap" if v == 0 else ""}">{v or ""}</b>' for v in order) + "</div>"


def picture_logic():
    pic = [
        "0011100",
        "0111110",
        "1111111",
        "1101011",
        "1111111",
        "0101010",
        "0100010",
    ]
    cells = "".join(f'<b class="{"on" if v == "1" else ""}"></b>' for row in pic for v in row)
    return f'<div class="pl">{cells}</div>'


def tile_match():
    icons = ['<circle cx="12" cy="12" r="7"/>', '<path d="M12 2.5l2.8 6 6.5.7-4.9 4.4 1.4 6.4L12 16.8 6.2 20l1.4-6.4-4.9-4.4 6.5-.7z"/>',
             '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>', '<path d="M12 20.5s-7.6-4.6-9.2-9C1.6 8 3.6 4.5 7 4.5c2.1 0 3.6 1.2 5 3 1.4-1.8 2.9-3 5-3 3.4 0 5.4 3.5 4.2 7-1.6 4.4-9.2 9-9.2 9z"/>',
             '<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>', '<path d="M12 3c3.5 5 6.5 8.4 6.5 12A6.5 6.5 0 0 1 5.5 15C5.5 11.4 8.5 8 12 3z"/>']
    inks = ["#8A2443", "#8C6A24", "#2E5F5A"]
    tiles = []
    spots = [(0, 0, 0), (1, 0, 0), (2, 0, 0), (3, 0, 0), (0, 1, 0), (1, 1, 0), (2, 1, 0), (3, 1, 0), (0, 2, 0), (1, 2, 0), (2, 2, 0), (3, 2, 0),
             (0.5, 0.5, 1), (1.5, 0.5, 1), (2.5, 0.5, 1), (0.5, 1.5, 1), (1.5, 1.5, 1), (2.5, 1.5, 1), (1, 1, 2), (2, 1, 2)]
    for k, (x, y, z) in enumerate(spots):
        ic = icons[3] if k in (18, 19) else icons[k % len(icons)]  # the selected pair matches
        ink = inks[0] if k in (18, 19) else inks[k % 3]
        sel = " sel" if k in (18, 19) else ""
        tiles.append(f'<i class="t{sel}" style="left:{x * 92 - z * 8}px;top:{y * 116 - z * 8}px;z-index:{z * 10 + k}"><svg viewBox="0 0 24 24" fill="{ink}">{ic}</svg></i>')
    return f'<div class="tm">{"".join(tiles)}</div>'


def peg_solitaire():
    holes = []
    left = {(3, 3), (2, 3), (4, 2), (3, 5)}
    for r in range(7):
        for c in range(7):
            on = r in (2, 3, 4) or c in (2, 3, 4)
            if not on:
                holes.append("<b></b>")
            elif (r, c) in left:
                holes.append('<b class="h"><i class="p"></i></b>')
            else:
                holes.append('<b class="h"><i></i></b>')
    return f'<div class="pg">{"".join(holes)}</div>'


def light_switch():
    on = {1, 5, 6, 7, 11, 13, 17, 18, 19, 23}
    return '<div class="ls">' + "".join(f'<b class="{"on" if i in on else ""}"></b>' for i in range(25)) + "</div>"


def box_pusher():
    rows = ["#######", "#  .  #", "# $$  #", "#.@ $.#", "#  *  #", "#######"]
    out = []
    for row in rows:
        for ch in row:
            cls = {"#": "w", " ": "f", ".": "f g", "$": "f b", "*": "f g b h", "@": "f p"}[ch]
            out.append(f'<b class="{cls}"></b>')
    return f'<div class="bx">{"".join(out)}</div>'


def tower_of_hanoi():
    def peg(discs):
        d = "".join(f'<i style="width:{40 + w * 14}%" class="{"m" if k % 2 else ""}"></i>' for k, w in enumerate(discs))
        return f'<div class="peg"><div class="stk">{d}</div></div>'
    return f'<div class="hn">{peg([4, 3])}{peg([1])}{peg([2])}</div>'


def _tiles(word, cls="", hi=()):
    return "".join(f'<b class="{cls}{" h" if i in hi else ""}">{ch}</b>' for i, ch in enumerate(word))


def word_guess():
    rows = [("crane", "00022"), ("stone", "20222"), ("shone", "22222")]
    out = []
    for w, m in rows:
        out.append('<div class="wgr">' + "".join(f'<b class="m{k}">{ch}</b>' for ch, k in zip(w, m)) + "</div>")
    out.append('<div class="wgr">' + "<b></b>" * 5 + "</div>")
    return f'<div class="wgb">{"".join(out)}</div>'


def letter_hive():
    letters = ["t", "r", "i", "b", "y", "l", "e"]
    pos = [(0, 0), (0, -1.04), (0.9, -0.52), (0.9, 0.52), (0, 1.04), (-0.9, 0.52), (-0.9, -0.52)]
    hexes = "".join(f'<b class="{"c" if k == 0 else ""}" style="transform:translate({x * 120}px,{y * 120}px)">{ch}</b>' for k, (ch, (x, y)) in enumerate(zip(letters, pos)))
    return f'<div class="hive">{hexes}</div>'


def word_grid():
    g = "stal" "redo" "ning" "quep"
    cells = "".join(f'<b class="{"h" if i in (4, 5, 6, 7) else ""}">{("qu" if ch == "q" else ch)}</b>' for i, ch in enumerate(g))
    return f'<div class="wgd">{cells}</div>'


def word_search():
    rows = ["zebratk", "oaplion", "mkoalae", "otterxg", "hpandaw", "sharkpi"]
    cells = "".join(f"<b>{ch}</b>" for r in rows for ch in r)
    return f'<div class="wsa"><div class="wsg">{cells}</div><i style="left:16px;top:16px;width:252px"></i><i style="left:172px;top:68px;width:200px"></i><i style="left:16px;top:172px;width:252px;background:rgba(95,163,154,.55)"></i></div>'


def letter_tiles():
    board = [
        "......",
        ".play.",
        "..u...",
        ".quiz.",
        "..c...",
        "..k...",
    ]
    vals = {"p": 3, "l": 1, "a": 1, "y": 4, "u": 2, "q": 10, "i": 1, "z": 10, "c": 3, "k": 5}
    cells = []
    for r, row in enumerate(board):
        for c, ch in enumerate(row):
            if ch == ".":
                bon = {(0, 0): "tw", (0, 5): "dl", (2, 4): "dw", (5, 0): "dl", (5, 5): "tw", (4, 4): "tl"}.get((r, c), "")
                cells.append(f'<b class="e {bon}"></b>')
            else:
                cells.append(f'<b class="t">{ch}<small>{vals[ch]}</small></b>')
    return f'<div class="ltb">{"".join(cells)}</div>'


def hangman():
    return ('<div class="hgm"><svg viewBox="0 0 200 220" width="300" height="330"><path d="M20 210h120M50 210V20h90v24" fill="none" stroke="#A57B4F" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>'
            '<g fill="none" stroke="#EFE6D8" stroke-width="6" stroke-linecap="round"><circle cx="140" cy="62" r="18"/><path d="M140 80v58M140 96l-26 22M140 96l26 22"/></g></svg>'
            '<div class="slots">' + "".join(f"<b>{ch}</b>" for ch in "ga_d_n") + "</div></div>")


def cryptogram():
    pairs = [("t", "x"), ("h", "q"), ("e", "m"), (" ", " "), ("p", "b"), ("e", "m"), ("n", "z")]
    cells = "".join('<i class="sp"></i>' if p == " " else f'<b><span>{p if k < 3 else ""}</span><small>{c}</small></b>' for k, (p, c) in enumerate(pairs))
    return f'<div class="cgm">{cells}</div>'


def word_ladder():
    rows = [("cold", -1), ("cord", 2), ("card", 1), ("ward", 0), ("warm", 3)]
    out = "".join('<div class="lr">' + "".join(f'<b class="{"h" if i == k else ""}">{ch}</b>' for i, ch in enumerate(w)) + "</div>" for w, k in rows)
    return f'<div class="lad">{out}</div>'


def unscramble():
    return ('<div class="uns"><div class="row">' + _tiles("rbiad") + '</div><div class="arrow">↓</div><div class="row ans">' + _tiles("braid") + "</div></div>")


def word_chain():
    words = [("apple", "p1"), ("eagle", "p2"), ("elephant", "p1"), ("tiger", "p2")]
    return '<div class="chn">' + "".join(f'<b class="{c}">{w[:-1]}<u>{w[-1]}</u></b>' for w, c in words) + "</div>"


# Each game's tagline (on the share image) and art.
ART = {
    "solitaire": ("Classic Klondike.", solitaire),
    "checkers": ("Jump. Crown. Win.", checkers),
    "reversi": ("Flip the board.", reversi),
    "four-in-a-row": ("Line up four.", four),
    "sudoku": ("One to nine.", sudoku),
    "mines": ("Clear the field.", mines),
    "slide-merge": ("Reach 2048.", slide_merge),
    "sliding-tiles": ("Back in order.", sliding_tiles),
    "picture-logic": ("Reveal the picture.", picture_logic),
    "tile-match": ("Match the pairs.", tile_match),
    "peg-solitaire": ("Leave just one.", peg_solitaire),
    "light-switch": ("Lights out.", light_switch),
    "box-pusher": ("Push, never pull.", box_pusher),
    "tower-of-hanoi": ("Move the tower.", tower_of_hanoi),
    "word-guess": ("Six guesses.", word_guess),
    "letter-hive": ("Seven letters.", letter_hive),
    "word-grid": ("Link the letters.", word_grid),
    "word-search": ("Find them all.", word_search),
    "letter-tiles": ("Build the board.", letter_tiles),
    "hangman": ("Guess the word.", hangman),
    "cryptogram": ("Crack the code.", cryptogram),
    "word-ladder": ("One letter at a time.", word_ladder),
    "unscramble": ("Sort the letters.", unscramble),
    "word-chain": ("Keep it going.", word_chain),
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

.sdk {{ display: grid; grid-template-columns: repeat(9, 50px); grid-template-rows: repeat(9, 50px); gap: 1px; padding: 4px; background: #45383C;
  border-radius: 12px; box-shadow: 0 0 0 4px {MERLOT}, 0 30px 60px rgba(0,0,0,.55); transform: rotate(-3deg); margin-left: 40px; }}
.sdk b {{ background: #1F191B; display: grid; place-items: center; font: 700 26px 'DM Sans'; color: #F5EFE7; }}
.sdk b.er {{ margin-right: 3px; }} .sdk b.eb {{ margin-bottom: 3px; }}
.sdk b.mine {{ font: 400 34px 'Instrument Serif'; color: #E3C37F; }}
.sdk b.sel {{ background: {MERLOT}; }}
.mn {{ display: grid; grid-template-columns: repeat(9, 54px); grid-template-rows: repeat(6, 54px); gap: 3px; padding: 8px; border-radius: 14px;
  background: #2C0A16; box-shadow: 0 0 0 6px #17110F, 0 30px 60px rgba(0,0,0,.55); transform: rotate(-3deg); margin-left: 40px; }}
.mn b {{ border-radius: 6px; background: linear-gradient(180deg, #5C1830, #4F1428); box-shadow: inset 0 -4px 0 #3D0F1F; display: grid; place-items: center; font: 700 28px 'DM Sans'; }}
.mn b.o {{ background: #1F191B; box-shadow: none; }}
.mn b svg {{ width: 70%; height: 70%; fill: none; stroke: {GOLD}; stroke-width: 2.4; stroke-linecap: round; stroke-linejoin: round; }}
.mn .n1 {{ color: #8FB8E8; }} .mn .n2 {{ color: #8FD19E; }} .mn .n3 {{ color: #FF9C8A; }}
.mg {{ display: grid; grid-template-columns: repeat(4, 96px); grid-template-rows: repeat(4, 96px); gap: 12px; padding: 12px; border-radius: 18px;
  background: #3D0F1F; box-shadow: 0 0 0 6px #17110F, 0 30px 60px rgba(0,0,0,.55); transform: rotate(-3deg); margin-left: 40px; }}
.mg b {{ border-radius: 10px; background: #2C0A16; display: grid; place-items: center; font: 700 38px 'DM Sans'; color: #3A2A2E; }}
.mg .v2 {{ background: {IVORY}; }} .mg .v4 {{ background: #E6D3B3; }} .mg .v8 {{ background: #D9A273; color: #FFF8EE; }}
.mg .v16 {{ background: #C97E5A; color: #FFF8EE; }} .mg .v32 {{ background: #B85C4F; color: #FFF8EE; }}
.mg .v128 {{ background: {GOLD}; color: #2A1D0A; font-size: 32px; }} .mg .v256 {{ background: #E6C88A; color: #2A1D0A; font-size: 32px; }}
.mg .v1024 {{ background: #9E2E50; color: #FFF4D6; font-size: 26px; }} .mg .v2048 {{ background: {MERLOT}; color: #E6C88A; font-size: 26px; box-shadow: 0 0 0 3px {GOLD}, 0 0 24px rgba(207,170,98,.5); }}
.st {{ display: grid; grid-template-columns: repeat(4, 100px); grid-template-rows: repeat(4, 100px); gap: 6px; padding: 10px; border-radius: 18px;
  background: #2C0A16; box-shadow: 0 0 0 8px #17110F, 0 30px 60px rgba(0,0,0,.55); transform: rotate(-3deg); margin-left: 40px; }}
.st b {{ border-radius: 12px; background: linear-gradient(180deg, #F7F0E4, {IVORY}); box-shadow: inset 0 -6px 0 #CDBFA8; display: grid; place-items: center;
  font: 400 52px 'Instrument Serif'; color: {MERLOT}; }}
.st b.gap {{ background: transparent; box-shadow: none; }}
.pl {{ display: grid; grid-template-columns: repeat(7, 60px); grid-template-rows: repeat(7, 60px); gap: 2px; padding: 4px; background: #C9BBA6; border-radius: 10px;
  box-shadow: 0 0 0 6px {MERLOT}, 0 30px 60px rgba(0,0,0,.55); transform: rotate(-3deg); margin-left: 40px; }}
.pl b {{ background: {IVORY}; }} .pl b.on {{ background: {GOLD}; }}
.tm {{ position: relative; width: 470px; height: 380px; margin-left: 60px; margin-top: 40px; }}
.tm .t {{ position: absolute; width: 86px; height: 110px; border-radius: 10px; background: linear-gradient(160deg, #FFFBF3, #EFE4D2);
  box-shadow: 2px 2px 0 #D6C8B0, 4px 4px 0 #C4B496, 6px 6px 0 #A8977A, 8px 10px 14px rgba(0,0,0,.5); display: grid; place-items: center; }}
.tm .t svg {{ width: 62%; height: 62%; }}
.tm .t.sel {{ background: linear-gradient(160deg, #FFF3D3, #E6C88A); box-shadow: 2px 2px 0 #D6C8B0, 4px 4px 0 #C4B496, 6px 6px 0 #A8977A, 0 0 0 4px {GOLD}, 8px 10px 14px rgba(0,0,0,.5); }}
.pg {{ display: grid; grid-template-columns: repeat(7, 56px); grid-template-rows: repeat(7, 56px); gap: 4px; padding: 40px; border-radius: 50%;
  background: radial-gradient(circle at 40% 30%, #7A2B44, #5E1530 70%); box-shadow: 0 0 0 10px #17110F, 0 30px 60px rgba(0,0,0,.55); margin-left: 40px; }}
.pg b {{ display: grid; place-items: center; }}
.pg b.h i {{ width: 22px; height: 22px; border-radius: 50%; background: #2C0A16; box-shadow: inset 0 3px 5px rgba(0,0,0,.6); }}
.pg b.h i.p {{ width: 40px; height: 40px; background: radial-gradient(circle at 35% 30%, #E6C88A, {GOLD} 55%, #97793A); box-shadow: 0 3px 0 #6E5626, 0 6px 8px rgba(0,0,0,.4); }}
.ls {{ display: grid; grid-template-columns: repeat(5, 76px); grid-template-rows: repeat(5, 76px); gap: 12px; padding: 18px; border-radius: 20px;
  background: #160F11; box-shadow: 0 0 0 6px #17110F, 0 30px 60px rgba(0,0,0,.55); transform: rotate(-3deg); margin-left: 40px; }}
.ls b {{ border-radius: 22%; background: radial-gradient(circle at 50% 40%, #3A2A2F, #241A1D 70%); box-shadow: inset 0 -4px 0 rgba(0,0,0,.4); }}
.ls b.on {{ background: radial-gradient(circle at 50% 40%, #FFF3CC, #E6C88A 35%, {GOLD} 70%); box-shadow: inset 0 -4px 0 #97793A, 0 0 26px rgba(207,170,98,.55); }}
.bx {{ display: grid; grid-template-columns: repeat(7, 62px); grid-template-rows: repeat(6, 62px); transform: rotate(-3deg); margin-left: 40px; filter: drop-shadow(0 30px 40px rgba(0,0,0,.55)); }}
.bx b {{ position: relative; }}
.bx .w {{ background: linear-gradient(180deg, #4A3A30, #2E241E); border-radius: 4px; box-shadow: inset 0 -4px 0 rgba(0,0,0,.35); }}
.bx .f {{ background: #3D0F1F; }}
.bx .g::after {{ content: ""; position: absolute; inset: 32%; border-radius: 50%; border: 3px solid {GOLD}; }}
.bx .b::before {{ content: ""; position: absolute; inset: 7%; border-radius: 12%; background: linear-gradient(160deg, #C79A6B, #95683F); box-shadow: inset 0 0 0 4px #7A5432, 0 4px 6px rgba(0,0,0,.4); z-index: 1; }}
.bx .h::before {{ background: linear-gradient(160deg, #E6C88A, {GOLD}); box-shadow: inset 0 0 0 4px #97793A, 0 0 14px rgba(207,170,98,.6); }}
.bx .p::before {{ content: ""; position: absolute; inset: 14%; border-radius: 50%; background: {IVORY}; box-shadow: 0 0 0 4px {MERLOT}; }}
.hn {{ display: grid; grid-template-columns: repeat(3, 160px); gap: 10px; height: 300px; padding: 24px 16px 0; border-radius: 20px; margin-left: 50px;
  background: radial-gradient(ellipse at 50% 20%, #5C1830, #3D0F1F 85%); box-shadow: 0 0 0 6px #17110F, 0 30px 60px rgba(0,0,0,.55); }}
.hn .peg {{ position: relative; display: flex; align-items: flex-end; justify-content: center; }}
.hn .peg::before {{ content: ""; position: absolute; bottom: 0; left: 50%; width: 12px; height: 88%; transform: translateX(-50%); border-radius: 6px 6px 0 0; background: linear-gradient(90deg, #6B4A2E, #A57B4F, #6B4A2E); }}
.hn .peg::after {{ content: ""; position: absolute; bottom: 0; left: 4%; right: 4%; height: 14px; border-radius: 6px 6px 0 0; background: linear-gradient(#A57B4F, #6B4A2E); }}
.hn .stk {{ position: relative; z-index: 1; width: 100%; display: flex; flex-direction: column-reverse; align-items: center; gap: 3px; padding-bottom: 14px; }}
.hn .stk i {{ display: block; height: 28px; border-radius: 999px; background: linear-gradient(180deg, #E6C88A, {GOLD} 60%, #97793A); }}
.hn .stk i.m {{ background: linear-gradient(180deg, #B0405F, {MERLOT} 60%, #5E1530); }}

.wgb {{ display: flex; flex-direction: column; gap: 10px; margin-left: 40px; transform: rotate(-3deg); }}
.wgr {{ display: flex; gap: 10px; }}
.wgr b {{ width: 76px; height: 76px; border-radius: 10px; border: 3px solid #45383C; display: grid; place-items: center; font: 700 40px 'DM Sans'; text-transform: uppercase; color: #F5EFE7; }}
.wgr b.m0 {{ background: #292124; border-color: #292124; color: #C6BBB3; }} .wgr b.m1 {{ background: {MERLOT}; border-color: {MERLOT}; }} .wgr b.m2 {{ background: {GOLD}; border-color: {GOLD}; color: #2A1D0A; }}
.hive {{ position: relative; width: 420px; height: 400px; margin-left: 40px; }}
.hive b {{ position: absolute; left: calc(50% - 69px); top: calc(50% - 60px); width: 138px; height: 120px; clip-path: polygon(25% 0, 75% 0, 100% 50%, 75% 100%, 25% 100%, 0 50%);
  background: linear-gradient(180deg, #F7F0E4, {IVORY}); color: {MERLOT}; display: grid; place-items: center; font: 700 50px 'DM Sans'; text-transform: uppercase; }}
.hive b.c {{ background: linear-gradient(180deg, #E6C88A, {GOLD}); color: #2A1D0A; }}
.wgd {{ display: grid; grid-template-columns: repeat(4, 96px); gap: 12px; transform: rotate(-3deg); margin-left: 40px; }}
.wgd b {{ height: 96px; border-radius: 16px; background: linear-gradient(180deg, #F7F0E4, {IVORY}); box-shadow: inset 0 -6px 0 #CDBFA8, 0 8px 14px rgba(0,0,0,.4);
  display: grid; place-items: center; font: 700 48px 'DM Sans'; color: {MERLOT}; text-transform: capitalize; }}
.wgd b.h {{ background: linear-gradient(180deg, #E6C88A, {GOLD}); color: #2A1D0A; box-shadow: inset 0 -6px 0 #97793A, 0 8px 14px rgba(0,0,0,.4); }}
.wsa {{ position: relative; margin-left: 40px; transform: rotate(-3deg); }}
.wsg {{ display: grid; grid-template-columns: repeat(7, 52px); grid-auto-rows: 52px; padding: 12px; border-radius: 14px; background: {IVORY}; box-shadow: 0 0 0 6px {MERLOT}, 0 30px 60px rgba(0,0,0,.55); }}
.wsg b {{ display: grid; place-items: center; font: 700 30px 'DM Sans'; text-transform: uppercase; color: #2A1D20; }}
.wsa i {{ position: absolute; height: 44px; border-radius: 22px; background: rgba(207,170,98,.55); }}
.ltb {{ display: grid; grid-template-columns: repeat(6, 70px); grid-auto-rows: 70px; gap: 4px; padding: 10px; border-radius: 14px; background: #2C0A16; box-shadow: 0 0 0 6px #17110F, 0 30px 60px rgba(0,0,0,.55); transform: rotate(-3deg); margin-left: 40px; }}
.ltb b {{ border-radius: 6px; position: relative; }}
.ltb .e {{ background: #4F1428; }} .ltb .dl {{ background: #4B6C8A; }} .ltb .tl {{ background: #2F4E73; }} .ltb .dw {{ background: #B0405F; }} .ltb .tw {{ background: #C8742F; }}
.ltb .t {{ background: linear-gradient(180deg, #FBF3E2, #EBDDC2); box-shadow: inset 0 -4px 0 #CDBFA8; display: grid; place-items: center; font: 700 38px 'DM Sans'; text-transform: uppercase; color: #2A1D20; }}
.ltb .t small {{ position: absolute; right: 6px; bottom: 4px; font-size: 14px; }}
.hgm {{ display: flex; flex-direction: column; align-items: center; gap: 10px; margin-left: 40px; }}
.hgm .slots {{ display: flex; gap: 10px; }}
.hgm .slots b {{ width: 52px; height: 60px; border-bottom: 5px solid {GOLD}; display: grid; place-items: center; font: 700 40px 'DM Sans'; text-transform: uppercase; color: #F5EFE7; }}
.cgm {{ display: flex; gap: 8px; padding: 34px 30px; border-radius: 16px; background: {IVORY}; box-shadow: 0 0 0 6px {MERLOT}, 0 30px 60px rgba(0,0,0,.55); transform: rotate(-3deg); margin-left: 40px; }}
.cgm b {{ width: 56px; display: flex; flex-direction: column; align-items: center; gap: 6px; }}
.cgm b span {{ width: 100%; height: 66px; border-bottom: 4px solid #8E7E6C; display: grid; place-items: center; font: 700 44px 'DM Sans'; text-transform: uppercase; color: {MERLOT}; }}
.cgm b small {{ font: 700 22px 'DM Sans'; text-transform: uppercase; color: #6E6158; }}
.cgm i.sp {{ width: 26px; }}
.lad {{ display: flex; flex-direction: column; gap: 10px; align-items: center; margin-left: 40px; }}
.lad .lr {{ display: flex; gap: 10px; }}
.lad b {{ width: 66px; height: 66px; border-radius: 10px; background: linear-gradient(180deg, #F7F0E4, {IVORY}); box-shadow: inset 0 -5px 0 #CDBFA8; display: grid; place-items: center; font: 700 36px 'DM Sans'; text-transform: uppercase; color: #3D0F1F; }}
.lad b.h {{ background: linear-gradient(180deg, #E6C88A, {GOLD}); color: #2A1D0A; box-shadow: inset 0 -5px 0 #97793A; }}
.uns {{ display: flex; flex-direction: column; align-items: center; gap: 18px; margin-left: 40px; }}
.uns .row {{ display: flex; gap: 12px; }}
.uns .row b {{ width: 80px; height: 80px; border-radius: 12px; background: linear-gradient(180deg, #F7F0E4, {IVORY}); box-shadow: inset 0 -6px 0 #CDBFA8, 0 8px 14px rgba(0,0,0,.4); display: grid; place-items: center; font: 700 44px 'DM Sans'; text-transform: uppercase; color: {MERLOT}; }}
.uns .row:first-child b:nth-child(odd) {{ transform: rotate(-7deg) translateY(6px); }} .uns .row:first-child b:nth-child(even) {{ transform: rotate(6deg); }}
.uns .ans b {{ background: linear-gradient(180deg, #E6C88A, {GOLD}); color: #2A1D0A; box-shadow: inset 0 -6px 0 #97793A, 0 8px 14px rgba(0,0,0,.4); }}
.uns .arrow {{ font-size: 46px; color: {GOLD}; }}
.chn {{ display: flex; flex-direction: column; gap: 14px; width: 440px; margin-left: 40px; }}
.chn b {{ padding: 14px 24px; border-radius: 22px; font: 700 36px 'DM Sans'; text-transform: uppercase; letter-spacing: .04em; }}
.chn b.p1 {{ align-self: flex-start; background: {GOLD}; color: #2A1D0A; border-bottom-left-radius: 6px; }}
.chn b.p2 {{ align-self: flex-end; background: {IVORY}; color: #3D0F1F; border-bottom-right-radius: 6px; }}
.chn u {{ text-underline-offset: 6px; }}
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
    missing = [s for s in GAMES if s not in ART and (not only or s in only)]
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
