/**
 * The daily run. Orchestrates the whole cycle and refuses to proceed past any gate.
 *
 *   node ops/loop.mjs              # observe and report, change nothing (default)
 *   node ops/loop.mjs --write      # allow the cleared safe class to ship
 *   node ops/loop.mjs --write --push  # ...and commit and push it
 *
 * Defaulting to read-only matters: an operator who forgets a flag gets a report,
 * not a surprise deployment.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { planRun, isHalted, circuitBreaker } from "./lib/policy.mjs";
import { applyFindings } from "./apply.mjs";
import { writeReport } from "./report.mjs";
import { draftChange, aiConfig } from "./lib/ai.mjs";

const exec = promisify(execFile);
const CWD = fileURLToPath(new URL("../", import.meta.url));
const dataDir = fileURLToPath(new URL("./data/", import.meta.url));

const write = process.argv.includes("--write");
const push = process.argv.includes("--push");
const today = new Date().toISOString().slice(0, 10);

const run = async (cmd, args) => {
  const { stdout, stderr } = await exec(cmd, args, { cwd: CWD, maxBuffer: 10 * 1024 * 1024 });
  return (stdout + stderr).trim();
};
const step = (n, msg) => console.log(`\n[${n}] ${msg}`);

// ---- Gate 1: the kill switch -------------------------------------------
step(1, "Checking kill switch");
const halted = await isHalted();
if (halted) {
  console.log(`  HALTED: ${halted}`);
  await writeReport({ date: today, halted });
  console.log(`\nReport written to ops/reports/${today}.md`);
  process.exit(0);
}
console.log("  Clear.");

// ---- Collect ------------------------------------------------------------
step(2, "Collecting Search Console");
try {
  console.log("  " + (await run("node", ["ops/collect-gsc.mjs", "--days", "28"])));
} catch (e) {
  console.log(`  Search Console collection failed: ${String(e.message).slice(0, 200)}`);
}

step(3, "Collecting GA4");
try {
  console.log("  " + (await run("node", ["ops/collect-ga4.mjs"])));
} catch (e) {
  console.log(`  GA4 collection skipped: ${String(e.message).slice(0, 200)}`);
}

// ---- Gate 2: the circuit breaker ---------------------------------------
step(4, "Circuit breaker");
const files = await readdir(dataDir).catch(() => []);
const snapshots = files.filter((f) => f.startsWith("gsc-")).sort();
let breaker = null;
if (snapshots.length >= 2) {
  const [prev, curr] = await Promise.all(
    snapshots.slice(-2).map(async (f) => JSON.parse(await readFile(dataDir + f, "utf8"))),
  );
  breaker = circuitBreaker(curr.totals, prev.totals);
}
if (breaker) {
  console.log(`  TRIPPED: ${breaker}`);
  await writeReport({ date: today, breaker });
  console.log(`\nReport written to ops/reports/${today}.md — no changes made.`);
  process.exit(0);
}
console.log(snapshots.length >= 2 ? "  Within tolerance." : "  Not enough history yet — skipped.");

// ---- Build, crawl, analyse ---------------------------------------------
step(5, "Building and crawling");
await run("npm", ["run", "build"]);
console.log("  " + (await run("node", ["ops/crawl.mjs"])));

console.log("  " + (await run("node", ["ops/collect-speed.mjs"])));

step(6, "Analysing");
console.log("  " + (await run("node", ["ops/analyse.mjs"])).split("\n").join("\n  "));

const { findings } = JSON.parse(await readFile(dataDir + "findings.json", "utf8"));

// ---- Gate 3: the policy layer ------------------------------------------
step(7, "Applying policy");
const plan = await planRun(findings);
console.log(`  ${plan.auto.length} cleared to ship, ${plan.propose.length} need approval, ${plan.refused.length} refused`);

// ---- Draft the proposals so a human has something concrete to approve ----
step(8, aiConfig.draftingEnabled ? `Drafting proposals with ${aiConfig.model}` : "Drafting disabled");
if (aiConfig.draftingEnabled) {
  for (const finding of plan.propose.slice(0, 5)) {
    try {
      finding.draft = await draftChange(finding, { domain: "mywebmaster.co.uk" });
      console.log(`  ${finding.draft ? "drafted" : "no draft"}: ${finding.title.slice(0, 62)}`);
    } catch (e) {
      // A drafting failure must never stop the run — the finding still reports.
      console.log(`  drafting unavailable (${String(e.message).slice(0, 80)})`);
      break;
    }
  }
}

// ---- Apply --------------------------------------------------------------
step(9, write ? "Applying cleared changes" : "Dry run (pass --write to apply)");
const applied = await applyFindings(plan.auto, { dryRun: !write });
for (const r of applied) {
  console.log(`  ${r.applied ? "✅ " + r.summary : "⏭️  " + r.finding.title + " — " + r.reason}`);
}

// ---- Gate 4: verification before anything is published ------------------
let verification = null;
const changed = applied.filter((r) => r.applied);
if (changed.length) {
  step(10, "Verifying the build before publishing");
  try {
    await run("npm", ["run", "build"]);
    verification = await run("npm", ["run", "verify"]);
    console.log("  " + verification.split("\n").pop());
  } catch (e) {
    console.log("  VERIFICATION FAILED — rolling back the working tree.");
    await run("git", ["checkout", "--", "src/"]);
    await writeReport({ date: today, plan, applied, verification: String(e.stdout ?? e.message) });
    process.exit(1);
  }

  if (push) {
    step(11, "Committing and pushing");
    const summary = changed.map((r) => r.summary).join("; ");
    const files = changed.flatMap((r) => r.files ?? []);
    await run("git", ["add", ...files, "ops/data/freeze.json"]);
    await run("git", [
      "commit",
      "-m",
      `autopilot: ${summary}\n\nShipped unattended under the published safe class.\nRevert with: git revert --no-edit HEAD`,
    ]);
    await run("git", ["push"]);
    console.log("  Pushed. Deployment will follow from the pipeline.");
  } else {
    console.log("\n  Changes are in the working tree but not committed (pass --push).");
  }
}

// ---- Report -------------------------------------------------------------
const latest = snapshots.length ? JSON.parse(await readFile(dataDir + snapshots.at(-1), "utf8")) : null;
await writeReport({
  date: today,
  plan,
  applied,
  verification,
  metrics: latest
    ? { ...latest.totals, window: `${latest.window.startDate} → ${latest.window.endDate}` }
    : null,
});
console.log(`\nReport written to ops/reports/${today}.md`);
