/**
 * Writes the human-readable run report. This is what a person actually reads:
 * what changed, what was refused and why, and what is the customer's to decide.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));

export async function writeReport({ date, halted, breaker, signal, plan, applied, metrics, verification, delivery, snapshot }) {
  const lines = [];
  const L = (s = "") => lines.push(s);

  L(`# Autopilot run — ${date}`);
  L();

  if (halted) {
    L(`## HALTED`);
    L();
    L(`No autonomous activity this run: **${halted}**`);
    L();
    L(`Nothing was changed. Remove the halt condition to resume.`);
  }

  if (breaker) {
    L(`## Circuit breaker tripped`);
    L();
    L(`**${breaker}**`);
    L();
    L(`Autonomous releases are suspended until a human reviews this. If the drop followed a`);
    L(`recent change, revert it with the command at the bottom of this report.`);
    L();
  }

  if (metrics) {
    L(`## Where the site stands`);
    L();
    L(`| Metric | Value | Window |`);
    L(`| --- | --- | --- |`);
    L(`| Clicks | ${metrics.clicks} | ${metrics.window} |`);
    L(`| Impressions | ${metrics.impressions} | ${metrics.window} |`);
    L(`| Click-through | ${metrics.ctr}% | ${metrics.window} |`);
    L(`| Average position | ${metrics.position} | ${metrics.window} |`);
    L();
  }

  if (snapshot?.limitations?.length) {
    L(`## What the restore promise cannot do`);
    L();
    L(`The snapshot exists — ${snapshot.reason}. These are its limits, repeated every`);
    L(`run because the moment anyone needs them is the moment nobody has time to read.`);
    L();
    for (const limitation of snapshot.limitations) L(`- ${limitation}`);
    L();
  }

  if (signal) {
    L(`## Could harm have been detected?`);
    L();
    L(signal.confidence === "none"
      ? `**No.** ${signal.reason}. Mechanical repairs still ship; anything that changes the words on a page is held until there is enough traffic to notice a regression.`
      : `Yes — ${signal.reason}. The strongest readable signal is **${signal.confidence}**.`);
    L();
  }

  if (plan) {
    L(`## What the system decided`);
    L();
    L(`- **${plan.auto.length}** fixed quietly, reported in the next digest`);
    L(`- **${plan.notify.length}** changed and emailed to the customer the same day`);
    L(`- **${plan.decide.length}** left for the customer to decide — out of bounds for us`);
    L(`- **${plan.refused.length}** refused or deferred to the next run`);
    L();
    for (const reason of plan.held ?? []) {
      L(`> **Wording changes are held:** ${reason}`);
      L();
    }

    if (applied?.length) {
      L(applied.some((r) => r.applied) ? `### Shipped` : `### Attempted, nothing shipped`);
      L();
      for (const r of applied) {
        const cap = r.finding.capability?.id ?? r.finding.capability;
        L(r.applied
          ? `- ✅ ${r.summary} — \`${cap}\`${r.notifyClass === "notify" ? " (customer emailed)" : ""}`
          : `- ⏭️ Skipped: ${r.finding.title} — ${r.reason}`);
      }
      L();
    }

    if (plan.decide.length) {
      L(`### Yours to decide`);
      L();
      L(`The evidence points at these, and they are the categories we will never`);
      L(`change on anyone's behalf. They are sent to the customer as recommendations.`);
      L();
      for (const f of plan.decide.slice(0, 10)) {
        L(`- **${f.title}**`);
        L(`  ${f.detail}`);
        L(`  <sub>${f.capability?.change ?? f.capability} · ${f.reason}</sub>`);
      }
      L();
    }

    if (plan.refused.length) {
      L(`### Refused or deferred`);
      L();
      for (const f of plan.refused.slice(0, 10)) {
        L(`- ${f.title} — _${f.reason}_`);
      }
      L();
    }
  }

  if (delivery) {
    L(`## What the customer was told`);
    L();
    if (delivery.dryRun) {
      L(`Dry run — nothing sent.`);
    } else {
      L(`- ${delivery.instant.length} same-day notice(s) delivered`);
      L(`- ${delivery.digest ? `digest of ${delivery.digest.length} change(s) delivered` : "digest not due"}`);
      for (const f of delivery.failures ?? []) {
        L(`- ⚠️ **Undelivered, still queued:** ${f.reason}`);
      }
    }
    L();
  }

  if (verification) {
    L(`## Verification`);
    L();
    L(`\`\`\`\n${verification.trim()}\n\`\`\``);
    L();
  }

  L(`## If anything here is wrong`);
  L();
  L(`Every change above is a single commit. To undo the most recent one:`);
  L();
  L("```bash");
  L("git revert --no-edit HEAD && git push");
  L("```");
  L();
  L(`To stop all autonomous activity immediately:`);
  L();
  L("```bash");
  L("touch ops/HALT && git add ops/HALT && git commit -m 'halt autopilot' && git push");
  L("```");
  L();

  const body = lines.join("\n");
  await mkdir(root("ops/reports"), { recursive: true });
  await writeFile(root(`ops/reports/${date}.md`), body);
  return body;
}
