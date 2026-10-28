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


def _die(v, cls=""):
    pips = {1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8]}[v]
    return f'<b class="dd {cls}">' + "".join(f'<i class="{"on" if k in pips else ""}"></i>' for k in range(9)) + "</b>"


def five_dice():
    return '<div class="dset">' + "".join(_die(v, "lift" if k in (0, 2, 4) else "") for k, v in enumerate([6, 6, 6, 6, 5])) + '</div>'


def backgammon():
    pts = "".join(f'<i class="tri {"a" if k % 2 else "b"} {"up" if k >= 6 else ""}" style="left:{(k % 6) * 56 + 14}px"></i>' for k in range(12))
    ck = ""
    for (x, n, top, cls) in [(14, 5, True, "g"), (182, 3, True, "w"), (14, 5, False, "w"), (294, 2, False, "g"), (238, 3, False, "g")]:
        for k in range(n):
            ck += f'<u class="{cls}" style="left:{x + 4}px;{"top" if top else "bottom"}:{10 + k * 46}px"></u>'
    return f'<div class="bgb">{pts}{ck}<div class="dpair">{_die(6)}{_die(3)}</div></div>'


def ludo():
    return ('<div class="lud"><i class="q r"></i><i class="q g"></i><i class="q y"></i><i class="q b"></i>'
            '<i class="ctr"></i><u class="t r" style="left:60px;top:60px"></u><u class="t g" style="left:300px;top:60px"></u>'
            '<u class="t y" style="left:300px;top:300px"></u><u class="t b" style="left:60px;top:300px"></u></div>')


def hot_dice():
    return '<div class="dset six">' + "".join(_die(v, "lift" if v in (1, 5) else "") for v in [1, 5, 3, 1, 6, 2]) + '</div>'


def snakes_and_ladders():
    cells = "".join(f'<b class="{"d" if (r + c) % 2 else ""}"></b>' for r in range(6) for c in range(6))
    return ('<div class="snl">' + cells + '<svg viewBox="0 0 360 360"><g stroke="#8B5E34" stroke-width="8" stroke-linecap="round"><line x1="70" y1="320" x2="160" y2="110"/><line x1="100" y1="330" x2="190" y2="120"/>'
            + "".join(f'<line x1="{70 + 90 * t + 2}" y1="{320 - 210 * t}" x2="{100 + 90 * t - 2}" y2="{330 - 210 * t}" stroke-width="6"/>' for t in [0.15, 0.3, 0.45, 0.6, 0.75, 0.9])
            + '</g><path d="M300 60 C 200 120, 330 200, 240 300" fill="none" stroke="#8A2443" stroke-width="22" stroke-linecap="round"/><path d="M300 60 C 200 120, 330 200, 240 300" fill="none" stroke="#CFAA62" stroke-width="5" stroke-dasharray="10 14" stroke-linecap="round"/>'
            '<circle cx="300" cy="60" r="18" fill="#8A2443"/><circle cx="294" cy="55" r="3.5" fill="#fff"/><circle cx="307" cy="55" r="3.5" fill="#fff"/></svg></div>')


def liars_dice():
    return ('<div class="liar"><div class="cup"></div><div class="dset">' + "".join(_die(v) for v in [5, 5, 1, 3, 5]) + '</div><p class="bidtag">Five 5s?</p></div>')


def dice_poker():
    return '<div class="dset poker">' + "".join(_die(v, "lift") for v in [4, 4, 4, 2, 2]) + '<p class="bidtag">Full house</p></div>'


def shut_the_box():
    t = "".join(f'<b class="{"shut" if n in (1, 3, 7, 9) else ""}">{"" if n in (1, 3, 7, 9) else n}</b>' for n in range(1, 10))
    return f'<div class="stb"><div class="tiles">{t}</div><div class="dpair">{_die(4)}{_die(2)}</div></div>'


def pig():
    return f'<div class="pigart">{_die(6, "big")}<p class="bidtag">+6 this turn</p></div>'


def ship_captain_crew():
    return ('<div class="dset scc">' + "".join(_die(v, "lift") for v in [6, 5, 4]) + "".join(_die(v) for v in [6, 5]) + '<p class="bidtag">Cargo 11</p></div>')


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
    "five-dice": ("Fill the scorecard.", five_dice),
    "backgammon": ("Race them home.", backgammon),
    "ludo": ("Four counters home.", ludo),
    "hot-dice": ("Push your luck.", hot_dice),
    "snakes-and-ladders": ("Up and down.", snakes_and_ladders),
    "liars-dice": ("Call the bluff.", liars_dice),
    "dice-poker": ("Best hand wins.", dice_poker),
    "shut-the-box": ("Shut all nine.", shut_the_box),
    "pig": ("Know when to stop.", pig),
    "ship-captain-crew": ("Six, five, four.", ship_captain_crew),
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

.dd {{ display: inline-grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr); width: 96px; height: 96px; padding: 14px; border-radius: 22px;
  background: radial-gradient(circle at 35% 28%, #E6C88A, {GOLD} 60%, #97793A); box-shadow: inset 0 -7px 0 rgba(0,0,0,.18), 0 12px 20px rgba(0,0,0,.45); }}
.dd i {{ width: 72%; aspect-ratio: 1; margin: auto; border-radius: 50%; }} .dd i.on {{ background: #2A1D0A; }}
.dd.lift {{ transform: translateY(-14px); box-shadow: 0 0 0 4px {IVORY}, 0 16px 24px rgba(0,0,0,.5); }}
.dd.big {{ width: 200px; height: 200px; padding: 30px; border-radius: 44px; }}
.dset {{ display: flex; gap: 16px; align-items: center; flex-wrap: wrap; justify-content: center; width: 560px; margin-left: 30px; }}
.dset.six {{ width: 400px; }}
.bidtag {{ width: 100%; text-align: center; font: 400 54px 'Instrument Serif'; color: #E6C88A; margin-top: 14px; }}
.bgb {{ position: relative; width: 352px; height: 300px; background: #3D0F1F; border: 14px solid #17110F; border-radius: 12px; margin-left: 40px; box-shadow: 0 30px 60px rgba(0,0,0,.55); }}
.bgb .tri {{ position: absolute; top: 0; width: 0; height: 0; border-left: 24px solid transparent; border-right: 24px solid transparent; border-top: 130px solid #E4D4B8; }}
.bgb .tri.b {{ border-top-color: #8E2C48; }}
.bgb .tri.up {{ top: auto; bottom: 0; border-top: 0; border-bottom: 130px solid #8E2C48; }} .bgb .tri.up.b {{ border-bottom-color: #E4D4B8; }}
.bgb u {{ position: absolute; width: 40px; height: 40px; border-radius: 50%; box-shadow: inset 0 0 0 5px rgba(0,0,0,.2), 0 3px 4px rgba(0,0,0,.5); }}
.bgb u.g {{ background: {GOLD}; }} .bgb u.w {{ background: #F4ECDE; }}
.bgb .dpair {{ position: absolute; right: -60px; top: 100px; display: flex; flex-direction: column; gap: 10px; }}
.bgb .dd {{ width: 70px; height: 70px; padding: 10px; border-radius: 16px; }}
.lud {{ position: relative; width: 400px; height: 400px; background: #F7F0E4; border-radius: 16px; box-shadow: 0 0 0 8px #17110F, 0 30px 60px rgba(0,0,0,.55); overflow: hidden; margin-left: 30px; }}
.lud .q {{ position: absolute; width: 160px; height: 160px; }}
.lud .q.r {{ left: 0; top: 0; background: #B0405F; }} .lud .q.g {{ right: 0; top: 0; background: #4E9A8F; }}
.lud .q.y {{ right: 0; bottom: 0; background: #CFAA62; }} .lud .q.b {{ left: 0; bottom: 0; background: #5B83B5; }}
.lud .ctr {{ position: absolute; left: 160px; top: 160px; width: 80px; height: 80px; background: conic-gradient(#4E9A8F 0 25%, #CFAA62 0 50%, #5B83B5 0 75%, #B0405F 0); transform: rotate(45deg) scale(.72); }}
.lud .t {{ position: absolute; width: 40px; height: 40px; border-radius: 50%; border: 6px solid #F7F0E4; box-shadow: 0 4px 6px rgba(0,0,0,.4); }}
.lud .t.r {{ background: #B0405F; }} .lud .t.g {{ background: #4E9A8F; }} .lud .t.y {{ background: #CFAA62; }} .lud .t.b {{ background: #5B83B5; }}
.snl {{ position: relative; display: grid; grid-template-columns: repeat(6, 60px); width: 360px; border-radius: 12px; overflow: hidden; box-shadow: 0 0 0 8px #17110F, 0 30px 60px rgba(0,0,0,.55); margin-left: 40px; }}
.snl b {{ height: 60px; background: #EFE6D8; }} .snl b.d {{ background: #E2D2BA; }}
.snl svg {{ position: absolute; inset: 0; width: 360px; height: 360px; }}
.liar {{ display: flex; flex-direction: column; align-items: center; gap: 10px; margin-left: 30px; }}
.liar .cup {{ width: 170px; height: 130px; background: linear-gradient(90deg, #5E3A22, #8B5E34 50%, #5E3A22); clip-path: polygon(14% 0, 86% 0, 100% 100%, 0 100%); border-radius: 8px; }}
.liar .dset {{ width: 560px; margin: 0; }}
.liar .dd {{ width: 84px; height: 84px; padding: 12px; }}
.stb {{ display: flex; flex-direction: column; align-items: center; gap: 30px; margin-left: 30px; }}
.stb .tiles {{ display: flex; gap: 8px; padding: 16px; border-radius: 12px; background: linear-gradient(#6B4A2E, #4A3220); box-shadow: 0 20px 40px rgba(0,0,0,.5); }}
.stb .tiles b {{ width: 46px; height: 86px; border-radius: 6px; background: linear-gradient(#FBF3E2, #E4D4B8); display: grid; place-items: center; font: 400 40px 'Instrument Serif'; color: {MERLOT}; box-shadow: inset 0 -5px 0 #C7B596; }}
.stb .tiles b.shut {{ background: #3A2818; box-shadow: none; height: 86px; transform: scaleY(.25) translateY(130px); }}
.stb .dpair {{ display: flex; gap: 18px; }}
.pigart {{ display: flex; flex-direction: column; align-items: center; margin-left: 30px; }}
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
