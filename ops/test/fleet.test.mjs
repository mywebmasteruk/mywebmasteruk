/**
 * The client record, and two shapes that look like untidiness and are not.
 *
 * Both exist to stop a report claiming more than the evidence supports, and both
 * have been broken once by a well-meant tidy-up.
 */
import { suite, check } from "./harness.mjs";
import { evidenceStrength, baselineFor, frozenPaths, restoreReady } from "../lib/fleet.mjs";

suite("fleet — what a report may claim");

const uncontrolled = evidenceStrength({ holdout: null, holdoutNote: "Only 2 pages — too few to hold any back." });
check("a null holdout is not reported as controlled", uncontrolled.controlled === false);
check("and never becomes an empty array that reads as 'we held nothing back'", Array.isArray(uncontrolled.holdout) && uncontrolled.holdout.length === 0);
check("the pipeline's note is carried verbatim", uncontrolled.note.includes("too few to hold any back"));
check("the claim admits what it cannot separate", uncontrolled.claim.includes("cannot separate our work from the season"));

const controlled = evidenceStrength({ holdout: ["/a/", "/b/", "/c/"] });
check("a real holdout is reported as controlled", controlled.controlled && controlled.claim.includes("3 page(s)"));

suite("fleet — absence is not zero");

const unmeasured = baselineFor({ baseline: { takenAt: "2026-09-07", source: "none", pages: 4, note: "New venture." } });
check("an unmeasurable baseline is flagged, not zeroed", unmeasured.measurable === false);
check("and exposes no clicks key at all", unmeasured.clicks === undefined);
check("absent clicks with no source is still not measurable",
  baselineFor({ baseline: { takenAt: "x", pages: 4 } }).measurable === false);
check("a null clicks value is also not measurable",
  baselineFor({ baseline: { source: "search-console", clicks: null } }).measurable === false);
check("a real baseline reads through",
  baselineFor({ baseline: { source: "search-console", clicks: 12, impressions: 900 } }).clicks === 12);

suite("fleet — the customer's own pages");

const frozen = frozenPaths({ frozen: [{ path: "/emergency/", until: "2026-12-06T00:00:00Z" }] });
check("a customer-written page is frozen", frozen["/emergency/"] === "2026-12-06T00:00:00Z");
check("an entry with no path is ignored rather than throwing", Object.keys(frozenPaths({ frozen: [{}] })).length === 0);
check("a client with no frozen list yields none", Object.keys(frozenPaths({})).length === 0);

suite("fleet — the restore promise");

check("a new venture needs no snapshot", restoreReady({ restore: { applicable: false } }).ready === true);
check("a replaced site with no snapshot is blocked", restoreReady({ restore: { applicable: true } }).ready === false);
check("a replaced site with a snapshot passes", restoreReady({ restore: { applicable: true, snapshotAt: "2026-09-01" } }).ready === true);
check("a record with no restore section is blocked", restoreReady({}).ready === false);
