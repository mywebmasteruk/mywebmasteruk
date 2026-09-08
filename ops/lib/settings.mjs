/**
 * Reads the settings the admin console writes.
 *
 * The console stores one record per client in the `autopilot` Blobs store, under
 * `settings:<slug>`. This is the other half of that: without it the screen is a
 * form that saves to a key nothing reads, which is exactly the kind of quiet
 * fiction the rest of this system exists to prevent.
 *
 * Three sources, most specific first:
 *
 *   1. the client's own record          settings:<slug>
 *   2. the defaults set in the console  settings:_default
 *   3. the environment                  AI_MODEL, NOTIFY_CADENCE, …
 *
 * The environment stays the floor rather than being retired — it is what a laptop
 * run and a first-boot CI run have — but it is no longer the ceiling. Postgres is
 * reachable from the GitHub runner, which Blobs never was, so what the console
 * saves now actually governs the scheduled run. `source` on every field says
 * which layer applied, so a report can state where a value came from rather than
 * implying the console is in charge when it is not.
 */
import { db } from "./db.mjs";

/** Matches admin/src/lib/settings.ts. Both ends drifting apart is the risk here. */
export const DEFAULTS = {
  provider: "anthropic",
  model: "claude-opus-5",
  effort: "high",
  maxTokens: 16000,
  drafting: true,
  brandVoice: "",
  notifyCadence: "weekly",
};

/** What the environment says, with unset left undefined rather than defaulted. */
function fromEnv() {
  const out = {};
  if (process.env.AI_PROVIDER) out.provider = process.env.AI_PROVIDER;
  if (process.env.AI_MODEL) out.model = process.env.AI_MODEL;
  if (process.env.AI_EFFORT) out.effort = process.env.AI_EFFORT;
  if (process.env.AI_MAX_TOKENS) out.maxTokens = Number(process.env.AI_MAX_TOKENS);
  if (process.env.AI_DRAFTING) out.drafting = process.env.AI_DRAFTING !== "off";
  if (process.env.AI_BRAND_VOICE) out.brandVoice = process.env.AI_BRAND_VOICE;
  if (process.env.NOTIFY_CADENCE) out.notifyCadence = process.env.NOTIFY_CADENCE;
  return out;
}

async function fromDb(slug) {
  const rows = await db(`/client_settings?or=(slug.eq.${encodeURIComponent(slug ?? "")},slug.is.null)&select=*`);
  if (!rows.ok) return { client: null, defaults: null, reachable: false, error: rows.error };
  const list = Array.isArray(rows.data) ? rows.data : [];
  const shape = (r) =>
    r && {
      provider: r.provider,
      model: r.model,
      effort: r.effort,
      maxTokens: r.max_tokens,
      drafting: r.drafting,
      brandVoice: r.brand_voice,
      notifyCadence: r.notify_cadence,
    };
  return {
    client: shape(list.find((r) => r.slug === slug)) ?? null,
    defaults: shape(list.find((r) => r.slug === null)) ?? null,
    reachable: true,
  };
}

/**
 * The settings in force for this run, and where each field came from.
 *
 * Never throws. A settings store that cannot be reached must not stop a run —
 * the environment and the built-in defaults are a complete, working answer, and
 * a loop that refuses to fix a broken link because a config blob timed out is
 * worse than one that uses last week's model.
 */
export async function loadSettings({ slug = process.env.CLIENT_SLUG } = {}) {
  const env = fromEnv();
  const store = await fromDb(slug);

  const layers = [
    ["default", DEFAULTS],
    ["environment", env],
    ["console default", store.defaults ?? {}],
    [`${slug ?? "client"} record`, store.client ?? {}],
  ];

  const settings = {};
  const source = {};
  for (const [name, layer] of layers) {
    for (const [key, value] of Object.entries(layer)) {
      if (value === undefined || !(key in DEFAULTS)) continue;
      settings[key] = value;
      source[key] = name;
    }
  }

  return {
    settings,
    source,
    storeReachable: store.reachable,
    storeError: store.error ?? null,
    /** Plain sentence for the run report, so nobody has to infer it. */
    summary: store.reachable
      ? `settings from ${[...new Set(Object.values(source))].join(", ")}`
      : `settings from the environment — the database was unreachable (${store.error})`,
  };
}
