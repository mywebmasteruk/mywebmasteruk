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

let client;
function getClient() {
  if (aiConfig.provider !== "anthropic") {
    throw new Error(`Unsupported AI provider "${aiConfig.provider}" — only "anthropic" is wired up.`);
  }
  // Resolves ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, or an `ant auth login` profile.
  client ??= new Anthropic();
  return client;
}

const SYSTEM = `You draft proposed website changes for a UK small-business client.

Every draft you write is reviewed by a person before it can go live. You are not
approving anything; you are giving them something concrete to accept or reject.

Rules, in order of importance:
1. Never invent a fact, a statistic, a testimonial, a price or a claim about the
   business. If the change would need information you do not have, say so in the
   "blocked" field instead of guessing.
2. Write in plain British English for a business owner, not a developer. No jargon.
3. Respect the character budgets exactly. A title over 65 characters is truncated
   in search results, which loses the words that differentiate the business.
4. Match the existing voice of the page. You are editing, not rebranding.`;

/**
 * Drafts a proposed change for one finding.
 * Returns null when drafting is disabled or the model declines — the loop then
 * reports the finding without a draft, which is a normal outcome, not a failure.
 */
export async function draftChange(finding, context = {}) {
  if (!aiConfig.draftingEnabled) return null;

  const prompt = [
    `A daily check of ${context.domain ?? "the client's website"} found this:`,
    ``,
    `Finding: ${finding.title}`,
    `Detail: ${finding.detail}`,
    `Page: ${finding.target ?? "not page-specific"}`,
    `Change type: ${finding.capability?.change ?? finding.capability}`,
    context.currentTitle ? `Current page title: ${context.currentTitle}` : "",
    context.currentDescription ? `Current description: ${context.currentDescription}` : "",
    aiConfig.brandVoice ? `\nVoice rules agreed with this client:\n${aiConfig.brandVoice}` : "",
    ``,
    `Reply with JSON only, no prose around it:`,
    `{`,
    `  "hypothesis": "we expect X to improve because Y — one sentence",`,
    `  "proposal": "the exact replacement text, or a plain description of the change",`,
    `  "rationale": "why this is better, for a non-technical owner, two sentences max",`,
    `  "blocked": null or "what information you would need to do this properly"`,
    `}`,
  ]
    .filter(Boolean)
    .join("\n");

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
    // A draft we cannot parse is a draft we cannot show a human. Skip it.
    return null;
  }
}
