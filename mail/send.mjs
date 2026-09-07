/**
 * SMTP delivery, shared by the Stripe webhook and the weekly report.
 *
 * Plain SMTP rather than an email platform: it is one dependency, the
 * credentials belong to the business rather than a third party, and there is
 * no vendor between us and the customer's inbox.
 *
 * Every message is sent as both plain text and HTML. Plain text is not a
 * fallback nobody sees — it is what many clients show in previews, and what
 * survives when images and styles are stripped.
 */
import nodemailer from "nodemailer";

const required = ["SMTP_HOST", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"];

export function mailConfigured() {
  return required.every((k) => Boolean(process.env[k]));
}

export function missingMailConfig() {
  return required.filter((k) => !process.env[k]);
}

let transport;
function getTransport() {
  if (transport) return transport;
  const port = Number(process.env.SMTP_PORT) || 587;
  transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 is implicit TLS; 587 upgrades with STARTTLS. Getting this wrong is
    // the single most common cause of a silent hang on send.
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    requireTLS: port !== 465,
  });
  return transport;
}

/**
 * Sends one message. Returns a result rather than throwing, because a failed
 * email must never take down the webhook that triggered it — Stripe would
 * retry the whole event and the customer could be processed twice.
 */
export async function send({ to, subject, text, html, replyTo, bcc }) {
  if (!mailConfigured()) {
    return { sent: false, reason: `SMTP not configured: missing ${missingMailConfig().join(", ")}` };
  }
  try {
    const info = await getTransport().sendMail({
      from: process.env.SMTP_FROM,
      to,
      bcc: bcc || process.env.ADMIN_EMAIL || undefined,
      replyTo: replyTo || process.env.REPLY_TO || process.env.SMTP_FROM,
      subject,
      text,
      html,
    });
    return { sent: true, id: info.messageId };
  } catch (err) {
    return { sent: false, reason: String(err?.message ?? err).slice(0, 300) };
  }
}

/** Confirms the server accepts the credentials, without sending anything. */
export async function verifyConnection() {
  if (!mailConfigured()) return { ok: false, reason: `missing ${missingMailConfig().join(", ")}` };
  try {
    await getTransport().verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: String(err?.message ?? err).slice(0, 300) };
  }
}
