/**
 * AI provider configuration for the loop.
 *
 * Everything here is settable per client, and these are exactly the fields the
 * admin settings screen will write. Defaults are chosen so the loop works with
 * nothing configured beyond a key.
 *
 * The drafting step is the only place the loop uses a model. Deciding what to
 * change, enforcing the limits and verifying the result are all deterministic
 * code — a model is never in a position to approve its own work.
 */
import Anthropic from "@anthropic-ai/sdk";

/** @typedef {"anthropic"} Provider */

export const aiConfig = {
  /** Only Anthropic is wired up. Adding a provider means adding a client here. */
  provider: /** @type {Provider} */ (process.env.AI_PROVIDER || "anthropic"),
  model: process.env.AI_MODEL || "claude-opus-5",
  /** low | medium | high | xhigh | max — how hard the model works per draft. */
  effort: process.env.AI_EFFORT || "high",
  maxTokens: Number(process.env.AI_MAX_TOKENS) || 16000,
  /** Set false to keep the loop fully deterministic and skip drafting entirely. */
  draftingEnabled: process.env.AI_DRAFTING !== "off",
  /** Per-client voice rules, signed off once at onboarding and applied to every draft. */
  brandVoice: process.env.AI_BRAND_VOICE || "",
};

/**
 * Applies settings loaded from the admin console over the environment defaults.
 *
 * Mutates `aiConfig` in place rather than threading a config object through every
 * caller: the loop calls this once at startup, and everything downstream keeps
 * reading the same object it always read.
 */
export function applySettings(settings = {}) {
  if (settings.provider) aiConfig.provider = settings.provider;
  if (settings.model) aiConfig.model = settings.model;
  if (settings.effort) aiConfig.effort = settings.effort;
  if (settings.maxTokens) aiConfig.maxTokens = Number(settings.maxTokens);
  if (typeof settings.drafting === "boolean") aiConfig.draftingEnabled = settings.drafting;
  if (typeof settings.brandVoice === "string") aiConfig.brandVoice = settings.brandVoice;
  // A model change invalidates nothing about the client, but a provider change does.
  if (settings.provider) client = undefined;
  return aiConfig;
}

let client;
function getClient() {
  if (aiConfig.provider !== "anthropic") {
    throw new Error(`Unsupported AI provider "${aiConfig.provider}" — only "anthropic" is wired up.`);
  }
  // Resolves ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an `ant auth login` profile.
  // Checked here rather than left to the SDK: "Could not resolve authentication
  // method" in a run report tells an operator nothing about which knob to turn.
  if (!process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new Error(
      "no AI credentials — set ANTHROPIC_API_KEY, or set AI_DRAFTING=off to run the loop deterministically",
    );
  }
  client ??= new Anthropic();
  return client;
}

const SYSTEM = `You write website changes for a UK small-business client.

What you write goes live. Nobody proof-reads it first. The owner is emailed the
same day showing exactly what changed, and can put the old version back with one
click — so a mistake is recoverable, but it is a mistake they will read.

Write as if it ships, because it does. Where you would have hedged and left a
person to decide, decide — unless the decision needs a fact about the business
that you do not have, in which case use the "blocked" field and change nothing.

Rules, in order of importance:
1. Never invent a fact, a statistic, a testimonial, a price or a claim about the
   business. If the change would need information you do not have, say so in the
   "blocked" field instead of guessing.
2. Write in plain British English for a business owner, not a developer. No jargon.
3. Respect the character budgets exactly. A title over 65 characters is truncated
   in search results, which loses the words that differentiate the business.
4. Match the existing voice of the page. You are editing, not rebranding.`;

/**
 * The exact frontmatter budgets from src/content.config.ts, restated here so the
 * model is told the limit rather than discovering it when the build fails.
 * Keep in step with the schema: the schema is the enforcement, this is the brief.
 */
export const FIELD_BUDGETS = {
  title: [15, 65],
  description: [70, 165],
  heading: [8, 80],
  summary: [120, 460],
  question: [12, 120],
  shortAnswer: [180, 520],
};

const budgetLines = (fields) =>
  fields.map((f) => `  "${f}": ${FIELD_BUDGETS[f][0]}-${FIELD_BUDGETS[f][1]} characters`).join("\n");

async function askForJson(prompt) {
  const response = await getClient().messages.create({
    model: aiConfig.model,
    max_tokens: aiConfig.maxTokens,
    thinking: { type: "adaptive" },
    output_config: { effort: aiConfig.effort },
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });
  if (response.stop_reason === "refusal") return null;
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  try {
    return JSON.parse(text.replace(/^```(?:json)?\n?|\n?```$/g, ""));
  } catch {
    return null;
  }
}

/**
 * Rewrites specific frontmatter fields on an existing page.
 *
 * Returns `{ fields, hypothesis, rationale, blocked }` where `fields` contains
 * only the keys asked for. The caller re-checks every budget before writing —
 * the model is told the limits, but is never trusted to have respected them.
 */
export async function draftEdit(finding, { fields, current = {}, domain, evidence } = {}) {
  if (!aiConfig.draftingEnabled) return null;

  const prompt = [
    `A daily check of ${domain ?? "the client's website"} found this:`,
    ``,
    `Finding: ${finding.title}`,
    `Detail: ${finding.detail}`,
    `Page: ${finding.target ?? "not page-specific"}`,
    evidence ? `Search data: ${JSON.stringify(evidence)}` : "",
    ``,
    `Current values:`,
    ...fields.map((f) => `  ${f}: ${JSON.stringify(current[f] ?? null)}`),
    ``,
    `Rewrite these fields. Character budgets are hard limits, enforced at build time:`,
    budgetLines(fields),
    aiConfig.brandVoice ? `\nVoice rules agreed with this client:\n${aiConfig.brandVoice}` : "",
    ``,
    `Reply with JSON only, no prose around it:`,
    `{`,
    `  "fields": { ${fields.map((f) => `"${f}": "..."`).join(", ")} },`,
    `  "hypothesis": "we expect X to improve because Y — one sentence",`,
    `  "rationale": "why this is better, for a non-technical owner, two sentences max",`,
    `  "blocked": null or "what you would need to know to do this properly"`,
    `}`,
  ]
    .filter(Boolean)
    .join("\n");

  return askForJson(prompt);
}

/**
 * Writes a complete new answer page from proven search demand.
 *
 * The bar is deliberately high and stated in the prompt: this only runs when the
 * customer's own Search Console data shows repeated demand the site does not
 * answer, and the model is told to refuse rather than pad if it cannot answer the
 * question truthfully from what it has been given.
 */
export async function draftAnswerPage({ query, evidence, topics, existingSlugs = [], domain, business }) {
  if (!aiConfig.draftingEnabled) return null;

  const prompt = [
    `${domain} is shown in Google for the search "${query}" but has no page that answers it.`,
    evidence ? `Search data: ${JSON.stringify(evidence)}` : "",
    business ? `\nWhat this business does:\n${business}` : "",
    ``,
    `Write a new answer page for it. This publishes on the live site today.`,
    ``,
    `Refuse — set "blocked" and nothing else — if any of these are true:`,
    `- answering it honestly would need a fact about this business you have not been given`,
    `- the search is not something this business genuinely does (do not stretch to fit)`,
    `- the query is navigational or a mis-spelling rather than a real question`,
    ``,
    `Existing pages, so you do not duplicate one: ${existingSlugs.join(", ") || "none"}`,
    `Allowed topics: ${topics.join(", ")}`,
    aiConfig.brandVoice ? `\nVoice rules agreed with this client:\n${aiConfig.brandVoice}` : "",
    ``,
    `Character budgets are hard limits, enforced at build time:`,
    budgetLines(["title", "description", "heading", "question", "summary", "shortAnswer"]),
    ``,
    `Reply with JSON only, no prose around it:`,
    `{`,
    `  "slug": "kebab-case-url-segment",`,
    `  "fields": {`,
    `    "title": "...", "description": "...", "heading": "...",`,
    `    "question": "the question as a person would type it",`,
    `    "summary": "...", "shortAnswer": "self-contained, 40-70 words, stands alone out of context",`,
    `    "topic": "one of the allowed topics"`,
    `  },`,
    `  "body": "the page body in Markdown: 300-600 words, ## headings, no H1, no invented facts, figures or testimonials",`,
    `  "hypothesis": "we expect X because Y — one sentence",`,
    `  "blocked": null or "why this page should not be written"`,
    `}`,
  ]
    .filter(Boolean)
    .join("\n");

  return askForJson(prompt);
}

/**
 * Writes one new section for a page that already exists and already ranks.
 *
 * Narrower than draftAnswerPage on purpose: the page is earning impressions
 * already, so the model is adding the missing answer, not re-pitching the page.
 * It is told the headings that are already there so it cannot repeat one.
 */
export async function draftSection({ query, evidence, pageTitle, existingHeadings = [], domain, business }) {
  if (!aiConfig.draftingEnabled) return null;

  const prompt = [
    `${domain} is shown in Google for "${query}", but the page it shows does not answer it.`,
    `Page: ${pageTitle}`,
    evidence ? `Search data: ${JSON.stringify(evidence)}` : "",
    business ? `\nWhat this business does:\n${business}` : "",
    ``,
    `Write one new section to add to the end of that page. It publishes today.`,
    ``,
    `Sections already on the page — do not repeat or overlap one:`,
    ...existingHeadings.map((h) => `  - ${h}`),
    ``,
    `Refuse — set "blocked" and nothing else — if answering honestly needs a fact`,
    `about this business you have not been given, or if the search is not something`,
    `this business genuinely does.`,
    aiConfig.brandVoice ? `\nVoice rules agreed with this client:\n${aiConfig.brandVoice}` : "",
    ``,
    `Reply with JSON only, no prose around it:`,
    `{`,
    `  "heading": "a heading of 4-70 characters, no leading #",`,
    `  "body": "120-350 words of Markdown. No headings of your own, no invented facts or figures.",`,
    `  "hypothesis": "we expect X because Y — one sentence",`,
    `  "blocked": null or "why this section should not be written"`,
    `}`,
  ]
    .filter(Boolean)
    .join("\n");

  return askForJson(prompt);
}
