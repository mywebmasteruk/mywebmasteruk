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
for (const p of indexablePages) {
  if (p.schemaTypes.length === 0) {
    add({
      capability: "schema-syntax",
      severity: 55,
      target: p.path,
      title: `${p.path} has no structured data`,
      detail: "No schema.org markup was found on the page.",
    });
  }
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
if (gsc?.opportunities?.length) {
  const served = new Set(
    indexablePages.flatMap((p) => [p.title, ...p.h2s].filter(Boolean).map((s) => s.toLowerCase())),
  );
  for (const opp of gsc.opportunities.slice(0, 10)) {
    const q = opp.query.toLowerCase();
    const answeredSomewhere = [...served].some((h) => h.includes(q) || q.includes(h.slice(0, 24)));
    add({
      capability: answeredSomewhere ? "answer-blocks" : "new-pages",
      severity: Math.min(95, 40 + Math.round(opp.impressions / 50)),
      target: null,
      title: `"${opp.query}" — ${opp.impressions} impressions, ${opp.clicks} clicks`,
      detail:
        `Average position ${opp.position}. ` +
        (answeredSomewhere
          ? "A page touches this topic but no passage answers the query directly."
          : "No page on the site addresses this query."),
      evidence: opp,
    });
  }
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
