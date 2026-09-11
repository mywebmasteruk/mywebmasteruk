/**
 * The daily run. Orchestrates the whole cycle and refuses to proceed past any gate.
 *
 *   node ops/loop.mjs               # collect, decide, fix, publish, tell the customer
 *   node ops/loop.mjs --dry-run     # do everything except change or send anything
 *   node ops/loop.mjs --no-push     # change the working tree, do not publish
 *
 * This defaults to acting. That is a deliberate reversal: an operator standing
 * between a known problem and its fix is not a safety feature, it is a delay with
 * a person's name on it. The safety features are the ones that do not need anyone
 * to be awake — the kill switch, the circuit breaker, the published taxonomy, the
 * blast-radius cap, the build-time schema, and the fact that every change is
 * committed, so reverting is one command rather than an archaeology project.
 *
 * What replaces approval is disclosure: nothing here finishes without the customer
 * being told what happened, and `decide` items — prices, promises, legal wording —
 * are never touched at all, only reported.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { planRun, isHalted, circuitBreaker, hasSnapshot, readSnapshot } from "./lib/policy.mjs";
import { applyFindings } from "./apply.mjs";
import { writeReport } from "./report.mjs";
import { aiConfig, applySettings as applyAiSettings } from "./lib/ai.mjs";
import { queueNotice, flushNotices, notifyConfig, applySettings as applyNotifySettings } from "./lib/notify.mjs";
import { loadSettings } from "./lib/settings.mjs";
import { mailNotice } from "./lib/notify-mail.mjs";
import { writeChangelogEntry } from "./lib/changelog.mjs";
import { loadFleet, baselineFor } from "./lib/fleet.mjs";

const exec = promisify(execFile);
const CWD = fileURLToPath(new URL("../", import.meta.url));
const dataDir = fileURLToPath(new URL("./data/", import.meta.url));

const dryRun = process.argv.includes("--dry-run");
const push = !process.argv.includes("--no-push") && !dryRun;
const today = new Date().toISOString().slice(0, 10);

const run = async (cmd, args) => {
  const { stdout, stderr } = await exec(cmd, args, { cwd: CWD, maxBuffer: 10 * 1024 * 1024 });
  return (stdout + stderr).trim();
};
const step = (n, msg) => console.log(`\n[${n}] ${msg}`);
const quiet = async (label, fn) => {
  try {
    console.log("  " + (await fn()));
  } catch (e) {
    // A collector that cannot reach its API must not stop a run: the rest of the
    // signals are still worth acting on, and the gap shows up in the report.
    console.log(`  ${label} unavailable: ${String(e.message).slice(0, 160)}`);
  }
};

if (dryRun) console.log("DRY RUN — nothing will be changed, committed or sent.\n");

// ---- Gate 1: the kill switch -------------------------------------------
step(1, "Checking kill switch");
const halted = await isHalted({ willWrite: !dryRun });
if (halted) {
  console.log(`  HALTED: ${halted}`);
  await writeReport({ date: today, halted });
  console.log(`\nReport written to ops/reports/${today}.md`);
  process.exit(0);
}
console.log("  Clear.");

// ---- Which client is this? ---------------------------------------------
/**
 * The record the build pipeline wrote. Absent when this loop runs against
 * mywebmaster.co.uk itself, which is legitimate. Named but unreadable is not: that
 * is a broken deployment, and the pages a customer wrote themselves are listed in
 * that file, so acting without it risks rewriting their own words.
 */
const fleet = await loadFleet();
const client = fleet.client ?? null;
if (client) {
  const baseline = baselineFor(client);
  console.log(`  Client: ${client.business} (${client.host})`);
  if (!baseline.measurable) console.log(`  Baseline: not measurable — ${baseline.note}`);
} else if (fleet.broken) {
  console.log(`  CLIENT RECORD UNREADABLE: ${fleet.path} — ${fleet.error}`);
} else {
  console.log("  No client record — running against our own site.");
}

// ---- Settings ----------------------------------------------------------
// What the admin console says, over the environment, over the built-in defaults.
const configured = await loadSettings({ slug: client?.slug });
applyAiSettings(configured.settings);
applyNotifySettings(configured.settings);
console.log(`  ${configured.summary}`);
console.log(`  Model: ${aiConfig.model} (${configured.source.model}) · drafting ${aiConfig.draftingEnabled ? "on" : "off"} · digest ${notifyConfig.cadence}`);

// ---- Collect ------------------------------------------------------------
step(2, "Collecting Search Console");
await quiet("Search Console", () => run("node", ["ops/collect-gsc.mjs", "--days", "28"]));

step(3, "Collecting GA4");
await quiet("GA4", () => run("node", ["ops/collect-ga4.mjs"]));

// ---- Gate 2: the circuit breaker ---------------------------------------
step(4, "Circuit breaker");
const files = await readdir(dataDir).catch(() => []);
const snapshots = files.filter((f) => f.startsWith("gsc-")).sort();
let breaker = { tripped: null, confidence: "unknown", reason: "not enough history yet" };
if (snapshots.length >= 2) {
  const [prev, curr] = await Promise.all(
    snapshots.slice(-2).map(async (f) => JSON.parse(await readFile(dataDir + f, "utf8"))),
  );
  breaker = circuitBreaker(curr.totals, prev.totals);
}
if (breaker.tripped) {
  console.log(`  TRIPPED: ${breaker.tripped}`);
  await writeReport({ date: today, breaker: breaker.tripped });
  console.log(`\nReport written to ops/reports/${today}.md — no changes made.`);
  process.exit(0);
}
console.log(`  Within tolerance — ${breaker.reason}.`);

// A site too quiet to read is not a site that is fine; it is a site where harm
// would be invisible. That restricts what may ship, it does not stop the run.
const snapshotExists = await hasSnapshot(client);
const snapshot = client ? null : await readSnapshot();
if (!snapshotExists) {
  console.log("  No snapshot of the original site — wording changes are held until there is one.");
} else if (snapshot?.reason) {
  console.log(`  Restore: ${snapshot.reason}.`);
}
// What the snapshot cannot do is worth reading on an ordinary Tuesday rather than
// during an outage, so it is printed on every run instead of filed in a JSON key.
for (const limitation of snapshot?.limitations ?? []) {
  console.log(`  ⚠️  ${limitation}`);
}

// ---- Build, crawl, analyse ---------------------------------------------
step(5, "Building and crawling");
await run("npm", ["run", "build"]);
console.log("  " + (await run("node", ["ops/crawl.mjs"])));
await quiet("Speed", () => run("node", ["ops/collect-speed.mjs"]));

// Only the migration check knows the site used to be something else, and on a
// rebuild that is where the biggest losses hide. It costs one pass over the
// baseline URLs and changes nothing.
await quiet("Migration check", () => run("node", ["ops/check-migration.mjs"]));

step(6, "Analysing");
console.log("  " + (await run("node", ["ops/analyse.mjs"])).split("\n").join("\n  "));

const { findings } = JSON.parse(await readFile(dataDir + "findings.json", "utf8"));

// ---- Gate 3: the policy layer ------------------------------------------
step(7, "Applying policy");
const plan = await planRun(findings, {
  confidence: breaker.confidence,
  hasSnapshot: snapshotExists,
  client,
});
// A named client whose record will not load means the frozen list is unknown, and
// the frozen list is what protects the customer's own writing.
if (fleet.broken) {
  plan.held = [...(plan.held ?? []), `the client record at ${fleet.path} will not load, so the pages the customer wrote are unknown`];
  plan.refused = [...plan.refused, ...plan.notify.map((f) => ({ ...f, reason: plan.held.at(-1) }))];
  plan.notify = [];
}
console.log(
  `  ${plan.auto.length} to fix quietly, ${plan.notify.length} to fix and email the same day, ` +
    `${plan.decide.length} for the customer to decide, ${plan.refused.length} deferred or refused`,
);
if (!aiConfig.draftingEnabled) console.log("  Drafting is off — content fixers will decline.");
for (const reason of plan.held ?? []) console.log(`  HELD: ${reason}`);

// ---- Apply --------------------------------------------------------------
step(8, dryRun ? "Dry run — not applying" : `Fixing (${aiConfig.model})`);
const applied = [
  ...(await applyFindings(plan.auto, { dryRun })).map((r) => ({ ...r, notifyClass: "auto" })),
  ...(await applyFindings(plan.notify, { dryRun })).map((r) => ({ ...r, notifyClass: "notify" })),
];
for (const r of applied) {
  console.log(`  ${r.applied ? `✅ ${r.summary}` : `⏭️  ${r.finding.title.slice(0, 60)} — ${r.reason}`}`);
}

// ---- Gate 4: verification before anything is published ------------------
let verification = null;
const changed = applied.filter((r) => r.applied);

if (changed.length) {
  step(9, "Verifying the build before publishing");
  try {
    await run("npm", ["run", "build"]);
    verification = await run("npm", ["run", "verify"]);
    console.log("  " + verification.split("\n").pop());
  } catch (e) {
    console.log("  VERIFICATION FAILED — rolling back the working tree.");
    await run("git", ["checkout", "--", "src/", "public/"]);
    await run("git", ["clean", "-fd", "src/content/"]);
    await writeReport({ date: today, plan, applied, verification: String(e.stdout ?? e.message) });
    process.exit(1);
  }

  // The public record. Written after verification so a change that never shipped
  // is never listed as though it did.
  step(10, "Recording what changed");
  for (const change of changed) {
    const entry = await writeChangelogEntry(change, { date: today });
    change.files = [...(change.files ?? []), entry.file];
    console.log(`  ${entry.file}`);
  }
  await run("npm", ["run", "build"]);

  if (push) {
    step(11, "Publishing");
    const summary = changed.map((r) => r.summary).join("; ");
    await run("git", ["add", ...changed.flatMap((r) => r.files ?? []), "ops/data/freeze.json"]);
    await run("git", [
      "commit",
      "-m",
      `autopilot: ${summary}\n\nShipped unattended under the published change taxonomy.\nRevert with: git revert --no-edit HEAD`,
    ]);
    await run("git", ["push"]);
    console.log("  Pushed. Deployment will follow from the pipeline.");
  } else {
    console.log("\n  Changes are in the working tree but not published (--no-push).");
  }
}

// ---- Tell the customer --------------------------------------------------
// This is what replaced asking permission, so it is not optional and it is not
// best-effort: an undelivered notice stays queued and is retried tomorrow.
step(12, "Telling the customer");
for (const change of changed) {
  await queueNotice({
    class: change.notifyClass,
    capability: change.finding.capability?.id ?? change.finding.capability,
    title: change.summary,
    detail: change.rationale ?? change.finding.detail,
    target: change.target ?? null,
    before: change.before ?? null,
    after: change.after ?? null,
    hypothesis: change.hypothesis ?? null,
  });
}
for (const item of plan.decide) {
  await queueNotice({
    class: "decide",
    capability: item.capability?.id ?? item.capability,
    title: item.title,
    detail: item.detail,
    target: item.target ?? null,
    reason: item.reason,
  });
}

const delivery = await flushNotices({ send: mailNotice, dryRun, client });
if (delivery.dryRun) {
  console.log(
    `  Would send ${delivery.instant.length} same-day notice(s)` +
      (delivery.digest ? ` and a digest of ${delivery.digest.length}` : " and no digest"),
  );
} else {
  console.log(
    `  ${delivery.instant.length} same-day notice(s) sent` +
      (delivery.digest ? `, digest of ${delivery.digest.length} sent` : `, digest not due (${notifyConfig.cadence})`),
  );
  for (const f of delivery.failures) {
    console.log(`  ⚠️  not delivered, still queued: ${f.reason}`);
  }
  for (const s of delivery.stuck ?? []) {
    console.log(`  ⛔ giving up after repeated failures, still owed: "${s.title}" — ${s.last_error}`);
  }
}

// ---- Report -------------------------------------------------------------
const latest = snapshots.length ? JSON.parse(await readFile(dataDir + snapshots.at(-1), "utf8")) : null;
await writeReport({
  date: today,
  plan,
  applied,
  verification,
  delivery,
  signal: breaker,
  snapshot,
  metrics: latest
    ? { ...latest.totals, window: `${latest.window.startDate} → ${latest.window.endDate}` }
    : null,
});
console.log(`\nReport written to ops/reports/${today}.md`);
