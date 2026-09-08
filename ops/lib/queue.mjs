/**
 * The notice queue, in Postgres.
 *
 * It was a JSON file in git, which works exactly until two runs touch it: the
 * second overwrites the first's record of what it sent, and a customer's notice
 * is lost without anything failing.
 *
 * The failure mode that matters here is the **double send**, not the lost
 * message. A row still showing `sent_at IS NULL` after a crash mid-send is
 * indistinguishable from one never attempted, and SMTP offers no exactly-once —
 * the mail either went or it did not, and the acknowledgement can be lost after
 * the fact. So the choice is which failure to prefer, and it is made deliberately:
 *
 *   Lost notice     an unaccountable change to somebody's website. The one thing
 *                   this system exists not to do.
 *   Duplicate       a second copy of an email. An annoyance.
 *
 * We prefer the duplicate — but bounded, not shrugged at:
 *
 *   a lease      only one run can hold a row at a time, so two runs on the same
 *                minute cannot both send it
 *   an attempt   counted on *claim*, not on failure, so a row that crashes the
 *                sender mid-flight still counts towards its limit and cannot be
 *                retried for ever
 *   a cap        after MAX_ATTEMPTS the row stops being claimed and starts being
 *                reported, because silent infinite retry is how a broken template
 *                mails somebody nine hundred times
 */
import { db } from "./db.mjs";

/** How long a run may hold a row before another may retry it. */
export const LEASE_MINUTES = 15;

/** After this many claims a row is a problem to look at, not to keep sending. */
export const MAX_ATTEMPTS = 3;

/** Deterministic per row, so a duplicate that does arrive is traceable. */
export const messageIdFor = (id, domain = "mywebmaster.co.uk") => `<notice-${id}@${domain}>`;

export async function enqueue(notice) {
  const res = await db("/notices", {
    method: "POST",
    body: {
      slug: notice.slug ?? null,
      class: notice.class,
      title: notice.title,
      detail: notice.detail ?? null,
      target: notice.target ?? null,
      before_text: notice.before ?? null,
      after_text: notice.after ?? null,
      hypothesis: notice.hypothesis ?? null,
    },
    prefer: "return=representation",
  });
  return { ok: res.ok, id: res.ok ? res.data?.[0]?.id : null, error: res.error };
}

/**
 * Everything owed to a client that is not currently held by another run.
 *
 * A row over the attempt cap is returned separately rather than silently
 * dropped: it is still owed, and somebody needs to know it is stuck.
 */
export async function pending(slug) {
  const stale = new Date(Date.now() - LEASE_MINUTES * 60_000).toISOString();
  const filter = slug ? `slug=eq.${encodeURIComponent(slug)}` : "slug=is.null";
  const res = await db(
    `/notices?${filter}&sent_at=is.null&or=(claimed_at.is.null,claimed_at.lt.${stale})&order=queued_at.asc`,
  );
  if (!res.ok) return { ok: false, error: res.error, due: [], stuck: [] };
  const rows = Array.isArray(res.data) ? res.data : [];
  return {
    ok: true,
    due: rows.filter((r) => r.attempts < MAX_ATTEMPTS),
    stuck: rows.filter((r) => r.attempts >= MAX_ATTEMPTS),
  };
}

/**
 * Takes the lease on a row, if it is still free.
 *
 * The `claimed_at` and `sent_at` conditions are part of the update, not checked
 * beforehand — PostgREST turns them into the WHERE clause, so two runs racing on
 * the same row produce one winner and one empty result rather than two sends.
 */
export async function claim(row) {
  const stale = new Date(Date.now() - LEASE_MINUTES * 60_000).toISOString();
  const res = await db(
    `/notices?id=eq.${row.id}&sent_at=is.null&or=(claimed_at.is.null,claimed_at.lt.${stale})`,
    {
      method: "PATCH",
      body: { claimed_at: new Date().toISOString(), attempts: row.attempts + 1 },
      prefer: "return=representation",
    },
  );
  const claimed = res.ok && Array.isArray(res.data) && res.data.length === 1;
  return { claimed, row: claimed ? res.data[0] : null, error: res.error };
}

/** Marks a row delivered. Nothing re-sends a row with `sent_at` set. */
export async function markSent(id, messageId) {
  return db(`/notices?id=eq.${id}`, {
    method: "PATCH",
    body: { sent_at: new Date().toISOString(), message_id: messageId ?? null, last_error: null },
  });
}

/**
 * Records why a send failed and releases the lease immediately.
 *
 * Released rather than left to expire: a failure we *know* about should be
 * retryable on the next run, and the lease exists to guard the case where we do
 * not know — a crash, a timeout, a process killed mid-send.
 */
export async function markFailed(id, error) {
  return db(`/notices?id=eq.${id}`, {
    method: "PATCH",
    body: { claimed_at: null, last_error: String(error ?? "unknown").slice(0, 300) },
  });
}
