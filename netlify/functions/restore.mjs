/**
 * Self-serve restore of a customer's original site.
 *
 * GET  shows what would change and asks for confirmation.
 * POST performs the restore.
 *
 * The split matters: mail clients prefetch links to scan them, so a GET that
 * acted would fire the moment the email landed, with nobody having clicked.
 * Anything destructive therefore needs a real form submission.
 *
 * Restores are executed by rolling back to the deploy that was live before
 * Autopilot's first change. Netlify keeps every deploy, so this is a single
 * call rather than a rebuild — and it is itself reversible, because the
 * current deploy stays in the history too.
 */
import { verify } from "../../mail/tokens.mjs";
import { send } from "../../mail/send.mjs";
import { adminAlert } from "../../mail/templates.mjs";

const page = (title, body, accent = "#c8f04a") => `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${title} · MyWebMaster</title>
<style>
 body{margin:0;background:#fcfbf8;color:#0b0e13;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55}
 .wrap{max-width:620px;margin:0 auto;padding:48px 24px}
 h1{font-size:28px;letter-spacing:-.02em;margin:0 0 16px}
 p{margin:0 0 14px} .muted{color:#5a6472;font-size:14px}
 .box{border:1px solid #e7e4da;border-radius:10px;padding:20px;background:#fff;margin:24px 0}
 button{background:${accent};color:#0b0e13;border:0;font:inherit;font-weight:600;padding:12px 22px;border-radius:4px;cursor:pointer}
 a{color:#4f6d08}
 .brand{font-weight:600;letter-spacing:-.02em;padding-bottom:20px;border-bottom:1px solid #e7e4da;margin-bottom:28px}
</style></head><body><div class="wrap"><div class="brand">mywebmaster</div>${body}</div></body></html>`;

export default async (request) => {
  const url = new URL(request.url);
  const token = url.searchParams.get("t");
  const claim = token ? verify(token) : null;

  if (!claim || claim.action !== "restore") {
    return new Response(
      page("Link expired", `<h1>This link has expired.</h1>
       <p>Restore links are valid for 30 days. Email
       <a href="mailto:autopilot@mywebmaster.co.uk">autopilot@mywebmaster.co.uk</a> and we will send a fresh one.</p>`),
      { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  const site = claim.website ?? "your site";

  if (request.method !== "POST") {
    return new Response(
      page(
        "Restore your original site",
        `<h1>Restore ${site} to how it was?</h1>
         <p>This puts back the copy we took before Autopilot changed anything.</p>
         <div class="box">
           <p><strong>What this does</strong></p>
           <p class="muted">Every improvement made since we started is removed, and the site goes back to
           exactly how it looked on day one. Speed fixes, repaired links and content changes all go with it.</p>
           <p><strong>What it does not do</strong></p>
           <p class="muted">Nothing is deleted permanently. The improved version stays in your site's history,
           so this can be undone the same way.</p>
         </div>
         <form method="POST"><input type="hidden" name="t" value="${token}">
           <button type="submit">Yes, restore my original site</button></form>
         <p class="muted" style="margin-top:20px">Changed your mind? Close this page — nothing happens unless you press the button.</p>`,
      ),
      { headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  // --- Perform the restore -------------------------------------------------
  const token_ = process.env.NETLIFY_API_TOKEN;
  const siteId = claim.siteId;
  const deployId = claim.baselineDeployId;
  let outcome = { ok: false, reason: "not configured" };

  if (token_ && siteId && deployId) {
    try {
      const res = await fetch(
        `https://api.netlify.com/api/v1/sites/${siteId}/deploys/${deployId}/restore`,
        { method: "POST", headers: { authorization: `Bearer ${token_}` } },
      );
      outcome = res.ok
        ? { ok: true }
        : { ok: false, reason: `Netlify returned ${res.status}` };
    } catch (err) {
      outcome = { ok: false, reason: String(err?.message ?? err).slice(0, 200) };
    }
  }

  await send({
    to: process.env.ADMIN_EMAIL,
    ...adminAlert({
      subject: outcome.ok ? `Original site restored: ${site}` : `Restore FAILED: ${site}`,
      lines: [
        `Customer requested their original site back for <strong>${site}</strong>.`,
        outcome.ok
          ? `Rolled back to deploy <code>${deployId}</code>. Nothing was deleted; the improved version is still in the deploy history.`
          : `<strong>It did not complete: ${outcome.reason}</strong> — this needs doing by hand.`,
      ],
    }),
  });

  return new Response(
    page(
      outcome.ok ? "Restored" : "We are on it",
      outcome.ok
        ? `<h1>Your original site is back.</h1>
           <p>${site} now looks exactly as it did before we started. It usually takes under a minute to appear.</p>
           <p class="muted">Nothing was deleted. If you change your mind, reply to any email from us and we can
           put the improved version back just as easily.</p>`
        : `<h1>We have your request.</h1>
           <p>Something went wrong doing it automatically, so a person has been alerted and will handle it today.
           You do not need to do anything else.</p>
           <p class="muted">Sorry — this is the part that was meant to be automatic.</p>`,
      outcome.ok ? "#c8f04a" : "#f0a93b",
    ),
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
};

export const config = { path: "/api/restore" };
