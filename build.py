#!/usr/bin/env python3
"""Builds the site's HTML pages into public/ from src/layout.html + src/pages/*.html.

Each page file starts with a few settings lines, then its content:

    <!-- title: About | BoardGameSite -->
    <!-- description: One sentence for Google and link previews. -->
    <!-- path: /about -->               (the page's address; "/" for home)
    <!-- out: about.html -->            (file written under public/)
    <!-- nav: about -->                 (optional: which menu item is highlighted)
    <!-- script: /assets/js/x.js -->    (optional: extra module script)
    <!-- sitemap: no -->                (optional: leave out of sitemap.xml)

Run:  python3 build.py
"""
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent
SRC = ROOT / "src"
OUT = ROOT / "public"
SITE = "https://boardgamesite.com"
NAV_ITEMS = ["play", "daily", "about"]

layout = (SRC / "layout.html").read_text(encoding="utf-8")
meta_re = re.compile(r"^<!--\s*([a-z]+):\s*(.*?)\s*-->\s*$")
sitemap = []

for page in sorted((SRC / "pages").glob("*.html")):
    lines = page.read_text(encoding="utf-8").splitlines()
    meta = {}
    while lines and meta_re.match(lines[0]):
        key, value = meta_re.match(lines[0]).groups()
        meta[key] = value
        lines.pop(0)
    missing = [k for k in ("title", "description", "path", "out") if k not in meta]
    if missing:
        sys.exit(f"{page.name}: missing {', '.join(missing)}")

    html = layout
    for item in NAV_ITEMS:
        html = html.replace("{{cur_%s}}" % item, 'aria-current="page"' if meta.get("nav") == item else "")
    script = meta.get("script")
    html = html.replace("{{scripts}}", f'<script type="module" src="{script}"></script>' if script else "")
    html = html.replace("{{title}}", meta["title"])
    html = html.replace("{{description}}", meta["description"])
    html = html.replace("{{path}}", "" if meta["path"] == "/" else meta["path"])
    html = html.replace("{{body}}", "\n".join(lines).strip())
    html = re.sub(r" +>", ">", html)

    target = OUT / meta["out"]
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(html, encoding="utf-8")
    if meta.get("sitemap") != "no":
        sitemap.append(SITE + ("/" if meta["path"] == "/" else meta["path"]))
    print("built", target.relative_to(ROOT))

(OUT / "sitemap.xml").write_text(
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + "".join(f"  <url><loc>{u}</loc></url>\n" for u in sitemap)
    + "</urlset>\n",
    encoding="utf-8",
)
(OUT / "robots.txt").write_text(f"User-agent: *\nAllow: /\n\nSitemap: {SITE}/sitemap.xml\n", encoding="utf-8")
print("built public/sitemap.xml, public/robots.txt")
