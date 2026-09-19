/**
 * The operational database.
 *
 * PostgREST over fetch rather than the Supabase SDK: this runs in a GitHub
 * runner, in Netlify functions and on a laptop, and the only thing it needs is a
 * URL and a key. One less dependency to audit in a process that edits a
 * customer's website unattended.
 *
 * Service role, always. Every caller here is server side — the loop, the admin
 * console, the pause function. Row level security is on with no policies, so
 * this key is the only way in and it must never reach a browser.
 */
const DEFAULT_URL = "https://txqjruevxeacqutuvkej.supabase.co";

/**
 * The REST base, normalised.
 *
 * A secret pasted from a dashboard picks up a trailing newline or space, and a
 * URL that already carries `/rest/v1` produces a doubled path. Both are silent:
 * the first turned into "Failed to parse URL", the second into a 404 that read
 * like an empty table. Trimming and stripping here means the one misconfiguration
 * left to diagnose is the one that actually needs the owner — a URL pointing at a
 * project that does not answer.
 */
export function restBase() {
  const raw = (process.env.SUPABASE_URL || DEFAULT_URL).trim();
  return raw.replace(/\/+$/, "").replace(/\/rest\/v1$/, "");
}

/**
 * Read from a file when there is no env var, so a laptop run works without
 * exporting a secret into a shell where it lands in history.
 */
let cachedKey;
async function key() {
  if (cachedKey !== undefined) return cachedKey;
  if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
    cachedKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    return cachedKey;
  }
  try {
    const { readFile } = await import("node:fs/promises");
    cachedKey = (await readFile(`${process.env.HOME}/.config/supabase/service-role`, "utf8")).trim();
  } catch {
    cachedKey = null;
  }
  return cachedKey;
}

export async function dbConfigured() {
  return Boolean(await key());
}

/**
 * One PostgREST request. Returns `{ ok, status, data, error }` rather than
 * throwing: a database that is unreachable must not abort a run that has
 * already changed files, and every caller here has a defensible fallback.
 */
export async function db(path, { method = "GET", body, prefer } = {}) {
  const k = await key();
  if (!k) return { ok: false, status: 0, data: null, error: "no service-role key (set SUPABASE_SERVICE_ROLE_KEY)" };

  try {
    const res = await fetch(`${restBase()}/rest/v1${path}`, {
      method,
      headers: {
        apikey: k,
        authorization: `Bearer ${k}`,
        "content-type": "application/json",
        ...(prefer ? { prefer } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    let data = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    return {
      ok: res.ok,
      status: res.status,
      data,
      error: res.ok ? null : (data?.message ?? data?.hint ?? String(data).slice(0, 200)),
    };
  } catch (err) {
    // A network-level failure ("fetch failed") names nothing an operator can act
    // on. The host and the underlying cause do: an ENOTFOUND says the URL is
    // wrong or the project is gone, a refused connection says something else.
    let host = restBase();
    try {
      host = new URL(restBase()).host;
    } catch {
      /* keep the raw value if it will not even parse as a URL */
    }
    const cause = err?.cause?.code || err?.cause?.message;
    const detail = cause ? `${err.message} (${cause})` : String(err?.message ?? err);
    return { ok: false, status: 0, data: null, error: `could not reach ${host}: ${detail}`.slice(0, 200) };
  }
}

/** Convenience for the common "one row or nothing" read. */
export async function one(path) {
  const r = await db(path);
  return r.ok && Array.isArray(r.data) ? (r.data[0] ?? null) : null;
}

/** Insert or update by primary key. */
export async function upsert(table, row, { onConflict } = {}) {
  const q = onConflict ? `?on_conflict=${onConflict}` : "";
  return db(`/${table}${q}`, {
    method: "POST",
    body: row,
    prefer: "resolution=merge-duplicates,return=representation",
  });
}
