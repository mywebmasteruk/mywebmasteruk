/**
 * The client record, and the shapes that look like untidiness and are not.
 *
 * They exist to stop a report claiming more than the evidence supports, and both
 * have been broken once by a well-meant tidy-up.
 */
import { suite, check } from "./harness.mjs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { loadFleet, baselineFor, frozenPaths, restoreReady } from "../lib/fleet.mjs";

suite("fleet — a record without a holdout is the normal shape");

const fixture = fileURLToPath(new URL("../fixtures/fleet-client.json", import.meta.url));
const record = JSON.parse(await readFile(fixture, "utf8"));
check("the fixture carries no holdout, matching the pipeline's contract", !("holdout" in record) && !("holdoutNote" in record));
const loaded = await loadFleet({ file: fixture });
check("it loads as a found record", loaded.found === true && loaded.client?.slug === "harbourside");
check("its customer-written pages still read through", frozenPaths(loaded.client)["/emergency/"] !== undefined);
check("its baseline still reads as unmeasurable, not zero", baselineFor(loaded.client).measurable === false);
check("its restore promise still reads", restoreReady(loaded.client).ready === true);

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
