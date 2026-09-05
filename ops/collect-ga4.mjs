/**
 * Pulls a GA4 snapshot via the Data API.
 *
 * Requires: GA4_PROPERTY_ID, plus the Analytics Data API enabled on the service
 * account's Cloud project. Without those it exits 0 with a clear message rather than
 * failing the run — the loop's other signals do not depend on it.
 *
 *   node ops/collect-ga4.mjs [--days 28]
 */
import { writeFile } from "node:fs/promises";
import { getAccessToken, SCOPES } from "./lib/google.mjs";

const PROPERTY = process.env.GA4_PROPERTY_ID;
const days = Number(process.argv[process.argv.indexOf("--days") + 1]) || 28;

if (!PROPERTY) {
  console.log("GA4_PROPERTY_ID not set — skipping GA4 collection.");
  console.log("Find it in GA4 → Admin → Property Settings, then export GA4_PROPERTY_ID=123456789");
  process.exit(0);
}

const token = await getAccessToken(SCOPES.analytics);

async function runReport(body) {
  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/properties/${PROPERTY}:runReport`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  if (!res.ok) {
    const text = await res.text();
    if (text.includes("SERVICE_DISABLED")) {
      console.log("Analytics Data API is not enabled on the Cloud project — skipping GA4.");
      process.exit(0);
    }
    throw new Error(`GA4 ${res.status}: ${text.slice(0, 300)}`);
  }
  return res.json();
}

const dateRanges = [{ startDate: `${days}daysAgo`, endDate: "yesterday" }];

const [landing, channels, events] = await Promise.all([
  runReport({
    dateRanges,
    dimensions: [{ name: "landingPagePlusQueryString" }],
    metrics: [
      { name: "sessions" },
      { name: "engagedSessions" },
      { name: "conversions" },
      { name: "bounceRate" },
    ],
    limit: 100,
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
  }),
  runReport({
    dateRanges,
    dimensions: [{ name: "sessionDefaultChannelGroup" }, { name: "sessionSource" }],
    metrics: [{ name: "sessions" }],
    limit: 50,
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
  }),
  runReport({
    dateRanges,
    dimensions: [{ name: "eventName" }],
    metrics: [{ name: "eventCount" }],
    limit: 30,
    orderBys: [{ metric: { metricName: "eventCount" }, desc: true }],
  }),
]);

const rows = (r) => (r.rows ?? []).map((x) => ({
  keys: x.dimensionValues.map((d) => d.value),
  values: x.metricValues.map((m) => Number(m.value)),
}));

/** Referrals from assistants are the closest client-side proxy for an AI citation. */
const AI_SOURCES = ["chatgpt.com", "perplexity.ai", "claude.ai", "copilot.microsoft.com", "gemini.google.com"];
const aiReferrals = rows(channels)
  .filter((r) => AI_SOURCES.some((s) => r.keys[1]?.includes(s)))
  .map((r) => ({ source: r.keys[1], sessions: r.values[0] }));

const snapshot = {
  property: PROPERTY,
  window: { days, endDate: new Date(Date.now() - 864e5).toISOString().slice(0, 10) },
  collectedAt: new Date().toISOString(),
  landingPages: rows(landing).map((r) => ({
    page: r.keys[0],
    sessions: r.values[0],
    engagedSessions: r.values[1],
    conversions: r.values[2],
    bounceRate: Number(r.values[3].toFixed(3)),
  })),
  channels: rows(channels).map((r) => ({ channel: r.keys[0], source: r.keys[1], sessions: r.values[0] })),
  events: rows(events).map((r) => ({ event: r.keys[0], count: r.values[0] })),
  aiReferrals,
};

const name = `ga4-${snapshot.window.endDate}.json`;
await writeFile(new URL(`./data/${name}`, import.meta.url), JSON.stringify(snapshot, null, 2));
console.log(
  `${name}: ${snapshot.landingPages.length} landing pages, ` +
    `${aiReferrals.reduce((n, r) => n + r.sessions, 0)} sessions referred by AI assistants`,
);
