#!/usr/bin/env python3
"""Builds the site's HTML pages into public/ from src/layout.html + src/pages/**/*.html.

Each page file starts with a few settings lines, then its content:

    <!-- title: About | BoardGameSite -->
    <!-- description: One sentence for Google and link previews. -->
    <!-- path: /about -->               (the page's address; "/" for home)
    <!-- out: about.html -->            (file written under public/)
    <!-- nav: about -->                 (optional: which menu item is highlighted)
    <!-- script: /assets/js/x.js -->    (optional: extra module script)
    <!-- sitemap: no -->                (optional: leave out of sitemap.xml)
    <!-- robots: noindex -->            (optional: ask search engines not to list the page)
    <!-- kind: game -->                 (optional: home, game, guide or category; adds the matching structured data)
    <!-- cat: strategy -->              (category pages: which category, see CATS in games.py)
    <!-- game: checkers -->             (game and guide pages: which game, see GAMES below)
    <!-- image: /assets/img/og/x.png --> (optional: link-preview image; game pages default to their game's)
    <!-- published: 2026-10-26 -->      (guide pages: first published date)

Inside a page's content:
    {{related:checkers}}   a "More games" strip: games in the same category first, then others
    {{cats}}               the category tiles with live game counts
    {{shelves}}            the home page's game shelves, one per category
    {{gamegrid:strategy}}  every game in a category as cards (category pages)
    <section class="faq"> with <h3>question</h3><p>answer</p> pairs also becomes FAQ structured data.

The build also checks every page for SEO basics and stops with an error if something is wrong
(missing or duplicate titles, more than one <h1>, links to pages that don't exist, images without alt text).

Run:  python3 build.py
"""
import datetime
import html as htmllib
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"
OUT = ROOT / "public"
SITE = "https://boardgamesite.com"
SITE_NAME = "BoardGameSite"
NAV_ITEMS = ["play", "daily", "learn", "about"]
DEFAULT_IMAGE = "/assets/img/og.png"
YOUTUBE = "https://www.youtube.com/@Pixel-Art-Games-000"

# Every game and category lives in games.py.
sys.path.insert(0, str(ROOT))
from games import GAMES, CATS, players, in_cat  # noqa: E402

ORG = {
    "@type": "Organization",
    "@id": SITE + "/#org",
    "name": "Pixel Art Games",
    "url": SITE + "/",
    "logo": {"@type": "ImageObject", "url": SITE + "/assets/icons/icon-512.png", "width": 512, "height": 512},
    "sameAs": [YOUTUBE],
}

errors, warnings = [], []
layout = (SRC / "layout.html").read_text(encoding="utf-8")
meta_re = re.compile(r"^<!--\s*([a-z]+):\s*(.*?)\s*-->\s*$")
today = datetime.date.today().isoformat()


def last_changed(path):
    """The date a source file last changed in git (today if it has uncommitted edits or no history)."""
    rel = str(path.relative_to(ROOT))
    try:
        dirty = subprocess.run(["git", "status", "--porcelain", "--", rel], cwd=ROOT, capture_output=True, text=True).stdout.strip()
        if dirty:
            return today
        out = subprocess.run(["git", "log", "-1", "--format=%cs", "--", rel], cwd=ROOT, capture_output=True, text=True).stdout.strip()
        return out or today
    except OSError:
        return today


def plain(fragment):
    """HTML fragment to plain text."""
    text = re.sub(r"<[^>]+>", "", fragment)
    return re.sub(r"\s+", " ", htmllib.unescape(text)).strip()


def url_for(path):
    return SITE + ("/" if path == "/" else path)


def crumbs_for(meta):
    path = meta["path"]
    if path == "/" or "noindex" in meta.get("robots", ""):
        return []
    items = [("Home", "/")]
    if path.startswith("/learn/"):
        items.append(("Learn", "/learn"))
    if path.startswith("/play/") and meta.get("game"):
        c = GAMES[meta["game"]]["cat"]
        items.append((CATS[c]["name"] + " games", "/games/" + c))
    name = GAMES[meta["game"]]["name"] if meta.get("game") else plain(meta["h1"])
    if path.startswith("/learn/") and meta.get("game"):
        name = "How to play " + name
    items.append((name, path))
    return items


def has_guide(slug):
    return (SRC / "pages" / "learn" / f"{slug}.html").exists()


def related_html(skip):
    g0 = GAMES[skip]
    same = [(s, g) for s, g in GAMES.items() if s != skip and g["cat"] == g0["cat"]]
    other = [(s, g) for s, g in GAMES.items() if s != skip and g["cat"] != g0["cat"]]
    picks = (same + other)[:6]
    cards = []
    for slug, g in picks:
        cards.append(
            f'    <a class="related-card card" href="/play/{slug}">\n'
            f'      <b>{g["name"]}</b>\n'
            f'      <span>{g["blurb"]}</span>\n'
            f'    </a>'
        )
    cat = g0["cat"]
    more = f'  <a class="link-green" href="/games/{cat}">All {CATS[cat]["name"].lower()} games</a>\n'
    return (
        '<section class="related" aria-labelledby="related-h">\n'
        '  <h2 id="related-h">More games to play</h2>\n'
        '  <div class="related-grid">\n' + "\n".join(cards) + "\n  </div>\n" + more + "</section>"
    )


def game_card(slug, g, lazy=True):
    chips = "".join(f'<span class="chip">{c}</span>' for c in g["chips"])
    learn = f'\n        <a class="learn-link" href="/learn/{slug}">How to play {g["name"]}</a>' if has_guide(slug) else ""
    loading = ' loading="lazy"' if lazy else ""
    return f"""    <article class="game-card card">
      <a class="game-art" href="/play/{slug}" tabindex="-1" aria-hidden="true"><img src="/assets/img/thumb/{slug}.webp" alt="" width="480" height="360"{loading}></a>
      <div class="game-body">
        <h3>{g["name"]}</h3>
        <p>{g["card"]}</p>
        <div class="chips">{chips}</div>
        <a class="btn btn-green btn-block" href="/play/{slug}" aria-label="Play {g["name"]}">Play</a>{learn}
      </div>
    </article>"""


def count_label(n):
    return f"{n} game" if n == 1 else f"{n} games"


def cats_html():
    tiles = []
    for key, c in CATS.items():
        n = len(in_cat(key))
        label = f'<small class="live">{count_label(n)}</small>' if n else "<small>Coming soon</small>"
        tiles.append(
            f'    <a class="cat card" href="/games/{key}"><img src="/assets/img/{c["icon"]}" alt="" width="96" height="96">'
            f'<span><b>{c["name"]}</b>{label}</span></a>'
        )
    return '<div class="cats">\n' + "\n".join(tiles) + "\n  </div>"


def shelves_html():
    out = []
    first = True
    for key, c in CATS.items():
        if key == "multiplayer":
            continue
        games = in_cat(key)
        if not games:
            continue
        cards = "\n".join(game_card(s, g, lazy=not first) for s, g in games[:4])
        first = False
        more = f'<a class="link-green" href="/games/{key}">See all {count_label(len(games))}</a>' if len(games) > 4 else ""
        out.append(
            f'<div class="shelf" aria-labelledby="shelf-{key}">\n'
            f'  <div class="shelf-head"><h3 id="shelf-{key}">{c["name"]}</h3>{more}</div>\n'
            f'  <div class="games">\n{cards}\n  </div>\n</div>'
        )
    return "\n".join(out)


def gamegrid_html(cat):
    if cat not in CATS:
        sys.exit(f"unknown category '{cat}'")
    games = in_cat(cat)
    if not games:
        return '<p class="text-2">The first games in this category are on their way.</p>'
    return '<div class="games">\n' + "\n".join(game_card(s, g) for s, g in games) + "\n</div>"


def structured_data(meta, body, image, modified):
    page_url = url_for(meta["path"])
    graph = []
    kind = meta.get("kind")
    if kind == "home":
        graph.append(ORG)
        graph.append({
            "@type": "WebSite",
            "@id": SITE + "/#website",
            "name": SITE_NAME,
            "alternateName": "Board Game Site",
            "url": SITE + "/",
            "description": meta["description"],
            "inLanguage": "en",
            "publisher": {"@id": SITE + "/#org"},
        })
        graph.append({
            "@type": "ItemList",
            "name": "Free board games on " + SITE_NAME,
            "itemListElement": [
                {"@type": "ListItem", "position": i + 1, "url": f"{SITE}/play/{slug}", "name": g["name"]}
                for i, (slug, g) in enumerate(GAMES.items())
            ],
        })
    elif kind == "game":
        g = GAMES[meta["game"]]
        graph.append({
            "@type": ["VideoGame", "WebApplication"],
            "@id": page_url + "#game",
            "name": g["full"],
            "url": page_url,
            "description": meta["description"],
            "image": SITE + image,
            "genre": g["genre"],
            "gamePlatform": "Web browser",
            "applicationCategory": "GameApplication",
            "operatingSystem": "Any",
            "playMode": players(g),
            "inLanguage": "en",
            "isAccessibleForFree": True,
            "offers": {"@type": "Offer", "price": 0, "priceCurrency": "USD"},
            "publisher": {"@id": SITE + "/#org"},
        })
    elif kind == "category":
        graph.append({
            "@type": "ItemList",
            "name": CATS[meta["cat"]]["name"] + " games on " + SITE_NAME,
            "itemListElement": [
                {"@type": "ListItem", "position": i + 1, "url": f"{SITE}/play/{slug}", "name": g["name"]}
                for i, (slug, g) in enumerate(in_cat(meta["cat"]))
            ],
        })
    elif kind == "guide":
        graph.append({
            "@type": "Article",
            "@id": page_url + "#article",
            "headline": plain(meta["h1"]),
            "description": meta["description"],
            "image": SITE + image,
            "datePublished": meta.get("published", modified),
            "dateModified": modified,
            "inLanguage": "en",
            "author": {"@id": SITE + "/#org"},
            "publisher": {"@id": SITE + "/#org"},
            "mainEntityOfPage": page_url,
        })
    if kind in ("game", "guide"):
        graph.append(ORG)   # the publisher the game/article points at

    crumbs = crumbs_for(meta)
    if crumbs:
        graph.append({
            "@type": "BreadcrumbList",
            "itemListElement": [
                {"@type": "ListItem", "position": i + 1, "name": name, "item": url_for(p)}
                for i, (name, p) in enumerate(crumbs)
            ],
        })

    faq = re.search(r'<section class="faq"[^>]*>(.*?)</section>', body, re.S)
    if faq:
        pairs = re.findall(r"<h3[^>]*>(.*?)</h3>\s*((?:<p[^>]*>.*?</p>\s*)+)", faq.group(1), re.S)
        if pairs:
            graph.append({
                "@type": "FAQPage",
                "mainEntity": [
                    {"@type": "Question", "name": plain(q), "acceptedAnswer": {"@type": "Answer", "text": plain(a)}}
                    for q, a in pairs
                ],
            })
        else:
            errors.append(f'{meta["_file"]}: faq section has no <h3> + <p> pairs')

    if not graph:
        return ""
    data = {"@context": "https://schema.org", "@graph": graph}
    text = json.dumps(data, ensure_ascii=False, indent=1).replace("</", "<\\/")
    return f'<script type="application/ld+json">\n{text}\n</script>'


pages = []
for page in sorted((SRC / "pages").rglob("*.html")):
    lines = page.read_text(encoding="utf-8").splitlines()
    meta = {"_file": str(page.relative_to(ROOT))}
    while lines and meta_re.match(lines[0]):
        key, value = meta_re.match(lines[0]).groups()
        meta[key] = value
        lines.pop(0)
    missing = [k for k in ("title", "description", "path", "out") if k not in meta]
    if missing:
        sys.exit(f"{page.name}: missing {', '.join(missing)}")
    if meta.get("game") and meta["game"] not in GAMES:
        sys.exit(f"{page.name}: unknown game '{meta['game']}'")
    body = "\n".join(lines).strip()
    body = re.sub(r"\{\{related:([a-z0-9-]+)\}\}", lambda m: related_html(m.group(1)), body)
    body = re.sub(r"\{\{gamegrid:([a-z0-9-]+)\}\}", lambda m: gamegrid_html(m.group(1)), body)
    body = body.replace("{{cats}}", cats_html()).replace("{{shelves}}", shelves_html())
    h1s = re.findall(r"<h1[^>]*>(.*?)</h1>", body, re.S)
    meta["h1"] = h1s[0] if h1s else meta["title"]
    if len(h1s) != 1:
        errors.append(f"{meta['_file']}: has {len(h1s)} <h1> headings (should be exactly 1)")
    pages.append((page, meta, body))

titles, descriptions, sitemap, built_paths = {}, {}, [], set()
for page, meta, body in pages:
    image = meta.get("image") or (f"/assets/img/og/{meta['game']}.jpg" if meta.get("game") else DEFAULT_IMAGE)
    if not (OUT / image.lstrip("/")).exists():
        errors.append(f"{meta['_file']}: share image {image} not found (run python3 tools/make_share_images.py)")
    modified = last_changed(page)

    html = layout
    for item in NAV_ITEMS:
        html = html.replace("{{cur_%s}}" % item, 'aria-current="page"' if meta.get("nav") == item else "")
    script = meta.get("script")
    html = html.replace("{{scripts}}", f'<script type="module" src="{script}"></script>' if script else "")
    robots = meta.get("robots", "max-image-preview:large")
    if meta.get("kind") == "category" and not in_cat(meta["cat"]):
        robots = "noindex"   # nothing to list yet
    html = html.replace("{{robots}}", robots)
    html = html.replace("{{ogtype}}", "article" if meta.get("kind") == "guide" else "website")
    html = html.replace("{{image}}", SITE + image)
    html = html.replace("{{imagealt}}", htmllib.escape(plain(meta["h1"]) + " on " + SITE_NAME, quote=True))
    html = html.replace("{{jsonld}}", structured_data(meta, body, image, modified))
    html = html.replace("{{title}}", meta["title"])
    html = html.replace("{{description}}", meta["description"])
    html = html.replace("{{path}}", "" if meta["path"] == "/" else meta["path"])
    html = html.replace("{{body}}", body)
    html = re.sub(r" +>", ">", html)
    if "{{" in html:
        errors.append(f"{meta['_file']}: unfilled placeholder {re.search(r'{{[^}]*}}', html).group(0)}")

    # SEO checks
    t, d = meta["title"], meta["description"]
    if "noindex" not in robots:
        if t in titles:
            errors.append(f"{meta['_file']}: same title as {titles[t]}")
        if d in descriptions:
            errors.append(f"{meta['_file']}: same description as {descriptions[d]}")
        titles[t], descriptions[d] = meta["_file"], meta["_file"]
        if len(t) > 65:
            warnings.append(f"{meta['_file']}: title is {len(t)} characters; Google may cut it off after about 60")
        if not 40 <= len(d) <= 170:
            warnings.append(f"{meta['_file']}: description is {len(d)} characters; aim for 70–160")
    for tag in re.findall(r"<img\b[^>]*>", body):
        if not re.search(r'\salt="', tag):
            errors.append(f"{meta['_file']}: image without alt text: {tag[:80]}")

    target = OUT / meta["out"]
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(html, encoding="utf-8")
    built_paths.add(meta["path"])
    meta["_html"] = html
    if meta.get("sitemap") != "no" and "noindex" not in robots:
        sitemap.append((url_for(meta["path"]), modified, SITE + image if image != DEFAULT_IMAGE else None))
    print("built", target.relative_to(ROOT))

for slug in GAMES:
    if not (OUT / "assets" / "img" / "thumb" / f"{slug}.webp").exists():
        errors.append(f"games.py: {slug} has no thumbnail (run python3 tools/make_share_images.py)")

# Every internal link must point at a page or file that exists.
for page, meta, body in pages:
    for href in re.findall(r'href="(/[^"/][^"]*|/)"', meta["_html"]):
        path = href.split("#")[0].split("?")[0] or "/"
        if path in built_paths or (OUT / path.lstrip("/")).is_file():
            continue
        errors.append(f"{meta['_file']}: link to {href}, which doesn't exist")

(OUT / "sitemap.xml").write_text(
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n'
    + "".join(
        f"  <url><loc>{u}</loc><lastmod>{m}</lastmod>"
        + (f"<image:image><image:loc>{img}</image:loc></image:image>" if img else "")
        + "</url>\n"
        for u, m, img in sorted(sitemap, key=lambda x: (x[0] != SITE + "/", x[0]))
    )
    + "</urlset>\n",
    encoding="utf-8",
)
(OUT / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n", encoding="utf-8")
print("built public/sitemap.xml, public/robots.txt")

for w in warnings:
    print("warning:", w)
if errors:
    print("\nSEO check failed:", file=sys.stderr)
    for e in errors:
        print("  -", e, file=sys.stderr)
    sys.exit(1)
print(f"SEO check passed ({len(pages)} pages)")

# The game list for the browser (account page, syncing records). Generated: edit games.py instead.
games_js = [
    {"slug": s, "name": g["name"], "cat": g["cat"], "record": g["record"], "key": g["key"]}
    for s, g in GAMES.items()
]
(OUT / "assets" / "js" / "games-data.js").write_text(
    "// Generated by build.py from games.py. Don't edit by hand.\n"
    "export const GAMES = " + json.dumps(games_js, ensure_ascii=False, indent=1) + ";\n",
    encoding="utf-8",
)
