/**
 * The customer's own changelog, with every entry restorable.
 *
 * Rather than a single "put back the original", this lists every version of
 * the site and lets them pick. Going all the way back is simply the oldest
 * entry — usually what someone wants is "how it was before last Tuesday",
 * not "erase four months of work".
 *
 * GET  lists the versions.
 * POST restores the chosen one.
 *
 * The split is deliberate: mail clients prefetch links to scan them, so a GET
 * that acted would fire on delivery with nobody having clicked.
 */
import { verify } from "../../mail/tokens.mjs";
import { send } from "../../mail/send.mjs";
import { adminAlert } from "../../mail/templates.mjs";

const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const page = (title, body) => `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>${esc(title)} · MyWebMaster</title>
<style>
 body{margin:0;background:#fcfbf8;color:#0b0e13;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55}
 .wrap{max-width:680px;margin:0 auto;padding:44px 24px}
 h1{font-size:27px;letter-spacing:-.02em;margin:0 0 14px}
 p{margin:0 0 14px} .muted{color:#5a6472;font-size:14px}
 .brand{font-weight:600;letter-spacing:-.02em;padding-bottom:20px;border-bottom:1px solid #e7e4da;margin-bottom:26px}
 ol{list-style:none;padding:0;margin:26px 0;position:relative}
 ol::before{content:"";position:absolute;left:5px;top:10px;bottom:10px;width:1px;background:#d8d4c8}
 li{position:relative;padding-left:26px;padding-bottom:20px}
 li::before{content:"";position:absolute;left:0;top:7px;width:11px;height:11px;border-radius:50%;background:#fcfbf8;border:2px solid #9ec421}
 li.now::before{background:#9ec421}
 li.first::before{border-color:#5a6472}
 .when{font-family:ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:#5a6472}
 .what{font-weight:600;margin:3px 0 2px}
 .tag{display:inline-block;font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:.07em;text-transform:uppercase;border:1px solid #d8d4c8;border-radius:99px;padding:2px 7px;color:#5a6472;margin-left:6px}
 button{background:#c8f04a;color:#0b0e13;border:0;font:inherit;font-size:14px;font-weight:600;padding:7px 14px;border-radius:4px;cursor:pointer;margin-top:8px}
 button.plain{background:#fff;border:1px solid #d8d4c8}
 a{color:#4f6d08}
 .box{border:1px solid #e7e4da;border-radius:10px;padding:18px;background:#fff;margin:22px 0}
</style></head><body><div class="wrap"><div class="brand">mywebmaster</div>${body}</div></body></html>`;

const expired = () =>
  new Response(
    page("Link expired", `<h1>This link has expired.</h1>
      <p>Version links last 30 days. Email <a href="mailto:autopilot@mywebmaster.co.uk">autopilot@mywebmaster.co.uk</a>
      and we will send a fresh one.</p>`),
    { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
  );

async function listVersions(siteId, apiToken) {
  const headers = { authorization: `Bearer ${apiToken}` };
  // published_at is set on every deploy that was ever live, so it cannot
  // identify the current one. The site record names it explicitly.
  const [siteRes, deployRes] = await Promise.all([
    fetch(`https://api.netlify.com/api/v1/sites/${siteId}`, { headers }),
    fetch(`https://api.netlify.com/api/v1/sites/${siteId}/deploys?per_page=40`, { headers }),
  ]);
  if (!deployRes.ok) throw new Error(`Netlify returned ${deployRes.status}`);
  const liveId = siteRes.ok ? (await siteRes.json())?.published_deploy?.id ?? null : null;

  return (await deployRes.json())
    .filter((d) => d.state === "ready")
    .map((d) => ({
      id: d.id,
      when: d.published_at ?? d.created_at,
      title: d.title || d.commit_ref?.slice(0, 7) || "Update",
      published: d.id === liveId,
    }));
}

export default async (request) => {
  const url = new URL(request.url);
  const isPost = request.method === "POST";
  const form = isPost ? await request.formData() : null;
  const token = (isPost ? form.get("t") : url.searchParams.get("t")) ?? null;
  const claim = token ? verify(String(token)) : null;
  if (!claim || claim.action !== "restore") return expired();

  const site = claim.website ?? "your site";
  const apiToken = process.env.NETLIFY_API_TOKEN;
  const siteId = claim.siteId;

  if (!apiToken || !siteId) {
    await send({
      to: process.env.ADMIN_EMAIL,
      ...adminAlert({
        subject: `Version history unavailable: ${site}`,
        lines: [`A customer opened their version history for <strong>${site}</strong> but it is not wired up yet.`],
      }),
    });
    return new Response(
      page("We are on it", `<h1>We have your request.</h1>
        <p>Your version history is not available automatically yet, so a person has been alerted and will
        sort this out today. You do not need to do anything else.</p>`),
      { headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  let versions;
  try {
    versions = await listVersions(siteId, apiToken);
  } catch (err) {
    return new Response(
      page("Temporarily unavailable", `<h1>We could not load your history.</h1>
        <p class="muted">${esc(String(err.message))}</p>
        <p>Try again in a minute, or reply to any email from us.</p>`),
      { status: 502, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  // ---- Restore -----------------------------------------------------------
  if (isPost) {
    const target = String(form.get("deploy") ?? "");
    // Only a version from this site's own history may be restored — never an
    // id supplied by whoever holds the link.
    const chosen = versions.find((v) => v.id === target);
    if (!chosen) return expired();

    const res = await fetch(
      `https://api.netlify.com/api/v1/sites/${siteId}/deploys/${chosen.id}/restore`,
      { method: "POST", headers: { authorization: `Bearer ${apiToken}` } },
    );
    const ok = res.ok;

    await send({
      to: process.env.ADMIN_EMAIL,
      ...adminAlert({
        subject: ok ? `Version restored: ${site}` : `Restore FAILED: ${site}`,
        lines: [
          `<strong>${esc(site)}</strong> restored to "${esc(chosen.title)}" from ${new Date(chosen.when).toUTCString()}.`,
          ok ? "Nothing was deleted; every other version is still in the history." : `<strong>It failed: ${res.status}</strong> — needs doing by hand.`,
        ],
      }),
    });

    return new Response(
      page(
        ok ? "Restored" : "We are on it",
        ok
          ? `<h1>Done — your site is back to that version.</h1>
             <p>${esc(site)} now matches <strong>${esc(chosen.title)}</strong> from
             ${new Date(chosen.when).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}.
             It usually appears within a minute.</p>
             <p class="muted">Nothing was deleted. Every other version is still here, including the one you just
             moved away from — so this can be undone the same way.</p>
             <p><a href="/api/restore?t=${encodeURIComponent(String(token))}">Back to your version history</a></p>`
          : `<h1>We have your request.</h1>
             <p>It did not complete automatically, so a person has been alerted and will handle it today.</p>`,
      ),
      { headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  // ---- List --------------------------------------------------------------
  const rows = versions
    .map((v, i) => {
      const isNow = v.published;
      const isFirst = i === versions.length - 1;
      const cls = [isNow ? "now" : "", isFirst ? "first" : ""].filter(Boolean).join(" ");
      const when = new Date(v.when).toLocaleString("en-GB", {
        day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      });
      return `<li class="${cls}">
        <div class="when">${esc(when)}${isNow ? '<span class="tag">live now</span>' : ""}${isFirst ? '<span class="tag">before we started</span>' : ""}</div>
        <div class="what">${esc(v.title)}</div>
        ${isNow ? '<p class="muted" style="margin:2px 0 0">This is what visitors see.</p>'
                : `<form method="POST"><input type="hidden" name="t" value="${esc(token)}">
                   <input type="hidden" name="deploy" value="${esc(v.id)}">
                   <button class="plain" type="submit">Put this version back</button></form>`}
      </li>`;
    })
    .join("");

  return new Response(
    page(
      "Your version history",
      `<h1>Every version of ${esc(site)}.</h1>
       <p>Pick any point and put it back. The oldest entry is your site exactly as it was before we
       touched anything.</p>
       <div class="box"><p class="muted" style="margin:0">Nothing is ever deleted. Restoring moves the site to
       a previous version and leaves every other one here, so any change can be undone — including
       the restore itself.</p></div>
       <ol>${rows}</ol>
       <p class="muted">Not what you were looking for? Reply to any email from us and a person will help.</p>`,
    ),
    { headers: { "content-type": "text/html; charset=utf-8" } },
  );
};

export const config = { path: "/api/restore" };
