import type { APIRoute } from "astro";
import { site } from "~/data/site";

/**
 * Answer-engine crawlers are named explicitly and allowed. A blanket disallow written
 * years ago is the single most common cause of zero AI-search visibility, so the intent
 * is stated rather than left to a wildcard.
 */
const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "Bingbot",
  "CCBot",
  "meta-externalagent",
];

export const GET: APIRoute = () => {
  const body = [
    "# We want to be read, quoted and cited.",
    "",
    "User-agent: *",
    "Allow: /",
    "",
    ...AI_CRAWLERS.flatMap((ua) => [`User-agent: ${ua}`, "Allow: /", ""]),
    `Sitemap: ${site.url}/sitemap-index.xml`,
    `# Curated map for language models: ${site.url}/llms.txt`,
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
};
