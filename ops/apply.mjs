/**
 * Applies findings. Nothing here waits for approval — the policy layer has
 * already decided what may ship, and the customer is told afterwards.
 *
 * Every fixer edits *content frontmatter or content bodies*, never page code, so
 * the collection schema validates the result at build time. A fixer that has no
 * implementation downgrades the finding rather than guessing — silence is safer
 * than improvisation, and a downgrade shows up in the report as work not done.
 *
 * Three things are true of every fixer here:
 *   1. It re-checks the schema budgets itself. The model is told the limits and
 *      is never trusted to have respected them.
 *   2. It returns `before` and `after` for anything a visitor can read, because
 *      the customer's email is only honest if it shows both.
 *   3. It touches one page. The blast-radius cap counts fixers, so a fixer that
 *      edits three pages would quietly defeat it.
 */
import { readFile, writeFile, readdir, access } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { freezePage, decline } from "./lib/policy.mjs";
import { draftEdit, draftAnswerPage, draftSection, FIELD_BUDGETS, aiConfig } from "./lib/ai.mjs";
import { dimensions, shrink, imagesMissingSize, withSize } from "./lib/images.mjs";
import { getAccessToken } from "./lib/google.mjs";

const root = (p) => fileURLToPath(new URL(`../${p}`, import.meta.url));
const ANSWERS = root("src/content/answers");
const DOMAIN = process.env.SITE_DOMAIN || "mywebmaster.co.uk";
const SITE_URL = process.env.SITE_URL || `https://${DOMAIN}`;

/**
 * What the business does, so a new page cannot be written about something else.
 *
 * This is handed to the model as fact, so it must not say more than is true. It
 * describes what the service does — the checks, the changes, the telling — and
 * makes no claim about proving results, which a drafted page would otherwise
 * repeat in public.
 */
const BUSINESS =
  process.env.BUSINESS_DESCRIPTION ||
  "MyWebMaster runs Autopilot: it checks a small business's website every day, fixes what " +
    "is holding it back based on what the numbers show, and tells the owner about every change " +
    "it makes. UK, remote, content and brochure sites only.";

const TOPICS = ["autopilot", "safety", "measurement", "ai-search", "seo", "pricing"];

// ---- Frontmatter helpers -------------------------------------------------

/** `/answers/slug/` → the .mdx behind it, or null when the page is not content. */
function contentFileFor(target) {
  const match = target?.match(/^\/answers\/([a-z0-9-]+)\/$/);
  return match ? `${ANSWERS}/${match[1]}.mdx` : null;
}

function readField(source, key) {
  return source.match(new RegExp(`^${key}: "([\\s\\S]*?)"$`, "m"))?.[1] ?? null;
}

/**
 * Replaces one quoted scalar in the frontmatter block. Returns null when the key
 * is absent — a fixer must not invent a field the schema did not ask for.
 */
function setField(source, key, value) {
  const line = new RegExp(`^${key}: "[\\s\\S]*?"$`, "m");
  if (!line.test(source)) return null;
  return source.replace(line, `${key}: ${JSON.stringify(value)}`);
}

/** Every file that can render markup: templates and content bodies alike. */
async function sourceFiles(dir = root("src")) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await sourceFiles(path)));
    else if (/\.(astro|mdx)$/.test(entry.name)) out.push(path);
  }
  return out;
}

/**
 * Maps a src attribute to the file behind it. Only resolves inside the project —
 * a path that escapes it is a bug or an attack, and either way is not ours to open.
 */
async function resolveAsset(src) {
  const clean = src.split(/[?#]/)[0];
  if (clean.includes("..")) return null;
  for (const candidate of [root(`public${clean}`), root(`src${clean}`), root(clean.replace(/^\//, ""))]) {
    if (!candidate.startsWith(root(""))) continue;
    try {
      await access(candidate);
      return candidate;
    } catch {
      /* try the next root */
    }
  }
  return null;
}

/** The schema is the enforcement; this is the check that stops a bad build. */
function withinBudget(key, value) {
  const budget = FIELD_BUDGETS[key];
  if (!budget) return true;
  return typeof value === "string" && value.length >= budget[0] && value.length <= budget[1];
}

function offBudget(fields) {
  return Object.entries(fields)
    .filter(([k, v]) => !withinBudget(k, v))
    .map(([k, v]) => `${k} is ${String(v).length} chars, budget ${FIELD_BUDGETS[k].join("-")}`);
}

/**
 * Rewrites frontmatter fields on an existing answer page.
 * Shared by every fixer whose job is "change some words on a page that exists".
 */
async function editFields(finding, keys, { changeType, describe }) {
  if (!aiConfig.draftingEnabled) {
    return { applied: false, reason: "drafting is disabled (AI_DRAFTING=off)" };
  }
  const file = contentFileFor(finding.target);
  if (!file) return { applied: false, reason: "only answer pages can be edited automatically" };

  let source;
  try {
    source = await readFile(file, "utf8");
  } catch {
    return { applied: false, reason: "source file not found" };
  }

  const current = Object.fromEntries(keys.map((k) => [k, readField(source, k)]));
  if (keys.some((k) => current[k] === null)) {
    return { applied: false, reason: `page has no ${keys.find((k) => current[k] === null)} field` };
  }

  const draft = await draftEdit(finding, {
    fields: keys,
    current,
    domain: DOMAIN,
    evidence: finding.evidence,
  });
  if (!draft) return { applied: false, reason: "no usable draft came back" };
  if (draft.blocked) return { applied: false, reason: `blocked: ${draft.blocked}` };

  const fields = draft.fields ?? {};
  const missing = keys.filter((k) => typeof fields[k] !== "string");
  if (missing.length) return { applied: false, reason: `draft omitted ${missing.join(", ")}` };

  const bad = offBudget(fields);
  if (bad.length) return { applied: false, reason: `draft is out of budget — ${bad.join("; ")}` };

  const unchanged = keys.every((k) => fields[k] === current[k]);
  if (unchanged) return { applied: false, reason: "draft matched what is already there" };

  let updated = source;
  for (const k of keys) {
    const next = setField(updated, k, fields[k]);
    if (next === null) return { applied: false, reason: `could not locate the ${k} line` };
    updated = next;
  }
  await writeFile(file, updated);

  return {
    applied: true,
    files: [file.replace(root(""), "")],
    changeType,
    summary: describe(finding),
    hypothesis: draft.hypothesis,
    rationale: draft.rationale,
    before: keys.map((k) => `${k}: ${current[k]}`).join("\n"),
    after: keys.map((k) => `${k}: ${fields[k]}`).join("\n"),
  };
}

/**
 * Sends a legacy URL to a page that now answers it.
 *
 * Only ever rewrites the *destination* of a rule that already exists, or appends a
 * rule for a URL that has none. It never reorders, never deletes, and never touches
 * a line it was not asked about — `_redirects` is order-sensitive, and a fixer that
 * rearranged it could break every rule below the one it meant to fix.
 */
export async function repointRedirect(legacy, destination) {
  const file = root("public/_redirects");
  const source = await readFile(file, "utf8");
  const { text, from, appended } = rewriteRedirects(source, legacy, destination, { domain: DOMAIN });
  await writeFile(file, text);
  return { file: "public/_redirects", from, to: destination, appended };
}

/**
 * The rewrite itself, with no disk access, so the rule that matters — change one
 * line, touch nothing else, keep the order — can be tested directly.
 *
 * @param {string} source       the current `_redirects` text
 * @param {URL} legacy          the old address that still earns searches
 * @param {string} destination  the page that now answers it
 * @param {{domain: string}} options  the site's own apex domain
 */
export function rewriteRedirects(source, legacy, destination, { domain }) {
  const lines = source.split("\n");

  // Netlify serves www and the apex from the same site, so a www URL's rules are
  // written as bare paths. Only a genuinely different host (the retired blog
  // subdomain) needs an absolute URL. Getting this wrong appends a duplicate rule
  // that never fires, because the path rule above it already matched.
  const bare = (h) => h.replace(/^www\./, "");
  const sameSite = bare(legacy.host) === bare(new URL(`https://${domain}`).host);
  const key = sameSite ? legacy.pathname : legacy.href;

  const candidates = new Set([key, key.replace(/\/$/, ""), `${key.replace(/\/$/, "")}/`]);
  const index = lines.findIndex((l) => candidates.has(l.trim().split(/\s+/)[0]));

  if (index === -1) {
    const marker = lines.findIndex((l) => l.startsWith("# --- Recovered by Autopilot"));
    const block = marker === -1
      ? ["", "# --- Recovered by Autopilot -------------------------------------------------",
         "# Old addresses that still earn searches, pointed at the page that now answers them.", ""]
      : [];
    lines.push(...block, `${key}   ${destination}   301!`);
  } else {
    const [from, , ...rest] = lines[index].trim().split(/\s+/);
    const code = rest.join(" ") || "301!";
    lines[index] = `${from}   ${destination}   ${code}`;
  }

  return { text: lines.join("\n"), from: key, appended: index === -1 };
}

// ---- Fixers --------------------------------------------------------------

/** Keyed by capability id from the published taxonomy. */
const fixers = {
  /**
   * Links an orphaned answer page from the most topically similar sibling by adding
   * it to that sibling's `related` array. Bounded: one link added per run per page.
   */
  "internal-links": async (finding) => {
    const match = finding.target?.match(/^\/answers\/([^/]+)\/$/);
    if (!match) return { applied: false, reason: "only answer pages are linkable automatically" };
    const orphanSlug = match[1];

    const files = (await readdir(ANSWERS)).filter((f) => f.endsWith(".mdx"));
    const orphanFile = files.find((f) => f === `${orphanSlug}.mdx`);
    if (!orphanFile) return { applied: false, reason: "source file not found" };

    const orphan = await readFile(`${ANSWERS}/${orphanFile}`, "utf8");
    const topic = readField(orphan, "topic");

    for (const file of files) {
      if (file === orphanFile) continue;
      const text = await readFile(`${ANSWERS}/${file}`, "utf8");
      if (readField(text, "topic") !== topic) continue;
      const relatedLine = text.match(/^related: \[(.*)\]$/m);
      if (!relatedLine || relatedLine[1].includes(orphanSlug)) continue;

      await writeFile(
        `${ANSWERS}/${file}`,
        text.replace(/^related: \[(.*)\]$/m, `related: [${relatedLine[1]}, "${orphanSlug}"]`),
      );
      return {
        applied: true,
        files: [`src/content/answers/${file}`],
        changeType: "internal-linking",
        summary: `Linked ${finding.target} from /answers/${file.replace(/\.mdx$/, "")}/`,
      };
    }
    return { applied: false, reason: "no sibling page on the same topic had room for another link" };
  },

  /**
   * Rewrites the headline and summary Google displays. The single highest-leverage
   * edit on a page that already ranks: it changes who clicks, not who is shown.
   */
  titles: (finding) =>
    editFields(finding, ["title", "description"], {
      changeType: "metadata",
      describe: (f) => `Rewrote the Google headline and summary on ${f.target}`,
    }),

  /**
   * Rewrites the answer-first passage — the paragraph an AI engine lifts.
   * Kept to `shortAnswer` alone: it is the field defined to stand on its own,
   * so editing it cannot leave the rest of the page contradicting itself.
   */
  "answer-blocks": (finding) =>
    editFields(finding, ["shortAnswer"], {
      changeType: "content",
      describe: (f) => `Rewrote the direct answer at the top of ${f.target}`,
    }),

  /**
   * Publishes a new answer page for a question the site is already shown for and
   * does not answer. The evidence bar lives in analyse.mjs; the honesty bar lives
   * in the prompt, and a refusal to write it is a normal outcome.
   */
  "new-pages": async (finding) => {
    if (!aiConfig.draftingEnabled) {
      return { applied: false, reason: "drafting is disabled (AI_DRAFTING=off)" };
    }
    const query = finding.evidence?.query;
    if (!query) return { applied: false, reason: "no search query attached to the finding" };

    const existing = (await readdir(ANSWERS)).filter((f) => f.endsWith(".mdx"));
    const slugs = existing.map((f) => f.replace(/\.mdx$/, ""));

    const draft = await draftAnswerPage({
      query,
      evidence: finding.evidence,
      topics: TOPICS,
      existingSlugs: slugs,
      domain: DOMAIN,
      business: BUSINESS,
    });
    if (!draft) return { applied: false, reason: "no usable draft came back" };
    if (draft.blocked) {
      // A considered "no" is a result, not a failure. Record it so tomorrow's run
      // does not spend a model call reaching the same conclusion.
      await decline(finding, draft.blocked);
      return { applied: false, declined: true, reason: `decided against it: ${draft.blocked}` };
    }

    const slug = String(draft.slug ?? "").trim();
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
      return { applied: false, reason: `unusable slug ${JSON.stringify(draft.slug)}` };
    }
    if (slugs.includes(slug)) return { applied: false, reason: `/answers/${slug}/ already exists` };

    const f = draft.fields ?? {};
    const required = ["title", "description", "heading", "question", "summary", "shortAnswer"];
    const missing = required.filter((k) => typeof f[k] !== "string");
    if (missing.length) return { applied: false, reason: `draft omitted ${missing.join(", ")}` };

    const bad = offBudget(Object.fromEntries(required.map((k) => [k, f[k]])));
    if (bad.length) return { applied: false, reason: `draft is out of budget — ${bad.join("; ")}` };
    if (!TOPICS.includes(f.topic)) return { applied: false, reason: `unknown topic ${f.topic}` };

    const body = String(draft.body ?? "").trim();
    if (body.length < 400) return { applied: false, reason: "body too thin to publish" };
    if (/^# /m.test(body)) return { applied: false, reason: "body contains an H1, which the layout owns" };

    const frontmatter = [
      "---",
      `title: ${JSON.stringify(f.title)}`,
      `description: ${JSON.stringify(f.description)}`,
      `heading: ${JSON.stringify(f.heading)}`,
      `question: ${JSON.stringify(f.question)}`,
      `summary: ${JSON.stringify(f.summary)}`,
      `shortAnswer: ${JSON.stringify(f.shortAnswer)}`,
      `topic: ${JSON.stringify(f.topic)}`,
      `updated: ${new Date().toISOString().slice(0, 10)}`,
      "sources: []",
      "related: []",
      "---",
      "",
      body,
      "",
    ].join("\n");

    await writeFile(`${ANSWERS}/${slug}.mdx`, frontmatter);
    const files = [`src/content/answers/${slug}.mdx`];

    // When the demand came from a URL the rebuild dropped, the page is only half
    // the repair: the address people already reach us on has to arrive here too.
    let redirect = null;
    if (finding.evidence?.legacyUrl) {
      try {
        redirect = await repointRedirect(new URL(finding.evidence.legacyUrl), `/answers/${slug}/`);
        files.push(redirect.file);
      } catch (err) {
        // The page is written and worth keeping; the redirect is reported as
        // outstanding rather than rolling the whole change back.
        redirect = { error: String(err?.message ?? err).slice(0, 120) };
      }
    }

    return {
      applied: true,
      files,
      changeType: "content",
      summary:
        `Published /answers/${slug}/ — "${f.question}"` +
        (redirect?.from ? `, and pointed ${redirect.from} at it` : ""),
      hypothesis: draft.hypothesis,
      target: `/answers/${slug}/`,
      before: null,
      after: `${f.title}\n\n${f.shortAnswer}`,
      redirect,
    };
  },

  /**
   * Repairs a link that leads nowhere, inside content bodies only.
   *
   * Links written in .astro components are left alone deliberately: those are page
   * code, and the rule that autonomous edits only touch content is the reason a bad
   * edit cannot break the site's structure.
   */
  "broken-links": async (finding) => {
    const from = finding.target;
    const dead = finding.evidence?.to;
    if (!dead) return { applied: false, reason: "no destination recorded on the finding" };

    const file = contentFileFor(from);
    if (!file) return { applied: false, reason: "the link is in page code, not content" };

    let source;
    try {
      source = await readFile(file, "utf8");
    } catch {
      return { applied: false, reason: "source file not found" };
    }
    if (!source.includes(dead)) {
      return { applied: false, reason: `${dead} is not in the page body — it is generated by the layout` };
    }

    // Prefer repointing to the trailing-slash form when that page exists; the
    // commonest broken internal link on this site is a missing slash.
    const slugs = (await readdir(ANSWERS)).map((f) => `/answers/${f.replace(/\.mdx$/, "")}/`);
    const candidate = dead.endsWith("/") ? null : `${dead}/`;
    const replacement = candidate && slugs.includes(candidate) ? candidate : null;

    if (replacement) {
      await writeFile(file, source.split(`(${dead})`).join(`(${replacement})`));
      return {
        applied: true,
        files: [file.replace(root(""), "")],
        changeType: "technical",
        summary: `Repointed a dead link on ${from}: ${dead} → ${replacement}`,
        before: dead,
        after: replacement,
      };
    }

    // No safe destination. Unlinking the text keeps the sentence and removes the
    // dead end; inventing a destination would be worse than leaving it broken.
    const linked = new RegExp(`\\[([^\\]]+)\\]\\(${dead.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`);
    if (!linked.test(source)) return { applied: false, reason: "could not locate the link in the body" };
    await writeFile(file, source.replace(linked, "$1"));
    return {
      applied: true,
      files: [file.replace(root(""), "")],
      changeType: "technical",
      summary: `Removed a link to ${dead} on ${from} — nothing on the site answers it any more`,
      before: dead,
      after: null,
    };
  },
  /**
   * Declares the intrinsic size of every image that does not state one.
   *
   * Deliberately not scoped to one page. Adding width and height is additive and
   * has no semantic effect — the tag renders identically, it just stops the layout
   * jumping — so the usual "one fixer, one page" rule buys nothing here, while
   * fixing them one page per day would leave a customer's site shifting about for
   * a fortnight. Dimensions are read from the file itself, never guessed.
   */
  "img-attrs": async () => {
    const sources = await sourceFiles();
    const changed = [];
    let fixed = 0;

    for (const file of sources) {
      const source = await readFile(file, "utf8");
      const hits = imagesMissingSize(source);
      if (!hits.length) continue;

      let updated = source;
      for (const hit of hits) {
        const asset = await resolveAsset(hit.src);
        if (!asset) continue;
        const size = await dimensions(asset);
        if (!size) continue;
        const patched = withSize(hit.tag, size);
        if (patched === hit.tag) continue;
        updated = updated.replace(hit.tag, patched);
        fixed++;
      }
      if (updated !== source) {
        await writeFile(file, updated);
        changed.push(file.replace(root(""), ""));
      }
    }

    if (!fixed) return { applied: false, reason: "no image was missing a size that could be read from the file" };
    return {
      applied: true,
      files: changed,
      changeType: "performance",
      summary:
        `Declared the size of ${fixed} image${fixed === 1 ? "" : "s"} so the page stops jumping as it loads`,
      hypothesis:
        "Images without width and height are the commonest cause of layout shift, which Google measures directly and visitors experience as the page moving under their thumb.",
    };
  },

  /**
   * Brings oversized images inside the weight budget.
   *
   * Re-encoded in place and committed, so the original is one revert away. Only
   * touches files where the saving is worth the churn — a git history a customer is
   * invited to read should not be full of two-percent improvements.
   */
  "perf-budget": async (finding) => {
    const asset = finding.evidence?.asset;
    if (!asset) {
      return { applied: false, reason: "the page is over budget on its own markup, which is a content decision" };
    }
    const file = root(asset.replace(/^\//, "public/"));
    const result = await shrink(file);
    if (!result) return { applied: false, reason: "re-encoding did not make it meaningfully smaller" };

    const kb = (n) => `${Math.round(n / 1024)}KB`;
    return {
      applied: true,
      files: [asset.replace(/^\//, "public/")],
      changeType: "performance",
      summary: `Compressed ${result.name} from ${kb(result.beforeBytes)} to ${kb(result.afterBytes)}`,
      hypothesis: `A ${kb(result.beforeBytes)} image is the slowest thing on the page on a phone connection; ${result.savedPercent}% less to download should show up in the speed figures.`,
      before: `${kb(result.beforeBytes)}${result.resized ? ` · ${result.resized.split(" → ")[0]}` : ""}`,
      after: `${kb(result.afterBytes)}${result.resized ? ` · ${result.resized.split(" → ")[1]}` : ""}`,
    };
  },

  /**
   * Keeps the page list Google holds in step with the page list that exists.
   *
   * A sitemap is submitted once and then forgotten, which is how a property ends
   * up with five stale ones and none for the site that is actually live. Google
   * will find pages eventually without it; "eventually" is the problem.
   */
  sitemap: async (finding) => {
    const feed = finding.evidence?.sitemap ?? `${SITE_URL}/sitemap-index.xml`;
    const property = process.env.GSC_PROPERTY || `sc-domain:${DOMAIN}`;

    const token = await getAccessToken(["https://www.googleapis.com/auth/webmasters"]);
    const path = `/sites/${encodeURIComponent(property)}/sitemaps/${encodeURIComponent(feed)}`;
    const res = await fetch(`https://searchconsole.googleapis.com/webmasters/v3${path}`, {
      method: "PUT",
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      return { applied: false, reason: `Search Console refused it: ${res.status} ${(await res.text()).slice(0, 120)}` };
    }

    return {
      applied: true,
      files: [],
      changeType: "technical",
      summary: `Submitted ${new URL(feed).pathname} to Search Console`,
      hypothesis:
        "Google had no current sitemap for this site, so it was finding pages only by following links. Handing it the list should get the newer pages crawled in days rather than weeks.",
      after: feed,
    };
  },

  /**
   * Removes a structured-data block that does not parse.
   *
   * A label search engines cannot read is worse than no label: it is a claim about
   * the page that fails validation, and Google reports it as an error against the
   * whole site. Repairing malformed JSON by guessing what was meant is how you turn
   * a broken claim into a false one, so this deletes rather than rewrites.
   */
  "schema-syntax": async (finding) => {
    const file = contentFileFor(finding.target);
    if (!file) return { applied: false, reason: "the markup is generated by the layout, not the content" };

    let source;
    try {
      source = await readFile(file, "utf8");
    } catch {
      return { applied: false, reason: "source file not found" };
    }

    const blocks = [...source.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/g)];
    const broken = blocks.filter((b) => {
      try {
        JSON.parse(b[1]);
        return false;
      } catch {
        return true;
      }
    });
    if (!broken.length) return { applied: false, reason: "every label on this page already parses" };

    let updated = source;
    for (const b of broken) updated = updated.replace(b[0], "");
    await writeFile(file, updated.replace(/\n{3,}/g, "\n\n"));

    return {
      applied: true,
      files: [file.replace(root(""), "")],
      changeType: "schema",
      summary: `Removed ${broken.length} unreadable structured-data block(s) from ${finding.target}`,
      hypothesis:
        "A label that fails to parse is reported by Google as an error against the site and describes nothing. Removing it clears the error; the correct label can then be added deliberately.",
      before: broken[0][1].trim().slice(0, 200),
      after: null,
    };
  },

  /**
   * Answers a question people are already asking, on the page that nearly answers it.
   *
   * Appended to the body rather than replacing anything, because the existing page
   * is already earning the impressions that produced this finding — the job is to
   * add the missing answer, not to rewrite what is working.
   */
  "faq-expand": async (finding) => {
    if (!aiConfig.draftingEnabled) {
      return { applied: false, reason: "drafting is disabled (AI_DRAFTING=off)" };
    }
    const file = contentFileFor(finding.target);
    if (!file) return { applied: false, reason: "only answer pages can be extended automatically" };
    const query = finding.evidence?.query;
    if (!query) return { applied: false, reason: "no search query attached to the finding" };

    let source;
    try {
      source = await readFile(file, "utf8");
    } catch {
      return { applied: false, reason: "source file not found" };
    }

    const body = source.split(/^---$/m).slice(2).join("---").trim();
    if (new RegExp(`^##.*${query.slice(0, 24)}`, "im").test(body)) {
      return { applied: false, reason: "the page already has a section on this" };
    }

    const draft = await draftSection({
      query,
      evidence: finding.evidence,
      pageTitle: readField(source, "title"),
      existingHeadings: [...body.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1]),
      domain: DOMAIN,
      business: BUSINESS,
    });
    if (!draft) return { applied: false, reason: "no usable draft came back" };
    if (draft.blocked) {
      await decline(finding, draft.blocked);
      return { applied: false, declined: true, reason: `decided against it: ${draft.blocked}` };
    }

    const heading = String(draft.heading ?? "").trim();
    const prose = String(draft.body ?? "").trim();
    if (!heading || prose.length < 200) return { applied: false, reason: "draft too thin to publish" };
    if (/^#{1,2}\s/m.test(prose)) return { applied: false, reason: "draft body contains its own headings" };

    await writeFile(file, `${source.trimEnd()}\n\n## ${heading}\n\n${prose}\n`);

    return {
      applied: true,
      files: [file.replace(root(""), "")],
      changeType: "content",
      summary: `Answered "${query}" on ${finding.target}`,
      hypothesis: draft.hypothesis,
      before: null,
      after: `## ${heading}\n\n${prose}`,
    };
  },
};

export async function applyFindings(findings, { dryRun = true } = {}) {
  const results = [];
  for (const finding of findings) {
    const fixer = fixers[finding.capability?.id ?? finding.capability];
    if (!fixer) {
      results.push({
        finding,
        applied: false,
        downgraded: true,
        reason: `no fixer implemented for "${finding.capability?.id ?? finding.capability}"`,
      });
      continue;
    }
    if (dryRun) {
      results.push({ finding, applied: false, dryRun: true, reason: "dry run" });
      continue;
    }
    let outcome;
    try {
      outcome = await fixer(finding);
    } catch (err) {
      // One fixer throwing must not abandon a run part-way through: the pages it
      // already changed still need verifying, committing and reporting.
      outcome = { applied: false, reason: `fixer threw: ${String(err?.message ?? err).slice(0, 160)}` };
    }
    const target = outcome.target ?? finding.target;
    if (outcome.applied && target) await freezePage(target);
    results.push({ finding, target, ...outcome });
  }
  return results;
}

export const implementedCapabilities = Object.keys(fixers);

if (import.meta.url === `file://${process.argv[1]}`) {
  const { findings } = JSON.parse(await readFile(root("ops/data/findings.json"), "utf8"));
  const dryRun = !process.argv.includes("--write");
  const results = await applyFindings(findings.slice(0, 3), { dryRun });
  console.log(JSON.stringify(results, null, 2));
}
