/**
 * Closes the loop: did the changes actually do anything?
 *
 *   node ops/measure.mjs [--window 28] [--write]
 *
 * This is the half of the promise that holding pages back does not deliver on its
 * own. A control group makes a comparison *possible*; it does not make one. Until
 * this ran, /proof/, the Compound plan and clause 5 of the terms all described a
 * difference nothing computed.
 *
 * The method is difference-in-differences, which is the only thing a holdout buys
 * you. Treated pages moved by some amount; held-back pages moved by some amount
 * over the same calendar weeks, through the same Google updates and the same
 * quiet fortnight. The gap between those two movements is the part attributable
 * to the work. Comparing a treated page only against its own past would credit us
 * with the season.
 *
 * Three refusals are built in, because the failure mode of a measurement script is
 * not crashing — it is producing a confident number from nothing:
 *
 *   No closed window   a change younger than the window is not evidence yet.
 *   No control         without held-back pages this cannot run at all. It does
 *                      not silently fall back to before-and-after and call it lift.
 *   Too few pages      a difference computed from one page against one page is
 *                      arithmetic, not evidence, and is labelled as such.
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { gscFetch, getAccessToken, SCOPES } from "./lib/google.mjs";
import { loadHoldout, normalisePath } from "./lib/policy.mjs";
import { movement, computeLift, MIN_PAGES_PER_GROUP } from "./lib/lift.mjs";

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : d;
};

const WINDOW = Number(arg("window", 28));
const WRITE = process.argv.includes("--write");
const PROPERTY = process.env.GSC_PROPERTY || "sc-domain:mywebmaster.co.uk";
const SITE = process.env.SITE_URL || "https://mywebmaster.co.uk";

/** GSC finalises around three days back; fresher dates return partial rows. */
const LAG_DAYS = 3;
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const daysAgo = (n) => iso(Date.now() - n * 864e5);

const site = encodeURIComponent(PROPERTY);
const token = await getAccessToken(SCOPES.searchConsole);

/** Per-page clicks and impressions for one date range. */
async function pageMetrics(startDate, endDate) {
  const res = await gscFetch(`/sites/${site}/searchAnalytics/query`, {
    method: "POST",
    token,
    body: { startDate, endDate, dimensions: ["page"], rowLimit: 500, dataState: "final" },
  });
  const out = new Map();
  for (const row of res.rows ?? []) {
    out.set(normalisePath(new URL(row.keys[0]).pathname), {
      clicks: row.clicks,
      impressions: row.impressions,
      position: row.position,
    });
  }
  return out;
}

/**
 * Pages we changed, and when — read from the changelog the loop writes, because
 * that is the record a customer can audit. A page whose window has not closed is
 * excluded rather than counted early.
 */
async function treatedPages() {
  const dir = root("src/content/changelog");
  const files = (await readdir(dir).catch(() => [])).filter((f) => f.endsWith(".mdx"));
  const treated = new Map();
  for (const file of files) {
    const text = await readFile(`${dir}/${file}`, "utf8");
    if (/^autonomy: "human"$/m.test(text)) continue; // hand-made, not ours to claim
    const date = text.match(/^date: (\d{4}-\d{2}-\d{2})$/m)?.[1];
    const targets = text.match(/^targets: (\[.*\])$/m)?.[1];
    if (!date || !targets) continue;
    for (const path of JSON.parse(targets)) {
      if (!path.startsWith("/")) continue; // file paths, not URLs
      const norm = normalisePath(path);
      // Earliest change wins: the window opens when we first touched the page.
      if (!treated.has(norm) || treated.get(norm) > date) treated.set(norm, date);
    }
  }
  return treated;
}

const holdout = await loadHoldout();
const treated = await treatedPages();

const closedBefore = daysAgo(LAG_DAYS + WINDOW);
const eligible = [...treated].filter(([, date]) => date <= closedBefore);

/** The two calendar windows every page is compared across. */
const after = { startDate: daysAgo(LAG_DAYS + WINDOW), endDate: daysAgo(LAG_DAYS) };
const before = { startDate: daysAgo(LAG_DAYS + WINDOW * 2), endDate: daysAgo(LAG_DAYS + WINDOW + 1) };

const [beforeMetrics, afterMetrics] = await Promise.all([
  pageMetrics(before.startDate, before.endDate),
  pageMetrics(after.startDate, after.endDate),
]);

const treatedRows = movement(eligible.map(([p]) => p), beforeMetrics, afterMetrics);
const controlRows = movement(holdout.paths, beforeMetrics, afterMetrics);

const { treatedMean, controlMean, lift, blockers, claimable } = computeLift({
  treatedRows,
  controlRows,
  holdoutActive: holdout.active,
  eligibleChanges: eligible.length,
  earliestChange: treated.size ? [...treated.values()].sort()[0] : null,
  window: WINDOW,
  lagDays: LAG_DAYS,
});

const result = {
  measuredAt: new Date().toISOString(),
  method: "difference-in-differences on impressions, treated pages against held-back pages",
  window: { days: WINDOW, before, after },
  treated: { pages: treatedRows.length, meanChange: treatedMean, rows: treatedRows },
  control: { pages: controlRows.length, meanChange: controlMean, rows: controlRows },
  /** The number the whole design exists to produce. Null unless it is earned. */
  lift,
  blockers,
  claimable,
};

await writeFile(root("ops/data/measurement.json"), JSON.stringify(result, null, 2));

const pct = (n) => (n === null ? "n/a" : `${(n * 100).toFixed(1)}%`);
console.log(`measurement.json: window ${before.startDate}→${before.endDate} vs ${after.startDate}→${after.endDate}`);
console.log(`  changed pages:   ${treatedRows.length} (mean impressions ${pct(treatedMean)})`);
console.log(`  held-back pages: ${controlRows.length} (mean impressions ${pct(controlMean)})`);
if (result.claimable) {
  console.log(`  LIFT: ${pct(result.lift)} — the movement we can attribute to the work`);
} else {
  console.log(`  No result yet:`);
  for (const b of blockers) console.log(`    - ${b}`);
}

// The published figure is only written on request, and only when it is earned.
if (WRITE && result.claimable) {
  const path = root("src/data/experiment.json");
  const experiment = JSON.parse(await readFile(path, "utf8"));
  experiment.latest = {
    measuredAt: result.measuredAt,
    window: result.window,
    lift: result.lift,
    treatedPages: treatedRows.length,
    controlPages: controlRows.length,
    method: result.method,
  };
  await writeFile(path, `${JSON.stringify(experiment, null, 2)}\n`);
  console.log("  Published to experiment.json — /proof/ will now show a result.");
} else if (WRITE) {
  console.log("  Nothing published: a result has to be earned before it can be shown.");
}
