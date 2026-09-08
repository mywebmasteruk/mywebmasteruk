/**
 * The number on /proof/.
 *
 * This is the one figure the business is sold on, so most of these are about
 * refusing to produce it. A confident result from nothing is worse than no
 * result, because a page headed "Proof" is where nobody checks.
 */
import { suite, check } from "./harness.mjs";
import { movement, mean, computeLift, MIN_PAGES_PER_GROUP } from "../lib/lift.mjs";

suite("lift — movement between two windows");

const m = (o) => new Map(Object.entries(o));
const before = m({ "/a/": { clicks: 2, impressions: 100 }, "/b/": { clicks: 1, impressions: 200 }, "/gone/": { clicks: 0, impressions: 50 } });
const after = m({ "/a/": { clicks: 4, impressions: 150 }, "/b/": { clicks: 1, impressions: 180 }, "/new/": { clicks: 0, impressions: 10 } });
const rows = movement(["/a/", "/b/", "/gone/", "/new/"], before, after);

check("only pages present in both windows count", rows.length === 2);
check("a page that vanished is dropped, not counted as -100%", !rows.some((r) => r.path === "/gone/"));
check("a page that did not exist before is dropped, not +infinity", !rows.some((r) => r.path === "/new/"));
check("growth is computed correctly", Math.abs(rows.find((r) => r.path === "/a/").change - 0.5) < 1e-9);
check("decline is computed correctly", Math.abs(rows.find((r) => r.path === "/b/").change + 0.1) < 1e-9);
check("a zero denominator is skipped, not divided by",
  movement(["/z/"], m({ "/z/": { clicks: 0, impressions: 0 } }), m({ "/z/": { clicks: 0, impressions: 5 } })).length === 0);
check("the mean of nothing is null, not zero", mean([]) === null);

suite("lift — when it refuses to answer");

const three = (c) => [{ change: c }, { change: c }, { change: c }];
const base = { holdoutActive: true, eligibleChanges: 3, earliestChange: "2026-01-01", window: 28, lagDays: 3 };

let r = computeLift({ ...base, treatedRows: three(0.4), controlRows: three(0.1) });
check("lift is treated movement minus control movement", Math.abs(r.lift - 0.3) < 1e-9);
check("and it is claimable", r.claimable === true && r.blockers.length === 0);

r = computeLift({ ...base, treatedRows: three(0.4), controlRows: three(0.6) });
check("a loss is reported as a loss, not hidden", r.lift < 0 && r.claimable);

r = computeLift({ ...base, treatedRows: three(0.9), controlRows: [], holdoutActive: false });
check("no holdout means no number, however good the treated pages look", r.lift === null);
check("and it does not fall back to before-and-after", r.blockers[0].includes("nothing to compare against"));

r = computeLift({ ...base, treatedRows: three(0.4), controlRows: three(0.1), eligibleChanges: 0, earliestChange: "2026-09-06" });
check("a change younger than the window yields no number", r.lift === null && r.blockers[0].includes("no change is old enough"));

r = computeLift({ ...base, treatedRows: three(0.4), controlRows: three(0.1), eligibleChanges: 0, earliestChange: null });
check("no change at all is stated plainly", r.blockers[0] === "no autonomous change has been made yet");

r = computeLift({ ...base, treatedRows: three(0.4), controlRows: [{ change: 0.1 }] });
check(`one control page is arithmetic, not evidence (min ${MIN_PAGES_PER_GROUP})`, r.lift === null);

r = computeLift({ ...base, treatedRows: [{ change: 0.9 }], controlRows: three(0.1), eligibleChanges: 1 });
check("one treated page is not evidence either", r.lift === null);
