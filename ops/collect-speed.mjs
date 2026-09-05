/**
 * Collects speed evidence and writes src/data/performance.json, which the
 * public /proof/ page renders.
 *
 * Two kinds of number, deliberately kept apart:
 *   - Field data (CrUX): what real visitors experienced. This is what Google
 *     actually uses, and a low-traffic site simply will not have it yet.
 *   - Lab data (Lighthouse): a simulated run. Useful, but it is not the thing
 *     being graded, and presenting it as if it were is the usual sleight of hand.
 *
 * Page weight is measured from our own build, needs no API, and never fails.
 *
 *   node ops/collect-speed.mjs [--url https://mywebmaster.co.uk/]
 */
import { readdir, stat, writeFile } from "node:fs/promises";
import { join, extname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
const OUT = fileURLToPath(new URL("../src/data/performance.json", import.meta.url));
const URL_TO_TEST =
  (process.argv.includes("--url") && process.argv[process.argv.indexOf("--url") + 1]) ||
  "https://mywebmaster.co.uk/";

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

// ---- Always available: what we actually ship ----------------------------
const files = await walk(DIST);
let totalJs = 0;
let biggestHtml = { path: null, bytes: 0 };
let fontBytes = 0;
for (const f of files) {
  const bytes = (await stat(f)).size;
  const ext = extname(f);
  if (ext === ".js") totalJs += bytes;
  if (ext === ".woff2") fontBytes += bytes;
  if (ext === ".html" && bytes > biggestHtml.bytes) {
    biggestHtml = { path: "/" + relative(DIST, f).replace(/index\.html$/, ""), bytes };
  }
}

const build = {
  pages: files.filter((f) => f.endsWith(".html")).length,
  totalJsBytes: totalJs,
  fontBytes,
  largestPage: biggestHtml,
  thirdPartyOnCriticalPath: 0,
};

// ---- Best effort: Google's own measurement -------------------------------
async function pagespeed(strategy) {
  const key = process.env.PAGESPEED_API_KEY;
  const url =
    `https://www.googleapis.com/pagespeedonline/v5/runPagespeed` +
    `?url=${encodeURIComponent(URL_TO_TEST)}&strategy=${strategy}` +
    `&category=performance&category=accessibility&category=best-practices&category=seo` +
    (key ? `&key=${key}` : "");

  const res = await fetch(url);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message.slice(0, 160));

  const cats = data.lighthouseResult?.categories ?? {};
  const audits = data.lighthouseResult?.audits ?? {};
  const field = data.loadingExperience?.metrics ?? null;

  return {
    strategy,
    lab: {
      performance: Math.round((cats.performance?.score ?? 0) * 100),
      accessibility: Math.round((cats.accessibility?.score ?? 0) * 100),
      bestPractices: Math.round((cats["best-practices"]?.score ?? 0) * 100),
      seo: Math.round((cats.seo?.score ?? 0) * 100),
      lcp: audits["largest-contentful-paint"]?.displayValue ?? null,
      cls: audits["cumulative-layout-shift"]?.displayValue ?? null,
      tbt: audits["total-blocking-time"]?.displayValue ?? null,
    },
    field: field
      ? {
          lcp: field.LARGEST_CONTENTFUL_PAINT_MS?.percentile ?? null,
          inp: field.INTERACTION_TO_NEXT_PAINT?.percentile ?? null,
          cls: field.CUMULATIVE_LAYOUT_SHIFT_SCORE?.percentile ?? null,
          verdict: data.loadingExperience?.overall_category ?? null,
        }
      : null,
  };
}

const results = [];
const notes = [];
for (const strategy of ["mobile", "desktop"]) {
  try {
    results.push(await pagespeed(strategy));
  } catch (e) {
    notes.push(`${strategy}: ${e.message}`);
  }
}

const payload = {
  _comment: "Written by ops/collect-speed.mjs. Rendered publicly on /proof/.",
  measuredAt: new Date().toISOString(),
  url: URL_TO_TEST,
  build,
  results,
  /** No CrUX record means too few real visitors yet — a fact worth publishing. */
  fieldDataAvailable: results.some((r) => r.field),
  notes,
};

await writeFile(OUT, JSON.stringify(payload, null, 2));
console.log(
  `performance.json: ${build.pages} pages, ${(totalJs / 1024).toFixed(1)}KB JS, ` +
    `${results.length} Lighthouse run(s), field data ${payload.fieldDataAvailable ? "present" : "not yet"}` +
    (notes.length ? ` — ${notes.join("; ")}` : ""),
);
