import type { APIRoute } from "astro";
import { getCollection } from "astro:content";
import { site } from "~/data/site";

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const GET: APIRoute = async () => {
  const entries = (await getCollection("changelog")).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf(),
  );

  const items = entries
    .map((e) =>
      [
        "    <item>",
        `      <title>${escape(e.data.title)}</title>`,
        `      <link>${site.url}/changelog/${e.id}/</link>`,
        `      <guid isPermaLink="true">${site.url}/changelog/${e.id}/</guid>`,
        `      <pubDate>${e.data.date.toUTCString()}</pubDate>`,
        `      <category>${escape(e.data.changeType)}</category>`,
        `      <description>${escape(e.data.hypothesis)}</description>`,
        "    </item>",
      ].join("\n"),
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escape(site.name)} — Autopilot changelog</title>
    <link>${site.url}/changelog/</link>
    <atom:link href="${site.url}/rss.xml" rel="self" type="application/rss+xml" />
    <description>Every change made to ${site.domain} by Autopilot, including the reverts.</description>
    <language>en-gb</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>
`;

  return new Response(xml, { headers: { "content-type": "application/xml; charset=utf-8" } });
};
