/**
 * Turns collected signals into ranked findings. Each finding names the capability it
 * belongs to, which is what the policy layer uses to decide whether it may ship.
 *
 * This step never writes to the site. It only produces ops/data/findings.json.
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const dataDir = fileURLToPath(new URL("./data/", import.meta.url));
const read = async (name, fallback = null) => {
  try {
    return JSON.parse(await readFile(`${dataDir}${name}`, "utf8"));
  } catch {
    return fallback;
  }
};

const crawl = await read("crawl.json");
if (!crawl) {
  console.error("No crawl.json — run `npm run build && node ops/crawl.mjs` first.");
  process.exit(1);
}
const baseline = await read("baseline.json");

/** Most recent GSC snapshot, whichever day it was taken. */
const files = await readdir(dataDir).catch(() => []);
const latestGsc = files.filter((f) => f.startsWith("gsc-")).sort().pop();
const gsc = latestGsc ? await read(latestGsc) : baseline;
const latestGa4 = files.filter((f) => f.startsWith("ga4-")).sort().pop();
const ga4 = latestGa4 ? await read(latestGa4) : null;

const findings = [];
const add = (f) => findings.push(f);

// ---- Structural health -------------------------------------------------
for (const link of crawl.brokenLinks) {
  add({
    capability: "broken-links",
    severity: 90,
    target: link.from,
    title: `Broken internal link on ${link.from}`,
    detail: `Links to ${link.to}, which does not resolve.`,
    evidence: link,
  });
}

const indexablePages = crawl.pages.filter((p) => !p.noindex);
for (const path of crawl.orphans) {
  const page = crawl.pages.find((p) => p.path === path);
  if (!page || page.noindex) continue; // thank-you and 404 are meant to be unlinked
  add({
    capability: "internal-links",
    severity: 60,
    target: path,
    title: `${path} has no internal links pointing to it`,
    detail: "An orphaned page is harder to discover and receives no internal authority.",
  });
}

// ---- Structured data ---------------------------------------------------
/**
 * Two different faults with two different repairs, and the taxonomy names them
 * separately: a label that fails to parse gets deleted (schema-syntax), a page
 * with no label at all gets one added (schema-new). Conflating them meant the
 * repair for "broken" was being applied to "absent", which is why nothing shipped.
 */
for (const p of indexablePages) {
  if (p.schemaBroken > 0) {
    add({
      capability: "schema-syntax",
      severity: 80,
      target: p.path,
      title: `${p.path} has ${p.schemaBroken} structured-data block(s) that do not parse`,
      detail: "Google reports unreadable markup as an error against the site and reads nothing from it.",
    });
  } else if (p.schemaTypes.length === 0) {
    add({
      capability: "schema-new",
      severity: 55,
      target: p.path,
      title: `${p.path} has no structured data`,
      detail: "No schema.org markup was found on the page, so search engines have to infer what it is.",
    });
  }
}

// ---- Image weight ------------------------------------------------------
/**
 * Separate from the HTML budget below, because they have different repairs: an
 * oversized photo is re-encoded mechanically, while an oversized page is a
 * decision about what to say. Only the first is safe to do unattended.
 */
const IMAGE_BUDGET = 150_000;
for (const asset of crawl.assets ?? []) {
  if (asset.bytes <= IMAGE_BUDGET) continue;
  add({
    capability: "perf-budget",
    severity: Math.min(85, 45 + Math.round(asset.bytes / 100_000)),
    target: null,
    title: `${asset.path} is ${Math.round(asset.bytes / 1024)}KB`,
    detail: `Over the ${Math.round(IMAGE_BUDGET / 1024)}KB image budget. On a phone connection this is the slowest thing on any page that shows it.`,
    evidence: { asset: asset.path, bytes: asset.bytes },
  });
}

// ---- The page list Google holds ----------------------------------------
const liveSitemap = `${(gsc?.property ?? "").replace(/^sc-domain:/, "https://")}/sitemap-index.xml`;
if (gsc?.sitemaps && !gsc.sitemaps.some((s) => s.path === liveSitemap)) {
  add({
    capability: "sitemap",
    severity: 88,
    target: null,
    title: "Google has no current sitemap for this site",
    detail:
      `Search Console holds ${gsc.sitemaps.length} sitemap(s), none of them the one this site publishes. ` +
      "Until it has the list, Google finds new pages only by following links to them.",
    evidence: { sitemap: liveSitemap, holds: gsc.sitemaps.map((s) => s.path) },
  });
}

// ---- Metadata budgets --------------------------------------------------
for (const p of indexablePages) {
  if (p.title && p.title.length > 65) {
    add({
      capability: "titles",
      severity: 45,
      target: p.path,
      title: `Title truncates in results on ${p.path}`,
      detail: `${p.title.length} characters; the ending is where the differentiating words usually are.`,
      evidence: { title: p.title },
    });
  }
  if (p.description && p.description.length > 165) {
    add({
      capability: "titles",
      severity: 35,
      target: p.path,
      title: `Meta description over budget on ${p.path}`,
      detail: `${p.description.length} characters; Google is likely to rewrite it.`,
    });
  }
  if (p.h1Count !== 1) {
    add({
      capability: "answer-blocks",
      severity: 50,
      target: p.path,
      title: `${p.path} has ${p.h1Count} H1 elements`,
      detail: "Exactly one H1 states unambiguously what the page is about.",
    });
  }
}

// ---- Performance -------------------------------------------------------
for (const p of crawl.pages) {
  if (p.bytes > 60_000) {
    add({
      capability: "perf-budget",
      severity: 40,
      target: p.path,
      title: `${p.path} exceeds the HTML budget`,
      detail: `${(p.bytes / 1024).toFixed(1)}KB of HTML against a 60KB budget.`,
    });
  }
  if (p.imagesWithoutDimensions > 0) {
    add({
      capability: "img-attrs",
      severity: 65,
      target: p.path,
      title: `${p.imagesWithoutDimensions} image(s) without dimensions on ${p.path}`,
      detail: "Missing width/height is the most common cause of Cumulative Layout Shift.",
    });
  }
}

// ---- Search demand the site earns but does not serve --------------------
/**
 * Three outcomes, and which one applies depends on how close the site already is:
 *
 *   the query names a section that exists   → the passage is weak (answer-blocks)
 *   a page covers the subject, no section   → add the section    (faq-expand)
 *   nothing covers it                       → write the page     (new-pages)
 *
 * Every one of these must carry the page it applies to. A finding with a null
 * target reaches a fixer that cannot open a file, declines, and looks like a
 * capability that does not work — which is exactly what was happening.
 */
const STOP_WORDS = new Set(["the", "a", "an", "and", "or", "for", "to", "of", "in", "is", "are", "what", "how", "do", "does", "can", "my", "your", "best", "uk"]);
const terms = (s) =>
  new Set(String(s).toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP_WORDS.has(w)));

/** The indexable page that best covers a query, with how strongly it does. */
function bestPageFor(query) {
  const want = terms(query);
  if (!want.size) return null;
  let best = null;
  for (const page of indexablePages) {
    const haystack = terms(`${page.title ?? ""} ${page.path} ${(page.h2s ?? []).join(" ")}`);
    const overlap = [...want].filter((w) => haystack.has(w)).length;
    if (!overlap) continue;
    const sectionMatch = (page.h2s ?? []).some((h) => {
      const heading = terms(h);
      return [...want].filter((w) => heading.has(w)).length >= Math.max(2, want.size - 1);
    });
    const score = overlap / want.size;
    if (!best || score > best.score) best = { page, score, sectionMatch };
  }
  return best;
}

if (gsc?.opportunities?.length) {
  for (const opp of gsc.opportunities.slice(0, 10)) {
    const match = bestPageFor(opp.query);
    const covered = match && match.score >= 0.5;

    const capability = !covered ? "new-pages" : match.sectionMatch ? "answer-blocks" : "faq-expand";
    const detail =
      capability === "new-pages"
        ? "No page on the site addresses this query."
        : capability === "answer-blocks"
          ? `${match.page.path} has a section on this, but no passage answers the query directly.`
          : `${match.page.path} covers the subject but has no section that answers this question.`;

    add({
      capability,
      severity: Math.min(95, 40 + Math.round(opp.impressions / 50)),
      target: covered ? match.page.path : null,
      title: `"${opp.query}" — ${opp.impressions} impressions, ${opp.clicks} clicks`,
      detail: `Average position ${opp.position}. ${detail}`,
      evidence: opp,
    });
  }
}

// ---- Demand the rebuild threw away --------------------------------------
/**
 * The rest of this file reasons about the site as it is now. This section is the
 * only one that knows the site used to be something else — and on a rebuild that
 * is where the largest, quietest losses are. An old URL that 404s or lands on the
 * homepage is invisible to a crawler: there is nothing left to crawl.
 *
 * The fix is almost never a cleverer redirect. If people are still searching for
 * something and arriving at a page that does not answer it, the honest response is
 * to answer it — so this raises a `new-pages` finding carrying the legacy URL, and
 * the fixer repoints that URL once the page exists.
 */
const migration = await read("migration.json");
for (const problem of (migration?.problems ?? []).slice(0, 10)) {
  const query = problem.topQuery;
  const path = new URL(problem.page).pathname;
  const lost = problem.verdict === "gone" ? "returns a 404" : "redirects to the homepage, which Google reads as a 404";

  add({
    capability: "new-pages",
    // Impressions already lost are worth more than impressions merely underserved:
    // this is demand the site used to have and gave away, so it outranks the
    // opportunity findings above at equivalent volume.
    severity: Math.min(98, 55 + Math.round(problem.impressions / 100)),
    target: null,
    title: `${path} earned ${problem.impressions} impressions and now ${lost}`,
    detail:
      `Before the rebuild this page was shown ${problem.impressions} times` +
      (query ? ` for searches like "${query}"` : "") +
      ` at average position ${problem.position}. Nothing on the new site answers it.`,
    evidence: {
      query: query ?? path.replace(/[/-]+/g, " ").trim(),
      impressions: problem.impressions,
      clicks: problem.clicks,
      position: problem.position,
      legacyUrl: problem.page,
      legacyPath: path,
      verdict: problem.verdict,
    },
  });
}

// ---- Conversion --------------------------------------------------------
if (ga4?.landingPages?.length) {
  for (const lp of ga4.landingPages.filter((p) => p.sessions >= 30 && p.conversions === 0).slice(0, 5)) {
    add({
      capability: "cro",
      severity: 55,
      target: lp.page,
      title: `${lp.page}: ${lp.sessions} sessions, no conversions`,
      detail: `Bounce rate ${(lp.bounceRate * 100).toFixed(0)}%. Traffic arrives and leaves without acting.`,
      evidence: lp,
    });
  }
}

findings.sort((a, b) => b.severity - a.severity);

await writeFile(
  `${dataDir}findings.json`,
  JSON.stringify({ generatedAt: new Date().toISOString(), source: { crawl: crawl.crawledAt, gsc: gsc?.window, ga4: ga4?.window ?? null }, findings }, null, 2),
);

const byCapability = findings.reduce((acc, f) => ((acc[f.capability] = (acc[f.capability] ?? 0) + 1), acc), {});
console.log(`findings.json: ${findings.length} findings`);
for (const [k, v] of Object.entries(byCapability).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(v).padStart(3)}  ${k}`);
}
