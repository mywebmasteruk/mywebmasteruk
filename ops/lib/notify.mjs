/**
 * What the customer is told, and when.
 *
 * The loop no longer asks anyone for permission, so telling the customer is the
 * only thing standing between "autonomous" and "unaccountable". Every change the
 * system makes lands here before anyone can call the run finished.
 *
 * Two speeds, set per client:
 *
 *   instant  — sent the moment the change ships. Reserved for changes that alter
 *              words a visitor reads, because those are the ones an owner would
 *              want to see the same day rather than on Friday.
 *   digest   — batched and sent on a cadence. Mechanical repairs go here; an
 *              email per broken link would train the customer to ignore us.
 *
 * A notice that cannot be delivered stays queued. It is never dropped, and never
 * silently marked as sent — an undelivered notice means an unaccountable change.
 *
 * The queue lives in Postgres (ops/lib/queue.mjs), not in a file. A JSON file
 * works exactly until two runs touch it: the second overwrites the first's record
 * of what it sent, and a notice is lost with nothing having failed.
 */
import { enqueue, pending, claim, markSent, markFailed, messageIdFor, MAX_ATTEMPTS } from "./queue.mjs";
import { db } from "./db.mjs";

/**
 * Delivery settings. These are per-client fields the admin screen writes —
 * the same shape as aiConfig, for the same reason.
 */
export const notifyConfig = {
  /** How often batched notices go out: instant | daily | weekly. */
  cadence: process.env.NOTIFY_CADENCE || "weekly",
  /** Autonomy classes that always send immediately, whatever the cadence. */
  instantClasses: (process.env.NOTIFY_INSTANT || "notify").split(",").map((s) => s.trim()),
  /** Set to "off" to stop sending. The queue still fills, so nothing is lost. */
  enabled: process.env.NOTIFY !== "off",
};

const CADENCE_DAYS = { instant: 0, daily: 1, weekly: 7 };

/** Lets the admin console set the cadence without a deploy. */
export function applySettings(settings = {}) {
  if (settings.notifyCadence && settings.notifyCadence in CADENCE_DAYS) {
    notifyConfig.cadence = settings.notifyCadence;
  }
  return notifyConfig;
}

/**
 * The customer's own address, from the record the pipeline wrote.
 *
 * `contact.email` came off their site or their plan, so it is already known and
 * a second copy of it would be the first thing to drift. `CUSTOMER_EMAIL` stays
 * as the fallback for our own site, which has no client record because the
 * pipeline did not build it.
 */
export function recipientFor(client) {
  const email = client?.contact?.email;
  if (email) {
    return { to: email, name: client.contact.name ?? null, source: `${client.slug ?? "client"} record` };
  }
  if (process.env.CUSTOMER_EMAIL) {
    return { to: process.env.CUSTOMER_EMAIL, name: null, source: "CUSTOMER_EMAIL" };
  }
  return { to: "", name: null, source: null, reason: client ? "the client record carries no contact email" : "no client record and no CUSTOMER_EMAIL set" };
}

export async function queueNotice(notice) {
  const r = await enqueue(notice);
  if (!r.ok) {
    // Failing to record a notice is worse than failing to send one: the send can
    // be retried, but a change nobody wrote down is a change nobody will tell
    // the customer about.
    throw new Error(`could not queue a notice ("${notice.title}"): ${r.error}`);
  }
  return { ...notice, id: r.id };
}

/** True when the batched digest is due under the configured cadence. */
export function digestDue({ batchedCount, lastDigestAt }, now = new Date()) {
  if (!batchedCount) return false;
  if (notifyConfig.cadence === "instant") return true;
  if (!lastDigestAt) return true;
  const days = CADENCE_DAYS[notifyConfig.cadence] ?? 7;
  return (now - new Date(lastDigestAt)) / 864e5 >= days;
}

/**
 * When the last batch went out, read from the notices themselves rather than
 * kept as a separate counter that can disagree with them.
 */
async function lastDigestAt(slug) {
  const filter = slug ? `slug=eq.${encodeURIComponent(slug)}` : "slug=is.null";
  const res = await db(`/notices?${filter}&class=eq.auto&sent_at=not.is.null&order=sent_at.desc&limit=1&select=sent_at`);
  return res.ok && Array.isArray(res.data) && res.data.length ? res.data[0].sent_at : null;
}

export function isInstant(notice) {
  return notifyConfig.instantClasses.includes(notice.class);
}

/**
 * Delivers what is due and clears it from the queue.
 *
 * `send` is injected so the loop can run this dry, and so a delivery failure is
 * a returned result rather than an exception that aborts a run which has already
 * changed the site.
 *
 * @returns {Promise<{instant: object[], digest: object[]|null, failures: object[]}>}
 */
export async function flushNotices({ send, dryRun = false, now = new Date(), client = null } = {}) {
  const slug = client?.slug ?? null;
  const failures = [];

  if (!notifyConfig.enabled) {
    return { instant: [], digest: null, stuck: [], failures: [{ reason: "notifications are switched off (NOTIFY=off)" }] };
  }

  const queue = await pending(slug);
  if (!queue.ok) {
    return { instant: [], digest: null, stuck: [], failures: [{ reason: `could not read the queue: ${queue.error}` }] };
  }

  const instant = queue.due.filter((r) => isInstant({ class: r.class }));
  const batched = queue.due.filter((r) => !isInstant({ class: r.class }));
  const sendDigest = digestDue({ batchedCount: batched.length, lastDigestAt: await lastDigestAt(slug) }, now);

  const recipient = recipientFor(client);
  if (!recipient.to) {
    return { instant: [], digest: null, stuck: queue.stuck, failures: [{ reason: `no recipient — ${recipient.reason}` }] };
  }
  if (dryRun) {
    return { instant, digest: sendDigest ? batched : null, stuck: queue.stuck, failures: [], dryRun: true };
  }

  /** Shapes a row back into what the templates already expect. */
  const asNotice = (r) => ({
    class: r.class, title: r.title, detail: r.detail, target: r.target,
    before: r.before_text, after: r.after_text, hypothesis: r.hypothesis, at: r.queued_at,
  });

  const sent = [];
  for (const row of instant) {
    // Claim first. A row we cannot claim is one another run holds, and sending
    // it anyway is the double send this whole arrangement exists to prevent.
    const held = await claim(row);
    if (!held.claimed) continue;

    const result = await send({ kind: "instant", notice: asNotice(row), to: recipient.to, name: recipient.name });
    if (result.sent) {
      await markSent(row.id, messageIdFor(row.id));
      sent.push(asNotice(row));
    } else {
      await markFailed(row.id, result.reason);
      failures.push({ notice: asNotice(row), reason: result.reason });
    }
  }

  let digest = null;
  if (sendDigest && batched.length) {
    const held = [];
    for (const row of batched) {
      const c = await claim(row);
      if (c.claimed) held.push(row);
    }
    if (held.length) {
      const result = await send({ kind: "digest", notices: held.map(asNotice), to: recipient.to, name: recipient.name });
      if (result.sent) {
        for (const row of held) await markSent(row.id, messageIdFor(row.id));
        digest = held.map(asNotice);
      } else {
        for (const row of held) await markFailed(row.id, result.reason);
        failures.push({ digest: true, reason: result.reason });
      }
    }
  }

  return {
    instant: sent,
    digest,
    /** Past the attempt cap: still owed, no longer retried, and said out loud. */
    stuck: queue.stuck,
    failures,
  };
}
