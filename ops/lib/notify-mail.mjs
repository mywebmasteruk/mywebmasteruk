/**
 * Turns a queued notice into an actual email.
 *
 * Kept apart from notify.mjs so the queue logic — what is due, what failed, what
 * must be retried — can be reasoned about and tested without SMTP anywhere near it.
 * notify.mjs decides *whether* to send; this decides *what the message looks like*.
 */
import { send } from "../../mail/send.mjs";
import { changeMade, changeDigest, decisionNeeded } from "../../mail/templates.mjs";
import { sign } from "../../mail/tokens.mjs";

const SITE = process.env.SITE_URL || "https://mywebmaster.co.uk";

/**
 * A signed link to the customer's own version history, so "put it back" is
 * self-serve rather than a support request.
 *
 * Returns null when the signing secret or the customer reference is missing —
 * a link that 404s is worse than no link, because it teaches the customer that
 * the undo button does not work.
 */
function undoLink() {
  const sub = process.env.CUSTOMER_REF;
  if (!sub || !process.env.LINK_SIGNING_SECRET) return null;
  try {
    return `${SITE}/api/restore?t=${encodeURIComponent(
      sign({
        action: "restore",
        sub,
        website: process.env.SITE_DOMAIN ?? null,
        siteId: process.env.NETLIFY_SITE_ID ?? null,
      }),
    )}`;
  } catch {
    return null;
  }
}

/** The `send` adapter that flushNotices() expects. */
export async function mailNotice({ kind, notice, notices, to }) {
  if (kind === "instant") {
    const message =
      notice.class === "decide"
        ? decisionNeeded({ notice })
        : changeMade({ notice, undoLink: undoLink() });
    return send({ to, ...message });
  }

  if (kind === "digest") {
    if (!notices?.length) return { sent: true, id: "nothing-to-send" };
    const since = notices
      .map((n) => n.at)
      .sort()[0]
      ?.slice(0, 10);
    return send({ to, ...changeDigest({ notices, since }) });
  }

  return { sent: false, reason: `unknown notice kind "${kind}"` };
}
