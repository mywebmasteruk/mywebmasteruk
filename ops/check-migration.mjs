/**
 * Checks that a rebuild did not quietly throw away demand the old site had earned.
 *
 *   node ops/check-migration.mjs [--baseline ops/data/baseline.json]
 *
 * Autopilot rebuilds a customer's site rather than adapting to their CMS, so every
 * client hits this on day one: hundreds of URLs that Google knows about stop
 * existing, and the redirect map decides whether their history transfers or is
 * thrown away. Nothing else in the loop can see this. The crawler only knows the
 * new site, so a page that used to rank and now redirects to the homepage is
 * invisible to it — the URL is simply gone.
 *
 * Two failure modes, both silent, both expensive:
 *
 *   gone      the old URL 404s. Whatever it ranked for is lost outright.
 *   soft-404  the old URL redirects somewhere that does not answer what it ranked
 *             for — usually the homepage. Google treats this as a 404 that also
 *             wasted its time: the URL is dropped and no ranking signal passes.
 *             It looks tidy in a browser, which is exactly why nobody catches it.
 *
 * Scope: this watches the LIVE site, continuously, after cutover. It is not the
 * same question as the pipeline's stage-5 gate, which checks a build against the
 * `_redirects` file before anything is deployed. That one asks "did we write the
 * redirects correctly?"; this one asks "are they still working, and is the page
 * they lead to actually answering what the old URL ranked for?" — which only the
 * live site plus current Search Console data can answer. Keep them separate.
 *
 * Writes ops/data/migration.json. Read-only against the network; changes nothing.
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};

const dataDir = fileURLToPath(new URL("./data/", import.meta.url));
const baselinePath = arg("baseline", `${dataDir}baseline.json`);
const SITE = process.env.SITE_URL || "https://mywebmaster.co.uk";

/** Below this, a lost URL is noise rather than a business problem. */
const MIN_IMPRESSIONS = Number(arg("min", 25));

const baseline = JSON.parse(await readFile(baselinePath, "utf8"));
const home = new URL(SITE).href;

/** Words too common to prove a redirect landed somewhere relevant. */
const STOP = new Set([
  "the", "a", "an", "and", "or", "for", "to", "of", "in", "on", "is", "are", "my",
  "your", "what", "how", "do", "does", "can", "i", "it", "with", "best", "uk",
]);

const words = (s) =>
  new Set(
    String(s)
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOP.has(w)),
  );

const normalisePath = (u) => new URL(u).pathname.replace(/\/+$/, "") || "/";

/**
 * Does the destination plausibly answer what the source ranked for?
 *
 * Deliberately crude and deliberately deterministic: this decides whether to
 * raise a finding, not what to write, so a model has no business in the loop.
 * Because it is crude it only gets to be *certain* about the homepage case —
 * everything else it cannot vouch for is reported for a human to read, not acted
 * on. A confident wrong finding would cost more than a missed one.
 */
function judge(sourceUrl, destUrl, topQuery) {
  // www → apex, http → https, trailing slash: same page, different address.
  if (normalisePath(destUrl) === normalisePath(sourceUrl)) return "ok";
  // Landing on the homepage is the unambiguous case: it answers nothing specific,
  // so whatever the old URL ranked for, this redirect does not deliver it.
  if (new URL(destUrl).href === home) return "soft-404";

  const want = words(topQuery || new URL(sourceUrl).pathname);
  const got = words(new URL(destUrl).pathname);
  for (const w of want) if (got.has(w)) return "ok";
  // A redirect to a real page with no shared vocabulary. Often correct
  // (/portfolio → /proof/), sometimes not. Not certain enough to act on.
  return "unclear";
}

/** Top query per legacy page, so a finding can say what was actually lost. */
const queriesByPage = new Map();
for (const q of baseline.topQueries ?? []) {
  // baseline.json holds queries and pages separately; page-level queries are not
  // available without a second API call, so fall back to matching on the slug.
  for (const p of baseline.topPages ?? []) {
    const slug = new URL(p.page).pathname.replace(/[^a-z0-9]+/gi, " ").trim().toLowerCase();
    if (!slug) continue;
    const overlap = [...words(q.query)].filter((w) => slug.includes(w)).length;
    if (overlap >= 2) {
      const best = queriesByPage.get(p.page);
      if (!best || q.impressions > best.impressions) queriesByPage.set(p.page, q);
    }
  }
}

const checked = [];
for (const p of baseline.topPages ?? []) {
  if (p.impressions < MIN_IMPRESSIONS) continue;

  let status = 0;
  let finalUrl = null;
  try {
    const res = await fetch(p.page, { redirect: "follow" });
    status = res.status;
    finalUrl = res.url;
  } catch (err) {
    checked.push({ ...p, verdict: "unreachable", error: String(err.message).slice(0, 120) });
    continue;
  }

  const topQuery = queriesByPage.get(p.page)?.query ?? null;

  let verdict;
  if (status === 404 || status === 410) verdict = "gone";
  else if (status >= 400) verdict = "error";
  else verdict = judge(p.page, finalUrl, topQuery);

  checked.push({
    page: p.page,
    impressions: p.impressions,
    clicks: p.clicks,
    position: p.position,
    topQuery,
    status,
    finalUrl,
    verdict,
  });
}

/** Acted on. `unclear` is reported alongside but never triggers a change. */
const problems = checked.filter((c) => c.verdict === "gone" || c.verdict === "soft-404");
const unclear = checked.filter((c) => c.verdict === "unclear").sort((a, b) => b.impressions - a.impressions);
problems.sort((a, b) => b.impressions - a.impressions);

const report = {
  checkedAt: new Date().toISOString(),
  baseline: { window: baseline.window, property: baseline.property },
  site: SITE,
  minImpressions: MIN_IMPRESSIONS,
  checked: checked.length,
  lostImpressions: problems.reduce((n, p) => n + p.impressions, 0),
  problems,
  unclear,
  ok: checked.filter((c) => c.verdict === "ok").length,
};

await writeFile(`${dataDir}migration.json`, JSON.stringify(report, null, 2));

console.log(
  `migration.json: ${checked.length} legacy URLs checked, ${problems.length} losing demand ` +
    `(${report.lostImpressions} impressions over the baseline window)`,
);
for (const p of problems.slice(0, 10)) {
  const where = p.verdict === "gone" ? "404" : `→ ${new URL(p.finalUrl).pathname}`;
  console.log(`  ${String(p.impressions).padStart(5)}i  ${p.verdict.padEnd(8)} ${where.padEnd(28)} ${p.page}`);
}
if (unclear.length) {
  console.log(`${unclear.length} redirect(s) land somewhere unrelated — reported, not acted on:`);
  for (const p of unclear.slice(0, 5)) {
    console.log(`  ${String(p.impressions).padStart(5)}i  → ${new URL(p.finalUrl).pathname.padEnd(24)} ${p.page}`);
  }
}
