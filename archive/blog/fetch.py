#!/usr/bin/env python3
"""
Archives the retired blog before its DNS is switched away.

Saves three things per post: the raw HTML exactly as served, a readable Markdown
version for reuse, and every image referenced. Run again any time; it overwrites.
"""
import html
import json
import pathlib
import re
import urllib.request
import urllib.parse

BASE = "https://blog.mywebmaster.co.uk"
ROOT = pathlib.Path(__file__).parent
UA = {"User-Agent": "Mozilla/5.0 (archive; mywebmaster.co.uk migration)"}


def get(url, binary=False):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=45) as r:
        data = r.read()
    return data if binary else data.decode("utf-8", "replace")


def sitemap_urls(name):
    xml = get(f"{BASE}/{name}")
    return re.findall(r"<loc>([^<]+)</loc>", xml)


def meta(doc, prop):
    m = re.search(rf'<meta[^>]+property="{prop}"[^>]+content="([^"]*)"', doc) or \
        re.search(rf'<meta[^>]+name="{prop}"[^>]+content="([^"]*)"', doc)
    return html.unescape(m.group(1)) if m else None


def to_markdown(doc):
    """Extracts the article body. This blog runs Ghost, which uses .gh-content."""
    body = re.search(r'<section[^>]+class="[^"]*gh-content[^"]*"[^>]*>([\s\S]*?)</section>', doc) \
        or re.search(r'<section[^>]+class="[^"]*post-content[^"]*"[^>]*>([\s\S]*?)</section>', doc) \
        or re.search(r"<article[^>]*>([\s\S]*?)</article>", doc) \
        or re.search(r"<main[^>]*>([\s\S]*?)</main>", doc)
    t = body.group(1) if body else doc

    t = re.sub(r"<(script|style|nav|footer|form)[\s\S]*?</\1>", "", t, flags=re.I)
    for level in range(1, 7):
        t = re.sub(rf"<h{level}[^>]*>([\s\S]*?)</h{level}>", lambda m, l=level: f"\n\n{'#' * l} {m.group(1)}\n\n", t, flags=re.I)
    t = re.sub(r'<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)</a>', r"[\2](\1)", t, flags=re.I)
    t = re.sub(r'<img[^>]+src="([^"]+)"[^>]*>', r"\n![](\1)\n", t, flags=re.I)
    t = re.sub(r"<li[^>]*>([\s\S]*?)</li>", r"- \1\n", t, flags=re.I)
    t = re.sub(r"</p>|<br\s*/?>", "\n\n", t, flags=re.I)
    t = re.sub(r"<(strong|b)[^>]*>([\s\S]*?)</\1>", r"**\2**", t, flags=re.I)
    t = re.sub(r"<(em|i)[^>]*>([\s\S]*?)</\1>", r"*\2*", t, flags=re.I)
    t = re.sub(r"<blockquote[^>]*>([\s\S]*?)</blockquote>", r"\n> \1\n", t, flags=re.I)
    t = re.sub(r"<[^>]+>", "", t)
    t = html.unescape(t)
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def main():
    urls = []
    for sm in ("sitemap-posts.xml", "sitemap-pages.xml"):
        try:
            urls += [(u, sm.split("-")[1].split(".")[0]) for u in sitemap_urls(sm)]
        except Exception as e:
            print(f"  ! {sm}: {e}")

    index, images = [], set()
    for url, kind in urls:
        slug = urllib.parse.urlparse(url).path.strip("/").split("/")[-1] or "index"
        try:
            doc = get(url)
        except Exception as e:
            print(f"  ! {slug}: {e}")
            continue

        (ROOT / "html" / f"{slug}.html").write_text(doc, encoding="utf-8")
        md = to_markdown(doc)
        title = meta(doc, "og:title") or (re.search(r"<title>([^<]*)</title>", doc) or [None, slug])[1]
        published = meta(doc, "article:published_time")
        description = meta(doc, "og:description") or meta(doc, "description")

        front = [
            "---",
            f'title: "{(title or slug).replace(chr(34), chr(39))}"',
            f'original_url: "{url}"',
            f'published: "{published or ""}"',
            f'description: "{(description or "").replace(chr(34), chr(39))}"',
            f'type: "{kind}"',
            "---",
            "",
        ]
        (ROOT / "markdown" / f"{slug}.md").write_text("\n".join(front) + md, encoding="utf-8")

        for src in re.findall(r'<img[^>]+src="([^"]+)"', doc):
            if src.startswith("//"):
                src = "https:" + src
            if src.startswith("http"):
                images.add(src)

        index.append({"slug": slug, "title": title, "url": url, "published": published,
                      "type": kind, "words": len(md.split())})
        print(f"  saved {slug} ({len(md.split())} words)")

    for src in sorted(images):
        name = re.sub(r"[^A-Za-z0-9._-]", "_", urllib.parse.urlparse(src).path.split("/")[-1])[:120]
        if not name:
            continue
        dest = ROOT / "images" / name
        if dest.exists():
            continue
        try:
            dest.write_bytes(get(src, binary=True))
        except Exception:
            pass

    (ROOT / "index.json").write_text(json.dumps(
        {"archivedAt": __import__("datetime").datetime.now().isoformat(),
         "source": BASE, "count": len(index), "items": index}, indent=2))
    print(f"\n{len(index)} pages archived, {len(list((ROOT/'images').glob('*')))} images")


if __name__ == "__main__":
    main()
