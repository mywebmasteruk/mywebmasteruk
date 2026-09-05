/**
 * Pre-deploy verification. Runs against dist/ after a build and fails loudly.
 * The loop runs this before every release; a red result blocks the deploy.
 *
 *   npm run build && npm run verify
 */
import { readFile, readdir, stat } from "node:fs/promises";
import { join, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
const failures = [];
const warnings = [];
const fail = (m) => failures.push(m);
const warn = (m) => warnings.push(m);

/** Page-weight budget. Breaching it should fail a build, not be noticed in a report. */
const BUDGET = { html: 60_000, totalJs: 20_000, font: 40_000 };

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
const htmlFiles = files.filter((f) => f.endsWith(".html"));
const pages = new Map();

for (const f of htmlFiles) {
  pages.set("/" + relative(DIST, f).replace(/index\.html$/, "").replace(/\\/g, "/"), await readFile(f, "utf8"));
}

console.log(`Checking ${pages.size} pages…\n`);

// ---- 1. Every page has the metadata search engines need -------------------
for (const [path, html] of pages) {
  const title = html.match(/<title>([^<]*)<\/title>/)?.[1];
  const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1];
  const canonical = html.match(/<link rel="canonical" href="([^"]*)"/)?.[1];
  const h1s = [...html.matchAll(/<h1[^>]*>/g)].length;

  if (!title) fail(`${path} — missing <title>`);
  else if (title.length > 65) warn(`${path} — title ${title.length} chars (over 65)`);
  if (!desc) fail(`${path} — missing meta description`);
  else if (desc.length > 165) warn(`${path} — description ${desc.length} chars (over 165)`);
  if (!canonical) fail(`${path} — missing canonical`);
  if (h1s === 0) fail(`${path} — no <h1>`);
  if (h1s > 1) fail(`${path} — ${h1s} <h1> elements`);
  if (!html.includes('lang="en-GB"')) fail(`${path} — missing lang attribute`);
}

// ---- 2. Structured data parses and references a resolvable entity ---------
for (const [path, html] of pages) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  if (blocks.length === 0) { fail(`${path} — no structured data`); continue; }
  for (const [, raw] of blocks) {
    try {
      const parsed = JSON.parse(raw);
      const ids = new Set((parsed["@graph"] ?? []).map((n) => n["@id"]).filter(Boolean));
      const refs = JSON.stringify(parsed).match(/"@id":"([^"]+)"/g) ?? [];
      for (const r of refs) {
        const id = r.slice(7, -1);
        if (!ids.has(id) && !id.startsWith("http")) fail(`${path} — dangling @id reference ${id}`);
      }
    } catch (e) {
      fail(`${path} — invalid JSON-LD: ${e.message}`);
    }
  }
}

// ---- 3. Internal links resolve to something that exists ------------------
const known = new Set([...pages.keys()]);
for (const f of files) known.add("/" + relative(DIST, f).replace(/\\/g, "/"));
for (const [path, html] of pages) {
  for (const [, href] of html.matchAll(/href="(\/[^"#?]*)"/g)) {
    const target = href.endsWith("/") ? href : href;
    if (known.has(target) || known.has(target + "/") || known.has(target.replace(/\/$/, ""))) continue;
    fail(`${path} — broken internal link → ${href}`);
  }
}

// ---- 4. Images declare intrinsic size (the usual cause of layout shift) ---
for (const [path, html] of pages) {
  for (const [tag] of html.matchAll(/<img\b[^>]*>/g)) {
    if (!/width=/.test(tag) || !/height=/.test(tag)) warn(`${path} — <img> without width/height`);
  }
}

// ---- 5. Performance budget ----------------------------------------------
let totalJs = 0;
for (const f of files) {
  const size = (await stat(f)).size;
  const ext = extname(f);
  if (ext === ".js") totalJs += size;
  if (ext === ".html" && size > BUDGET.html) {
    warn(`${relative(DIST, f)} — ${(size / 1024).toFixed(1)}KB HTML (budget ${BUDGET.html / 1024}KB)`);
  }
  if (ext === ".woff2" && size > BUDGET.font) {
    fail(`${relative(DIST, f)} — font ${(size / 1024).toFixed(1)}KB over budget`);
  }
}
if (totalJs > BUDGET.totalJs) fail(`Total JS ${(totalJs / 1024).toFixed(1)}KB over ${BUDGET.totalJs / 1024}KB budget`);

// ---- 6. The machine-readable surfaces exist ------------------------------
for (const required of ["robots.txt", "llms.txt", "rss.xml", "sitemap-index.xml", "brand/og.png"]) {
  if (!files.some((f) => relative(DIST, f).replace(/\\/g, "/") === required)) fail(`missing /${required}`);
}

// ---- 7. AI crawlers are not blocked -------------------------------------
const robots = await readFile(join(DIST, "robots.txt"), "utf8").catch(() => "");
for (const ua of ["GPTBot", "ClaudeBot", "PerplexityBot", "Google-Extended"]) {
  if (!robots.includes(ua)) warn(`robots.txt does not mention ${ua}`);
}
if (/^\s*User-agent:\s*\*\s*\n\s*Disallow:\s*\/\s*$/m.test(robots)) fail("robots.txt blocks all crawlers");

// ---- Report --------------------------------------------------------------
for (const w of warnings) console.log(`  WARN  ${w}`);
for (const f of failures) console.log(`  FAIL  ${f}`);
console.log(
  `\n${failures.length === 0 ? "PASS" : "FAIL"} — ${pages.size} pages, ` +
    `${failures.length} failures, ${warnings.length} warnings, ` +
    `${(totalJs / 1024).toFixed(1)}KB JS total`,
);
process.exit(failures.length === 0 ? 0 : 1);
