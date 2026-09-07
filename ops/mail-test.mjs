/**
 * Confirms SMTP works before anything depends on it.
 *   node ops/mail-test.mjs --to you@example.com
 */
import { verifyConnection, send, mailConfigured, missingMailConfig } from "../mail/send.mjs";

const i = process.argv.indexOf("--to");
const to = i >= 0 ? process.argv[i + 1] : process.env.ADMIN_EMAIL;

console.log("1. Configuration");
if (!mailConfigured()) {
  console.log(`   MISSING: ${missingMailConfig().join(", ")}`);
  process.exit(1);
}
console.log(`   host ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587} as ${process.env.SMTP_USER}`);
console.log(`   from ${process.env.SMTP_FROM}`);

console.log("2. Connection");
const c = await verifyConnection();
console.log(c.ok ? "   accepted" : `   REJECTED: ${c.reason}`);
if (!c.ok) process.exit(1);

if (!to) { console.log("3. Skipped send — pass --to to send a real message."); process.exit(0); }

console.log(`3. Sending to ${to}`);
const r = await send({
  to,
  subject: "Autopilot SMTP test",
  text: "If you are reading this, sending works.\n\nNothing else to do.",
  html: '<div style="font-family:-apple-system,sans-serif;font-size:16px;color:#0b0e13"><p>If you are reading this, sending works.</p><p style="color:#5a6472;font-size:14px">Nothing else to do.</p></div>',
});
console.log(r.sent ? `   sent (${r.id})` : `   FAILED: ${r.reason}`);
process.exit(r.sent ? 0 : 1);
