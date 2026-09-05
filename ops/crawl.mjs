/**
 * Crawls the built site and records the structural facts the analyser reasons over.
 * Runs against dist/ by default so a problem is caught before it is deployed;
 * pass a URL to crawl a live site instead.
 *
 *   node ops/crawl.mjs [--url https://mywebmaster.co.uk]
 */
import { readFile, readdir, writeFile, stat } from "node:fs/promises";
import { join, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
const liveUrl = process.argv.includes("--url")
  ? process.argv[process.argv.indexOf("--url") + 1]
  : null;

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

const files = await walk(DIST);
const assetPaths = new Set(files.map((f) => "/" + relative(DIST, f).replace(/\\/g, "/")));
const pages = [];

for (const f of files.filter((f) => f.endsWith(".html"))) {
  const html = await readFile(f, "utf8");
  const path = "/" + relative(DIST, f).replace(/index\.html$/, "").replace(/\\/g, "/");
  const size = (await stat(f)).size;

  pages.push({
    path,
    bytes: size,
    title: html.match(/<title>([^<]*)<\/title>/)?.[1] ?? null,
    description: html.match(/<meta name="description" content="([^"]*)"/)?.[1] ?? null,
    canonical: html.match(/<link rel="canonical" href="([^"]*)"/)?.[1] ?? null,
    noindex: /content="noindex/.test(html),
    h1Count: [...html.matchAll(/<h1[^>]*>/g)].length,
    h2s: [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => m[1].replace(/<[^>]+>/g, "").trim()).slice(0, 20),
    schemaTypes: [...html.matchAll(/"@type":"([^"]+)"/g)].map((m) => m[1]),
    internalLinks: [...new Set([...html.matchAll(/href="(\/[^"#?]*)"/g)].map((m) => m[1]))],
    imagesWithoutDimensions: [...html.matchAll(/<img\b[^>]*>/g)]
      .filter(([tag]) => !/width=/.test(tag) || !/height=/.test(tag)).length,
    wordCount: html.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length,
  });
}

/** Inbound internal links per page — the input for orphan and depth findings. */
const inboundCount = new Map(pages.map((p) => [p.path, 0]));
const brokenLinks = [];
for (const p of pages) {
  for (const href of p.internalLinks) {
    const norm = href.endsWith("/") ? href : `${href}/`;
    if (inboundCount.has(norm)) inboundCount.set(norm, inboundCount.get(norm) + 1);
    else if (!assetPaths.has(href)) brokenLinks.push({ from: p.path, to: href });
  }
}

let liveChecks = null;
if (liveUrl) {
  liveChecks = [];
  for (const p of pages.slice(0, 50)) {
    try {
      const res = await fetch(new URL(p.path, liveUrl), { redirect: "manual" });
      liveChecks.push({ path: p.path, status: res.status, location: res.headers.get("location") });
    } catch (e) {
      liveChecks.push({ path: p.path, status: 0, error: String(e).slice(0, 120) });
    }
  }
}

const totalJs = files.filter((f) => extname(f) === ".js").reduce((n, f) => n + 1, 0);

const report = {
  crawledAt: new Date().toISOString(),
  source: liveUrl ?? "dist/",
  pageCount: pages.length,
  brokenLinks,
  orphans: [...inboundCount].filter(([path, n]) => n === 0 && path !== "/").map(([path]) => path),
  jsFileCount: totalJs,
  pages: pages.map((p) => ({ ...p, inboundLinks: inboundCount.get(p.path) ?? 0 })),
  liveChecks,
};

await writeFile(new URL("./data/crawl.json", import.meta.url), JSON.stringify(report, null, 2));
console.log(
  `crawl.json: ${pages.length} pages, ${brokenLinks.length} broken links, ${report.orphans.length} orphans`,
);
