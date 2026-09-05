/**
 * Writes the human-readable run report. This is what a person actually reads:
 * what changed, what was refused and why, and what is waiting for approval.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));

export async function writeReport({ date, halted, breaker, plan, applied, metrics, verification }) {
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

  if (plan) {
    L(`## What the system decided`);
    L();
    L(`- **${plan.auto.length}** change(s) cleared to ship unattended`);
    L(`- **${plan.propose.length}** finding(s) need your approval`);
    L(`- **${plan.refused.length}** refused or deferred`);
    L();

    if (applied?.length) {
      L(`### Shipped`);
      L();
      for (const r of applied) {
        L(r.applied
          ? `- ✅ ${r.summary} — \`${r.finding.capability}\``
          : `- ⏭️ Skipped: ${r.finding.title} — ${r.reason}`);
      }
      L();
    }

    if (plan.propose.length) {
      L(`### Waiting for your approval`);
      L();
      L(`These change what the site says, so they do not ship without a human.`);
      L();
      for (const f of plan.propose.slice(0, 10)) {
        L(`- **${f.title}**`);
        L(`  ${f.detail}`);
        if (f.draft?.blocked) {
          L(`  > Needs you first: ${f.draft.blocked}`);
        } else if (f.draft) {
          L(`  > **Proposed:** ${f.draft.proposal}`);
          L(`  > **Why:** ${f.draft.rationale}`);
          L(`  > **We expect:** ${f.draft.hypothesis}`);
        }
        L(`  <sub>${f.capability.change} · ${f.capability.autonomy}</sub>`);
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
