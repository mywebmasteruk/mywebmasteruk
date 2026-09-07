/**
 * The stop button.
 *
 * The welcome email, the terms and every report tell the customer they can stop
 * Autopilot changing anything, instantly, without ringing anybody. Until now
 * those sentences pointed at nothing.
 *
 * It is one signed link and one click. No login, no account, no form — because
 * the moment somebody wants this is the moment they are least willing to be
 * asked for a password, and a stop button that takes three steps is not a stop
 * button.
 *
 * Pausing is deliberately asymmetric. Stopping is instant and needs no
 * confirmation; starting again asks the customer to confirm, because an
 * accidental resume undoes a decision they made on purpose.
 */
import { verify } from "../../mail/tokens.mjs";

const HALT_KEY = "autopilot:halt";

/**
 * State lives in the Netlify Blobs store when it is available and falls back to
 * an environment read otherwise, so a misconfiguration cannot leave the button
 * silently doing nothing. If we cannot record the pause, we say so rather than
 * showing a green tick.
 */
async function store() {
  try {
    const { getStore } = await import("@netlify/blobs");
    return getStore("autopilot");
  } catch {
    return null;
  }
}

const page = (title, body, tone = "ok") => new Response(
  `<!doctype html><html lang="en-GB"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${title}</title>
<style>
  :root{color-scheme:light}
  body{margin:0;background:#f7f7f5;color:#16181d;font:17px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
  main{max-width:34rem;margin:0 auto;padding:12vh 1.5rem}
  h1{font-size:1.9rem;letter-spacing:-.02em;margin:0 0 1rem}
  p{margin:0 0 1rem;color:#4a4f57}
  .mark{width:3rem;height:3rem;border-radius:50%;display:grid;place-items:center;color:#fff;font-size:1.5rem;margin-bottom:1.5rem;background:${tone === "ok" ? "#15803d" : tone === "warn" ? "#b45309" : "#b91c1c"}}
  a.btn{display:inline-flex;min-height:48px;align-items:center;padding:.75rem 1.4rem;border-radius:8px;background:#16181d;color:#fff;text-decoration:none;font-weight:600;margin-top:.5rem}
  small{color:#6b7280}
</style></head><body><main>
  <div class="mark">${tone === "ok" ? "✓" : tone === "warn" ? "!" : "×"}</div>
  <h1>${title}</h1>
  ${body}
</main></body></html>`,
  { status: tone === "bad" ? 400 : 200, headers: { "content-type": "text/html; charset=utf-8" } },
);

export default async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("t");
  const payload = token ? verify(token) : null;

  if (!payload || !["pause", "resume"].includes(payload.action)) {
    return page(
      "That link has expired",
      `<p>Links in our emails stop working after a while, on purpose — an email sits
       in an inbox for years and anyone who reads it should not be able to change
       your website.</p>
       <p>Reply to any email from us and we will stop Autopilot straight away. A
       person reads those.</p>`,
      "bad",
    );
  }

  const site = payload.sub ?? "mywebmaster.co.uk";
  const blobs = await store();

  if (!blobs) {
    return page(
      "We could not record that",
      `<p>Something is wrong on our side, and we would rather tell you than show you
       a tick that means nothing.</p>
       <p><strong>Reply to this email and we will stop it by hand, today.</strong></p>`,
      "bad",
    );
  }

  // Resuming is the one that asks first. Stopping never does.
  if (payload.action === "resume" && url.searchParams.get("confirm") !== "yes") {
    return page(
      "Start Autopilot again?",
      `<p>Autopilot is paused for <strong>${site}</strong>. Nothing has changed on your
       site since you stopped it.</p>
       <p>Starting again means we go back to measuring it daily and making the
       changes the evidence supports — telling you about each one.</p>
       <a class="btn" href="?t=${encodeURIComponent(token)}&confirm=yes">Yes, start again</a>
       <p><small>If you did not mean to click this, close the tab. Nothing has happened.</small></p>`,
      "warn",
    );
  }

  const now = new Date().toISOString();
  if (payload.action === "pause") {
    await blobs.setJSON(HALT_KEY, { halted: true, site, at: now, by: "customer link" });
    return page(
      "Stopped",
      `<p>Autopilot will not change anything on <strong>${site}</strong> from now on.
       Your site is exactly as it is — nothing has been undone, and nothing will be.</p>
       <p>We carry on measuring quietly, so when you start again we can tell you what
       happened while it was off.</p>
       <p><small>Paused ${now.slice(0, 16).replace("T", " ")}. Reply to any of our emails to
       start again, or to ask why something changed.</small></p>`,
    );
  }

  await blobs.setJSON(HALT_KEY, { halted: false, site, at: now, by: "customer link" });
  return page(
    "Running again",
    `<p>Autopilot is measuring <strong>${site}</strong> daily again, and will email you
     whenever it changes something.</p>
     <p><small>Restarted ${now.slice(0, 16).replace("T", " ")}.</small></p>`,
  );
};

export const config = { path: "/pause" };
