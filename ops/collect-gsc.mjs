/**
 * Pulls a Search Console snapshot and writes it to ops/data/gsc-<date>.json.
 * Run daily by the loop. Read-only: this script never touches the site.
 *
 *   node ops/collect-gsc.mjs [--days 90] [--baseline]
 */
import { writeFile, mkdir } from "node:fs/promises";
import { gscFetch, getAccessToken, SCOPES } from "./lib/google.mjs";

const PROPERTY = process.env.GSC_PROPERTY || "sc-domain:mywebmaster.co.uk";
const args = process.argv.slice(2);
const days = Number(args[args.indexOf("--days") + 1]) || 90;
const isBaseline = args.includes("--baseline");

/** GSC data is finalised ~3 days back; querying fresher dates returns partial rows. */
const LAG_DAYS = 3;
const iso = (d) => new Date(d).toISOString().slice(0, 10);
const endDate = iso(Date.now() - LAG_DAYS * 864e5);
const startDate = iso(Date.now() - (LAG_DAYS + days) * 864e5);

const site = encodeURIComponent(PROPERTY);

async function query(dimensions, rowLimit = 500) {
  const token = await getAccessToken(SCOPES.searchConsole);
  const res = await gscFetch(`/sites/${site}/searchAnalytics/query`, {
    method: "POST",
    token,
    body: { startDate, endDate, dimensions, rowLimit, dataState: "final" },
  });
  return res.rows || [];
}

const [totals, queries, pages, devices, countries] = await Promise.all([
  query([]),
  query(["query"], 1000),
  query(["page"], 500),
  query(["device"]),
  query(["country"], 50),
]);

const t = totals[0] || { clicks: 0, impressions: 0, ctr: 0, position: 0 };

/**
 * Opportunity = impressions the site already earns but does not convert into clicks.
 * These are the queries worth acting on first: demand is proven, delivery is not.
 */
const opportunities = queries
  .filter((r) => r.impressions >= 25 && r.ctr < 0.01)
  .sort((a, b) => b.impressions - a.impressions)
  .slice(0, 50)
  .map((r) => ({
    query: r.keys[0],
    impressions: r.impressions,
    clicks: r.clicks,
    ctr: Number((r.ctr * 100).toFixed(2)),
    position: Number(r.position.toFixed(1)),
  }));

const snapshot = {
  property: PROPERTY,
  window: { startDate, endDate, days },
  collectedAt: new Date().toISOString(),
  totals: {
    clicks: t.clicks,
    impressions: t.impressions,
    ctr: Number((t.ctr * 100).toFixed(3)),
    position: Number(t.position.toFixed(1)),
  },
  topQueries: queries.slice(0, 100).map((r) => ({
    query: r.keys[0],
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: Number((r.ctr * 100).toFixed(2)),
    position: Number(r.position.toFixed(1)),
  })),
  topPages: pages.slice(0, 100).map((r) => ({
    page: r.keys[0],
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: Number((r.ctr * 100).toFixed(2)),
    position: Number(r.position.toFixed(1)),
  })),
  devices: devices.map((r) => ({ device: r.keys[0], clicks: r.clicks, impressions: r.impressions })),
  countries: countries.slice(0, 10).map((r) => ({ country: r.keys[0], clicks: r.clicks, impressions: r.impressions })),
  opportunities,
};

await mkdir(new URL("./data/", import.meta.url), { recursive: true });
const name = isBaseline ? "baseline.json" : `gsc-${endDate}.json`;
await writeFile(new URL(`./data/${name}`, import.meta.url), JSON.stringify(snapshot, null, 2));
console.log(
  `${name}: ${snapshot.totals.clicks} clicks / ${snapshot.totals.impressions} impressions ` +
    `/ CTR ${snapshot.totals.ctr}% / avg pos ${snapshot.totals.position} (${startDate} → ${endDate})`,
);
console.log(`${opportunities.length} opportunity queries (25+ impressions, under 1% CTR)`);
