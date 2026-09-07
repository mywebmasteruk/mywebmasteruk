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
 * The environment stays the floor rather than being retired, because the loop's
 * scheduled run happens on a GitHub runner with no route to Blobs. Until that run
 * has credentials or a service token, CI reads env vars and the console governs
 * runs that can reach the store. `source` on every field says which applied, so a
 * report can state where a value came from instead of implying the console is in
 * charge when it is not.
 */
const STORE = "autopilot";
const KEY = (slug) => `settings:${slug}`;

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

async function fromBlobs(slug) {
  try {
    const { getStore } = await import("@netlify/blobs");
    const store = getStore(STORE);
    const [client, defaults] = await Promise.all([
      slug ? store.get(KEY(slug), { type: "json" }) : null,
      store.get(KEY("_default"), { type: "json" }),
    ]);
    return { client: client ?? null, defaults: defaults ?? null, reachable: true };
  } catch (err) {
    return { client: null, defaults: null, reachable: false, error: String(err?.message ?? err).slice(0, 120) };
  }
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
  const blobs = await fromBlobs(slug);

  const layers = [
    ["default", DEFAULTS],
    ["environment", env],
    ["console default", blobs.defaults ?? {}],
    [`${slug ?? "client"} record`, blobs.client ?? {}],
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
    storeReachable: blobs.reachable,
    storeError: blobs.error ?? null,
    /** Plain sentence for the run report, so nobody has to infer it. */
    summary: blobs.reachable
      ? `settings from ${[...new Set(Object.values(source))].join(", ")}`
      : `settings from the environment — the console's store was unreachable (${blobs.error})`,
  };
}
