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
const URL_BASE = () => process.env.SUPABASE_URL || "https://txqjruevxeacqutuvkej.supabase.co";

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
    const res = await fetch(`${URL_BASE()}/rest/v1${path}`, {
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
    return { ok: false, status: 0, data: null, error: String(err?.message ?? err).slice(0, 200) };
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
