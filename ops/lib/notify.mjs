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
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const QUEUE = fileURLToPath(new URL("../data/notices.json", import.meta.url));

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

export async function loadQueue() {
  try {
    return JSON.parse(await readFile(QUEUE, "utf8"));
  } catch {
    return { pending: [], sent: [], lastDigestAt: null };
  }
}

async function saveQueue(q) {
  await writeFile(QUEUE, JSON.stringify(q, null, 2));
}

/**
 * Records one change for delivery. Called by the loop for everything it did —
 * applied changes, reverts, and the decisions it refused to make on the
 * customer's behalf.
 *
 * @param {object} notice
 * @param {"auto"|"notify"|"decide"} notice.class
 * @param {string} notice.title      what changed, in the customer's language
 * @param {string} [notice.detail]   why, in one or two sentences
 * @param {string} [notice.target]   the page it happened to
 * @param {string} [notice.before]   previous value, where there was one
 * @param {string} [notice.after]    new value
 * @param {string} [notice.commit]   SHA, so the notice traces to a diff
 */
export async function queueNotice(notice) {
  const q = await loadQueue();
  q.pending.push({ ...notice, at: new Date().toISOString() });
  await saveQueue(q);
  return notice;
}

/** True when the batched digest is due under the configured cadence. */
export function digestDue(queue, now = new Date()) {
  const batched = queue.pending.filter((n) => !isInstant(n));
  if (!batched.length) return false;
  if (notifyConfig.cadence === "instant") return true;
  if (!queue.lastDigestAt) return true;
  const days = CADENCE_DAYS[notifyConfig.cadence] ?? 7;
  return (now - new Date(queue.lastDigestAt)) / 864e5 >= days;
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
  const q = await loadQueue();
  const failures = [];

  const instant = q.pending.filter(isInstant);
  const batched = q.pending.filter((n) => !isInstant(n));
  const sendDigest = digestDue(q, now);

  if (!notifyConfig.enabled) {
    return { instant: [], digest: null, failures: [{ reason: "notifications are switched off (NOTIFY=off)" }] };
  }
  const recipient = recipientFor(client);
  if (!recipient.to) {
    return { instant: [], digest: null, failures: [{ reason: `no recipient — ${recipient.reason}` }] };
  }
  if (dryRun) {
    return { instant, digest: sendDigest ? batched : null, failures: [], dryRun: true };
  }

  const delivered = [];

  // Instant notices go one message per change: the subject line is the change.
  for (const notice of instant) {
    const result = await send({ kind: "instant", notice, to: recipient.to, name: recipient.name });
    if (result.sent) delivered.push(notice);
    else failures.push({ notice, reason: result.reason });
  }

  let digest = null;
  if (sendDigest) {
    const result = await send({ kind: "digest", notices: batched, to: recipient.to, name: recipient.name });
    if (result.sent) {
      delivered.push(...batched);
      digest = batched;
      q.lastDigestAt = now.toISOString();
    } else {
      failures.push({ digest: true, reason: result.reason });
    }
  }

  // Anything that failed stays pending and is retried on the next run.
  const deliveredSet = new Set(delivered);
  q.pending = q.pending.filter((n) => !deliveredSet.has(n));
  q.sent = [...q.sent, ...delivered.map((n) => ({ ...n, sentAt: now.toISOString() }))].slice(-500);
  await saveQueue(q);

  return { instant: instant.filter((n) => deliveredSet.has(n)), digest, failures };
}
