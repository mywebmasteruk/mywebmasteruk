/**
 * The public record of what the loop did.
 *
 * The changelog is published, so an entry must not describe a method we do not
 * run. The untouched-pages comparison was dropped by the owner on 11 September 2026.
 */
import { suite, check } from "./harness.mjs";
import { changelogEntry } from "../lib/changelog.mjs";

const change = { summary: "Rewrote the Google headline on /answers/x/", target: "/answers/x/", changeType: "metadata", notifyClass: "notify" };
const date = "2026-09-11";

suite("changelog — no comparison is claimed");

let e = changelogEntry(change, { date });
check("the fallback does not say 'left alone'", !/left alone/i.test(e.hypothesis));
check("nor 'untouched', 'control group' or 'holdout'", !/untouched|control group|holdout/i.test(e.hypothesis));
check("it says only that it was recorded first", /recorded before the result was known/i.test(e.hypothesis));
check("the frontmatter carries no holdout field", !/holdout/i.test(e.body));

e = changelogEntry(change, { date, controlled: true });
check("a stale caller still passing controlled gets no claim", !/left alone|untouched|control group/i.test(e.hypothesis));

e = changelogEntry({ ...change, hypothesis: "Shorter titles should lift clicks because the ending stops being cut." }, { date });
check("a real hypothesis is used as written", e.hypothesis.startsWith("Shorter titles should lift clicks"));

suite("changelog — the entry itself");

check("the title fits the 90-character budget",
  changelogEntry({ ...change, summary: "x".repeat(200) }, { date }).title.length <= 90);
check("a too-short title is padded to the 10-character floor",
  changelogEntry({ ...change, summary: "Fix" }, { date }).title.length >= 10);
check("a same-day duplicate gets its own slug",
  changelogEntry(change, { date, existing: [`${date}-rewrote-the-google-headline-on-answers-x.mdx`] }).slug.endsWith("-2"));
check("a same-site notify change is recorded as notified",
  changelogEntry(change, { date }).body.includes('autonomy: "notified"'));
check("a mechanical change is recorded as auto",
  changelogEntry({ ...change, notifyClass: "auto" }, { date }).body.includes('autonomy: "auto"'));
check("before and after appear only when both exist",
  !changelogEntry({ ...change, before: "old" }, { date }).body.includes("**Before**") &&
  changelogEntry({ ...change, before: "old", after: "new" }, { date }).body.includes("**After**"));
check("a quote inside a summary cannot break the frontmatter",
  changelogEntry({ ...change, summary: 'Answered "What does a webmaster do?" on /answers/x/' }, { date }).body.includes('title: "Answered \\"What does a webmaster do?\\" on /answers/x/"'));
check("the outcome starts pending, never pre-judged", changelogEntry(change, { date }).body.includes('outcome: "pending"'));
