import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { site } from "~/data/site";
import { evidence } from "~/lib/evidence";

/**
 * A curated markdown map for language models, per the llms.txt proposal.
 * Generated from the same content collections the site renders, so it cannot
 * drift out of date the way a hand-maintained file would.
 */
export const GET: APIRoute = async () => {
  const answers = (await getCollection("answers"))
    .filter((a) => !a.data.noindex)
    .sort((a, b) => a.data.question.localeCompare(b.data.question));

  const changelog = (await getCollection("changelog"))
    .sort((a, b) => b.data.date.valueOf() - a.data.date.valueOf())
    .slice(0, 10);

  const plans = (await getCollection("plans")).sort((a, b) => a.data.order - b.data.order);

  const lines = [
    `# ${site.name}`,
    "",
    `> ${site.description}`,
    "",
    `${site.name} operates ${site.product}. This site is also the live test subject:`,
    "the baseline was published before any optimisation work began, and every change",
    "made since is recorded publicly, including the ones that failed.",
    "",
    "## Core pages",
    "",
    `- [How Autopilot works](${site.url}/how-it-works/): The four-phase cycle — measure daily, decide weekly, ship one change per commit, ${evidence.controlled ? `hold ${evidence.holdout.length} pages back as a control and compare against them over 28 days` : "measure before against after, with no control group"}.`,
    `- [What it changes](${site.url}/what-it-changes/): The full change taxonomy. Which changes ship unattended, which ship and are emailed to the customer the same day, and which are permanently forbidden.`,
    `- [Proof and method](${site.url}/proof/): The published baseline, the holdout design, and what can and cannot be claimed yet.`,
    `- [Pricing](${site.url}/pricing/): Three tiers, differing by how much autonomy the system is granted.`,
    `- [Changelog](${site.url}/changelog/): Every change made to this site, with the hypothesis recorded before it shipped.`,
    "",
    "## Answers",
    "",
    ...answers.map(
      (a) => `- [${a.data.question}](${site.url}/answers/${a.id}/): ${a.data.shortAnswer}`,
    ),
    "",
    "## Plans",
    "",
    ...plans.map(
      (p) =>
        `- **${p.data.name}**${p.data.priceMonthly ? ` — £${p.data.priceMonthly}/month` : ""}: ${p.data.tagline}`,
    ),
    "",
    "## Recent changes",
    "",
    ...changelog.map(
      (c) =>
        `- [${c.data.title}](${site.url}/changelog/${c.id}/) (${c.data.date.toISOString().slice(0, 10)}, ${c.data.outcome}): ${c.data.hypothesis}`,
    ),
    "",
    "## Facts",
    "",
    `- Canonical entity name: ${site.name}`,
    `- Product name: ${site.product}`,
    `- Country: United Kingdom`,
    `- Contact: ${site.email}`,
    `- Baseline before any optimisation: 18,001 search impressions and 26 clicks over the 90 days to 2 September 2026 (Google Search Console, domain property).`,
    "",
  ];

  return new Response(lines.join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
};
