/**
 * Writes the public record of what the loop did.
 *
 * The site footer says every change Autopilot makes is listed on /changelog/.
 * That sentence is only true if this runs, so it runs for every applied change —
 * including the ones that are dull, and especially the ones that turn out badly.
 *
 * The hypothesis is recorded *before* the outcome is known, which is the whole
 * point: a prediction written after the result is not a prediction.
 */
import { writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const DIR = fileURLToPath(new URL("../../src/content/changelog/", import.meta.url));

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60)
    .replace(/-$/, "");

/** Schema budgets, restated so a bad entry fails here rather than at build time. */
const clamp = (s, min, max, pad) => {
  let out = String(s ?? "").trim();
  if (out.length > max) out = `${out.slice(0, max - 1).trimEnd()}…`;
  if (out.length < min) out = `${out}${out ? " " : ""}${pad}`.slice(0, max);
  return out;
};

/**
 * @param {object} change  one entry from applyFindings(), already verified
 * @param {string} [commit]  SHA, filled in after the commit exists
 */
export async function writeChangelogEntry(change, { date = new Date().toISOString().slice(0, 10) } = {}) {
  const title = clamp(change.summary, 10, 90, "— an automatic change");
  const hypothesis = clamp(
    change.hypothesis ||
      change.rationale ||
      `${change.summary}. Recorded before the result was known, and measured against pages left untouched.`,
    40,
    400,
    "Measured against pages deliberately left alone.",
  );

  const existing = await readdir(DIR).catch(() => []);
  let slug = `${date}-${slugify(change.summary)}`;
  let n = 2;
  while (existing.includes(`${slug}.mdx`)) slug = `${date}-${slugify(change.summary)}-${n++}`;

  const targets = change.target ? [change.target] : (change.files ?? ["/"]);

  const body = [
    "---",
    `date: ${date}`,
    `title: ${JSON.stringify(title)}`,
    `hypothesis: ${JSON.stringify(hypothesis)}`,
    `targets: ${JSON.stringify(targets)}`,
    `changeType: ${JSON.stringify(change.changeType ?? "content")}`,
    `autonomy: ${JSON.stringify(change.notifyClass === "notify" ? "notified" : "auto")}`,
    `outcome: "pending"`,
    "holdout: false",
    "---",
    "",
    change.rationale ? `${change.rationale}\n` : "",
    change.before && change.after
      ? [
          "**Before**",
          "",
          "```",
          change.before,
          "```",
          "",
          "**After**",
          "",
          "```",
          change.after,
          "```",
          "",
        ].join("\n")
      : "",
    `Shipped unattended under the published change taxonomy. The result is recorded here`,
    `once the measurement window closes, whichever way it goes.`,
    "",
  ]
    .filter((s) => s !== "")
    .join("\n");

  await writeFile(`${DIR}${slug}.mdx`, body);
  return { file: `src/content/changelog/${slug}.mdx`, slug };
}
