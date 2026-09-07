/**
 * The per-client record written by the build pipeline.
 *
 * This is the join between the two halves of the product: the pipeline rebuilds a
 * customer's site and writes `fleet/<slug>.json`; this loop reads it and does the
 * daily work. Data rather than a function call, so neither side reaches into the
 * other and either can be run alone.
 *
 * Four fields carry rules this loop must not get wrong:
 *
 *   frozen    pages the customer wrote themselves. Never touched, no exceptions.
 *   holdout   may be null. Null is not "no pages held back" — it is "a controlled
 *             result is not available here", which changes what a report may claim.
 *   baseline  may have source "none", with the counts omitted entirely rather than
 *             written as null. Absent is not zero: a new venture has no starting
 *             score, and printing "0 clicks" invents one it can only improve on.
 *   restore   where the snapshot lives, and whether one was even applicable.
 */
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const DEFAULT_DIR = fileURLToPath(new URL("../../../pipeline/fleet/", import.meta.url));

/**
 * Loads the record for one client.
 *
 * Returns `{ found: false }` rather than throwing when there is no fleet file —
 * running this loop against mywebmaster.co.uk itself is a legitimate case with no
 * client record behind it. Callers decide what a missing record means for them;
 * `fleetRequired()` says whether it should have been there.
 */
export async function loadFleet({ slug = process.env.CLIENT_SLUG, file = process.env.FLEET_FILE } = {}) {
  const path = file ?? (slug ? `${process.env.FLEET_DIR ?? DEFAULT_DIR}${slug}.json` : null);
  if (!path) return { found: false, reason: "no CLIENT_SLUG or FLEET_FILE set" };
  try {
    return { found: true, path, client: JSON.parse(await readFile(path, "utf8")) };
  } catch (err) {
    // Distinguished from "not configured": a slug was named and the file is not
    // readable, which is a broken deployment rather than a local run.
    return { found: false, path, error: String(err?.message ?? err).slice(0, 160), broken: true };
  }
}

/** Every client the pipeline has recorded. */
export async function listFleet(dir = process.env.FLEET_DIR ?? DEFAULT_DIR) {
  try {
    return (await readdir(dir)).filter((f) => f.endsWith(".json")).map((f) => f.replace(/\.json$/, ""));
  } catch {
    return [];
  }
}

/**
 * Pages that must not be changed, in the shape the policy layer already uses.
 *
 * The customer's own writing is the strictest rule in the system. Someone who
 * writes a sentence about their own business and returns to find a machine
 * rewrote it does not stay a customer, and no amount of "it tested better"
 * repairs that.
 */
export function frozenPaths(client) {
  const out = {};
  for (const entry of client?.frozen ?? []) {
    if (!entry?.path) continue;
    out[entry.path] = entry.until ?? "9999-12-31";
  }
  return out;
}

/**
 * Whether the restore promise behind this client is real.
 *
 * `applicable: false` is a pass, not a failure — a brand-new venture had no site
 * to snapshot, so there is nothing to restore and nothing being promised. Only a
 * client whose site we replaced needs a snapshot to exist.
 */
export function restoreReady(client) {
  const restore = client?.restore;
  if (!restore) return { ready: false, reason: "the client record has no restore section" };
  if (restore.applicable === false) {
    return { ready: true, reason: "nothing pre-existed, so there is nothing to restore" };
  }
  if (!restore.snapshotAt) return { ready: false, reason: "no snapshot of the original site has been taken" };
  return {
    ready: true,
    reason: `snapshot taken ${String(restore.snapshotAt).slice(0, 10)}`,
    limitations: restore.limitations ?? [],
    dnsRecorded: Boolean(restore.dnsRecorded),
  };
}

/**
 * What a report is allowed to claim about cause.
 *
 * With a holdout, improvement can be attributed: both groups saw the same Google
 * updates and the same quiet months, so the gap between them is ours. Without
 * one, all that exists is before-and-after, which cannot separate our work from
 * the season — and a report that does not say so is claiming credit it has not
 * earned.
 */
export function evidenceStrength(client) {
  const holdout = client?.holdout;
  if (Array.isArray(holdout) && holdout.length) {
    return {
      controlled: true,
      holdout,
      claim: `measured against ${holdout.length} page(s) deliberately left alone`,
    };
  }
  return {
    controlled: false,
    holdout: [],
    claim: "before-and-after only, which cannot separate our work from the season",
    note: client?.holdoutNote ?? "no control group is available for this site",
  };
}

/**
 * The day-zero numbers, with "we could not measure" kept distinct from "zero".
 *
 * A new venture has no starting score. Presenting null as 0 invents a baseline
 * and turns the first month's ordinary traffic into a fabricated improvement.
 */
export function baselineFor(client) {
  const baseline = client?.baseline;
  // The pipeline now omits `clicks` entirely rather than writing null, so the
  // test is "is there a number here", not "is it null". Absence, null and a
  // missing source all mean the same thing: we do not know, and must not print 0.
  if (!baseline || baseline.source === "none" || typeof baseline.clicks !== "number") {
    return {
      measurable: false,
      note: baseline?.note ?? "nothing existed to measure at launch",
      takenAt: baseline?.takenAt ?? null,
    };
  }
  return {
    measurable: true,
    clicks: baseline.clicks,
    impressions: baseline.impressions,
    takenAt: baseline.takenAt ?? null,
  };
}
