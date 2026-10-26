#!/usr/bin/env python3
"""Tells Bing (and the other IndexNow search engines: Yandex, Seznam, Naver) which pages changed in a deploy,
so they recrawl them within hours instead of waiting.

Usage:  python3 tools/indexnow.py [PREVIOUS_COMMIT]
With a previous commit, only pages whose source changed since then are sent (all pages if the layout
or build script changed). Without one, every page in the sitemap is sent.
The key below is public by design: search engines check it against public/<key>.txt.
"""
import json
import pathlib
import re
import subprocess
import sys
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
HOST = "boardgamesite.com"
KEY = "2c3ff7051c1fec5434427e84e3e38ea6"
KEY_URL = f"https://{HOST}/{KEY}.txt"


def sitemap_urls():
    return re.findall(r"<loc>([^<]+)</loc>", (ROOT / "public" / "sitemap.xml").read_text())


def page_url(src):
    head = src.read_text(encoding="utf-8")[:2000]
    path = re.search(r"<!--\s*path:\s*(\S+)\s*-->", head)
    return f"https://{HOST}" + ("/" if path.group(1) == "/" else path.group(1)) if path else None


def changed_urls(before):
    try:
        names = subprocess.run(["git", "diff", "--name-only", before, "HEAD"], cwd=ROOT,
                               capture_output=True, text=True, check=True).stdout.split()
    except subprocess.CalledProcessError:
        return sitemap_urls()
    if any(n in ("src/layout.html", "build.py") for n in names):
        return sitemap_urls()
    live = set(sitemap_urls())
    urls = [page_url(ROOT / n) for n in names if n.startswith("src/pages/") and (ROOT / n).exists()]
    return sorted(u for u in urls if u in live)


def main():
    before = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1].strip("0") else None
    urls = changed_urls(before) if before else sitemap_urls()
    if not urls:
        print("IndexNow: no page changes to report")
        return
    try:
        with urllib.request.urlopen(KEY_URL, timeout=20) as r:
            if r.read().decode().strip() != KEY:
                raise ValueError("key file content doesn't match")
    except Exception as e:  # site not live on the domain yet, or key file missing
        print(f"IndexNow: skipped, {KEY_URL} isn't reachable yet ({e})")
        return
    body = json.dumps({"host": HOST, "key": KEY, "keyLocation": KEY_URL, "urlList": urls}).encode()
    req = urllib.request.Request("https://api.indexnow.org/indexnow", data=body,
                                 headers={"Content-Type": "application/json; charset=utf-8"})
    with urllib.request.urlopen(req, timeout=30) as r:
        print(f"IndexNow: sent {len(urls)} page(s), response {r.status}")
        for u in urls:
            print("  ", u)


if __name__ == "__main__":
    main()
