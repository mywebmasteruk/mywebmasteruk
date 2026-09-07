/**
 * The arithmetic behind the number on /proof/.
 *
 * Separated from ops/measure.mjs, which fetches and writes, so the calculation
 * that produces a public claim can be tested without touching Search Console.
 * This is the one number the business is sold on; it should not be the only part
 * of the system with no tests behind it.
 */

/** Below this a difference is arithmetic rather than evidence. */
export const MIN_PAGES_PER_GROUP = 3;

/**
 * Relative movement per page between two windows.
 *
 * A page missing from either window is dropped rather than treated as zero: a
 * page that did not exist yet and a page that lost all its traffic look
 * identical in a table of zeroes, and they mean opposite things.
 */
export function movement(paths, beforeMetrics, afterMetrics) {
  const rows = [];
  for (const path of paths) {
    const b = beforeMetrics.get(path);
    const a = afterMetrics.get(path);
    if (!b || !a) continue;
    if (!b.impressions) continue; // no denominator, no percentage
    rows.push({
      path,
      beforeImpressions: b.impressions,
      afterImpressions: a.impressions,
      change: (a.impressions - b.impressions) / b.impressions,
      beforeClicks: b.clicks,
      afterClicks: a.clicks,
    });
  }
  return rows;
}

export const mean = (rows) => (rows.length ? rows.reduce((n, r) => n + r.change, 0) / rows.length : null);

/**
 * Difference-in-differences, with every reason it cannot be claimed.
 *
 * Returns `lift: null` unless the design actually supports the number. The
 * failure mode being guarded against is not a crash — it is a confident figure
 * derived from one page against one page, printed on a page headed "Proof".
 */
export function computeLift({ treatedRows, controlRows, holdoutActive, eligibleChanges, earliestChange, window, lagDays }) {
  const blockers = [];
  if (!holdoutActive) blockers.push("no pages are held back, so there is nothing to compare against");
  if (!eligibleChanges) {
    blockers.push(
      earliestChange
        ? `no change is old enough — the earliest was ${earliestChange} and a window needs ${window} days plus ${lagDays} for Search Console to finalise`
        : "no autonomous change has been made yet",
    );
  }
  if (!blockers.length && controlRows.length < MIN_PAGES_PER_GROUP) {
    blockers.push(`only ${controlRows.length} held-back page(s) had data in both windows; ${MIN_PAGES_PER_GROUP} is the minimum worth reporting`);
  }
  if (!blockers.length && treatedRows.length < MIN_PAGES_PER_GROUP) {
    blockers.push(`only ${treatedRows.length} changed page(s) had data in both windows; ${MIN_PAGES_PER_GROUP} is the minimum worth reporting`);
  }

  const treatedMean = mean(treatedRows);
  const controlMean = mean(controlRows);
  const claimable = blockers.length === 0 && treatedMean !== null && controlMean !== null;

  return {
    treatedMean,
    controlMean,
    lift: claimable ? treatedMean - controlMean : null,
    blockers,
    claimable,
  };
}
