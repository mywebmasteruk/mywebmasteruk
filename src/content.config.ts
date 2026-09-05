import { defineCollection, z } from "astro:content";
import { glob, file } from "astro/loaders";

/**
 * Every field the optimiser is allowed to touch lives in frontmatter or JSON,
 * validated here. A bad autonomous edit fails `astro build` instead of shipping.
 */

const seo = {
  /** <title>. Short enough to survive SERP truncation. */
  title: z.string().min(15).max(65),
  /** <meta name="description">. Google rewrites long ones; stay in budget. */
  description: z.string().min(70).max(165),
  /** On-page H1. Separate from <title> so both can be tuned independently. */
  heading: z.string().min(8).max(80),
  /** Answer-first paragraph — the passage an AI engine is most likely to extract. */
  summary: z.string().min(120).max(460),
  noindex: z.boolean().default(false),
  updated: z.coerce.date(),
};

const faq = z.object({
  q: z.string().min(10).max(140),
  a: z.string().min(60).max(900),
});

/**
 * Question-shaped pages. One question, one complete, quotable answer.
 * The primary answer-engine surface.
 */
const answers = defineCollection({
  loader: glob({ base: "./src/content/answers", pattern: "**/*.mdx" }),
  schema: z.object({
    ...seo,
    /** The exact question, phrased the way a person types or speaks it. */
    question: z.string().min(12).max(120),
    /** Self-contained answer, ~40-70 words. Must stand alone out of context. */
    shortAnswer: z.string().min(180).max(520),
    topic: z.enum(["autopilot", "safety", "measurement", "ai-search", "seo", "pricing"]),
    sources: z.array(z.object({ label: z.string(), url: z.string().url() })).default([]),
    related: z.array(z.string()).default([]),
  }),
});

/** The public record of autonomous changes. Written by the loop itself. */
const changelog = defineCollection({
  loader: glob({ base: "./src/content/changelog", pattern: "**/*.mdx" }),
  schema: z.object({
    date: z.coerce.date(),
    title: z.string().min(10).max(90),
    /** Recorded before the change shipped, so it can be judged honestly after. */
    hypothesis: z.string().min(40).max(400),
    targets: z.array(z.string()).min(1),
    changeType: z.enum([
      "technical",
      "metadata",
      "content",
      "schema",
      "internal-linking",
      "performance",
      "rollback",
    ]),
    /** auto = shipped unattended; proposed = a human approved; human = hand-made. */
    autonomy: z.enum(["auto", "proposed", "human"]),
    outcome: z.enum(["pending", "improved", "neutral", "regressed", "reverted"]).default("pending"),
    /** Filled in once the measurement window closes. */
    result: z.string().max(700).optional(),
    /** Commit SHA — every entry traces to a diff and can be reverted. */
    commit: z.string().optional(),
    holdout: z.boolean().default(false),
  }),
});

/** The three subscription tiers. */
const plans = defineCollection({
  loader: file("./src/data/plans.json"),
  schema: z.object({
    id: z.string(),
    name: z.string().min(3).max(40),
    order: z.number().int(),
    tagline: z.string().min(20).max(140),
    priceMonthly: z.number().nullable(),
    currency: z.string().default("GBP"),
    priceNote: z.string().max(120).optional(),
    /** Highest autonomy this tier is allowed to reach. */
    autonomy: z.enum(["report-only", "safe-auto", "full-auto"]),
    cadence: z.string().min(5).max(60),
    bestFor: z.string().min(20).max(180),
    includes: z.array(z.string().min(6).max(140)).min(4).max(12),
    excludes: z.array(z.string().min(6).max(140)).default([]),
    featured: z.boolean().default(false),
    cta: z.string().min(4).max(30),
  }),
});

/**
 * The change taxonomy: exactly what the system may touch, and at which
 * autonomy level. This table is the trust artefact — it is deliberately public.
 */
const capabilities = defineCollection({
  loader: file("./src/data/capabilities.json"),
  schema: z.object({
    id: z.string(),
    category: z.enum([
      "Technical health",
      "Performance",
      "Metadata",
      "Structured data",
      "Internal linking",
      "Content",
      "Conversion",
    ]),
    change: z.string().min(10).max(120),
    /** auto = ships unattended, propose = opens a PR, never = out of bounds. */
    autonomy: z.enum(["auto", "propose", "never"]),
    reversible: z.enum(["instant", "commit", "manual"]),
    signal: z.string().min(10).max(140),
    why: z.string().min(30).max(300),
  }),
});

export const collections = { answers, changelog, plans, capabilities };
