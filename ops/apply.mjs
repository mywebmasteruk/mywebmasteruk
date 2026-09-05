/**
 * Applies findings that the policy layer cleared for unattended shipping.
 *
 * Every fixer edits *content frontmatter*, never page code, so the collection schema
 * validates the result at build time. A fixer that has no implementation downgrades the
 * finding to a proposal rather than guessing — silence is safer than improvisation.
 */
import { readFile, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { freezePage } from "./lib/policy.mjs";

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));

/** Registry of fixers, keyed by capability id from the published taxonomy. */
const fixers = {
  /**
   * Links an orphaned answer page from the most topically similar sibling by adding
   * it to that sibling's `related` array. Bounded: one link added per run per page.
   */
  "internal-links": async (finding) => {
    const match = finding.target?.match(/^\/answers\/([^/]+)\/$/);
    if (!match) return { applied: false, reason: "only answer pages are linkable automatically" };
    const orphanSlug = match[1];

    const dir = root("src/content/answers");
    const files = (await readdir(dir)).filter((f) => f.endsWith(".mdx"));
    const orphanFile = files.find((f) => f === `${orphanSlug}.mdx`);
    if (!orphanFile) return { applied: false, reason: "source file not found" };

    const orphan = await readFile(`${dir}/${orphanFile}`, "utf8");
    const topic = orphan.match(/^topic: "(.+)"$/m)?.[1];

    for (const file of files) {
      if (file === orphanFile) continue;
      const text = await readFile(`${dir}/${file}`, "utf8");
      if (text.match(/^topic: "(.+)"$/m)?.[1] !== topic) continue;
      const relatedLine = text.match(/^related: \[(.*)\]$/m);
      if (!relatedLine || relatedLine[1].includes(orphanSlug)) continue;

      const updated = text.replace(
        /^related: \[(.*)\]$/m,
        `related: [${relatedLine[1]}, "${orphanSlug}"]`,
      );
      await writeFile(`${dir}/${file}`, updated);
      return {
        applied: true,
        files: [`src/content/answers/${file}`],
        summary: `Linked ${finding.target} from /answers/${file.replace(/\.mdx$/, "")}/`,
      };
    }
    return { applied: false, reason: "no sibling page on the same topic had room for another link" };
  },
};

export async function applyFindings(findings, { dryRun = true } = {}) {
  const results = [];
  for (const finding of findings) {
    const fixer = fixers[finding.capability];
    if (!fixer) {
      results.push({
        finding,
        applied: false,
        downgraded: true,
        reason: `no fixer implemented for "${finding.capability}" — downgraded to a proposal`,
      });
      continue;
    }
    if (dryRun) {
      results.push({ finding, applied: false, dryRun: true, reason: "dry run" });
      continue;
    }
    const outcome = await fixer(finding);
    if (outcome.applied && finding.target) await freezePage(finding.target);
    results.push({ finding, ...outcome });
  }
  return results;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { findings } = JSON.parse(await readFile(root("ops/data/findings.json"), "utf8"));
  const dryRun = !process.argv.includes("--write");
  const results = await applyFindings(findings.slice(0, 3), { dryRun });
  console.log(JSON.stringify(results, null, 2));
}
