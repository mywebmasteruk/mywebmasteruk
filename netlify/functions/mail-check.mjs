/**
 * Diagnostic endpoint for the SMTP path. Guarded by a shared token because it
 * reveals which settings are present and what the mail server said back.
 *
 *   GET /api/mail-check?token=…            verify the connection only
 *   GET /api/mail-check?token=…&to=a@b.c   also send one test message
 *
 * Never returns credential values — only whether each is set, and the server's
 * own error text, which is what actually explains a failure.
 */
import { verifyConnection, send, mailConfigured, missingMailConfig } from "../../mail/send.mjs";

export default async (request) => {
  const url = new URL(request.url);
  const expected = process.env.MAIL_CHECK_TOKEN;
  if (!expected || url.searchParams.get("token") !== expected) {
    return new Response("Not found", { status: 404 });
  }

  /**
   * Describes the shape of each credential without revealing it. Copy-paste
   * through a word processor silently substitutes curly quotes and dashes,
   * which look identical on screen and fail authentication — that has already
   * happened once here, to SMTP_HOST.
   */
  const shape = (v) => {
    if (!v) return null;
    const odd = [...v].filter((c) => c.charCodeAt(0) > 126);
    return {
      length: v.length,
      nonAscii: odd.length ? odd.map((c) => `U+${c.charCodeAt(0).toString(16).toUpperCase()}`) : null,
      wrappedInQuotes: /^["'\u2018\u2019\u201c\u201d].*["'\u2018\u2019\u201c\u201d]$/.test(v) || null,
      hasSurroundingSpace: v !== v.trim() || null,
    };
  };

  const settings = {
    host: process.env.SMTP_HOST ?? null,
    port: process.env.SMTP_PORT ?? "587 (default)",
    from: process.env.SMTP_FROM ?? null,
    admin: process.env.ADMIN_EMAIL ?? null,
    userShape: shape(process.env.SMTP_USER),
    // A mailbox address is not a secret — it is printed on the website. Surfacing
    // the address hidden inside a mangled value lets the paste be repaired
    // without a human having to retype a credential.
    userLooksLike:
      (process.env.SMTP_USER ?? "").match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/)?.[0] ?? null,
    passShape: shape(process.env.SMTP_PASS),
  };

  if (!mailConfigured()) {
    return Response.json({ ok: false, stage: "config", missing: missingMailConfig(), settings });
  }

  const conn = await verifyConnection();
  if (!conn.ok) return Response.json({ ok: false, stage: "connect", reason: conn.reason, settings });

  const to = url.searchParams.get("to");
  if (!to) return Response.json({ ok: true, stage: "connect", settings });

  const result = await send({
    to,
    bcc: "",
    subject: "Autopilot SMTP check",
    text: "Sending works. Nothing else to do.",
    html: '<p style="font-family:sans-serif">Sending works. Nothing else to do.</p>',
  });
  return Response.json({ ok: result.sent, stage: "send", reason: result.reason ?? null, settings });
};

export const config = { path: "/api/mail-check" };
