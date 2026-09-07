/**
 * Emails the weekly report produced by the loop.
 *
 *   node ops/send-report.mjs --to someone@example.com [--date 2026-09-06] [--dry]
 *
 * The report is written as Markdown by ops/report.mjs. This turns it into an
 * email a business owner can read in 90 seconds without opening anything.
 */
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { send, verifyConnection, mailConfigured, missingMailConfig } from "../mail/send.mjs";

const argv = process.argv.slice(2);
const arg = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const dry = argv.includes("--dry");
const to = arg("to") || process.env.ADMIN_EMAIL;
const reportsDir = fileURLToPath(new URL("./reports/", import.meta.url));

if (!to) {
  console.error("No recipient. Pass --to, or set ADMIN_EMAIL.");
  process.exit(1);
}
if (!mailConfigured() && !dry) {
  console.error(`SMTP not configured. Missing: ${missingMailConfig().join(", ")}`);
  process.exit(1);
}

const files = (await readdir(reportsDir).catch(() => [])).filter((f) => f.endsWith(".md")).sort();
const name = arg("date") ? `${arg("date")}.md` : files.at(-1);
if (!name) {
  console.error("No report found. Run `node ops/loop.mjs` first.");
  process.exit(1);
}
const markdown = await readFile(reportsDir + name, "utf8");
const date = name.replace(/\.md$/, "");

/** Just enough Markdown for what report.mjs actually emits. */
function toHtml(md) {
  const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = md.split("\n");
  const out = [];
  let inCode = false;
  let inTable = false;
  for (const line of lines) {
    if (line.startsWith("```")) {
      out.push(inCode ? "</pre>" : '<pre style="background:#f4f2ec;padding:12px;border-radius:6px;font-size:13px;overflow-x:auto">');
      inCode = !inCode;
      continue;
    }
    if (inCode) { out.push(esc(line)); continue; }
    if (/^\|/.test(line)) {
      if (/^\|[\s:-]+\|$/.test(line.replace(/-+/g, "-"))) continue;
      const cells = line.split("|").slice(1, -1).map((c) => esc(c.trim()));
      if (!inTable) { out.push('<table style="border-collapse:collapse;width:100%;font-size:14px;margin:0 0 16px">'); inTable = true; }
      out.push("<tr>" + cells.map((c) => `<td style="padding:6px 10px;border-bottom:1px solid #e7e4da">${c}</td>`).join("") + "</tr>");
      continue;
    }
    if (inTable) { out.push("</table>"); inTable = false; }
    if (/^#{1,3} /.test(line)) {
      const level = line.match(/^#+/)[0].length;
      const size = [24, 19, 16][level - 1] ?? 16;
      out.push(`<h${level} style="font-size:${size}px;letter-spacing:-.02em;margin:24px 0 10px">${esc(line.replace(/^#+ /, ""))}</h${level}>`);
      continue;
    }
    if (/^[-*] /.test(line)) { out.push(`<p style="margin:0 0 6px;padding-left:14px">• ${esc(line.slice(2))}</p>`); continue; }
    if (line.trim() === "") continue;
    out.push(`<p style="margin:0 0 12px">${esc(line)}</p>`);
  }
  if (inTable) out.push("</table>");
  if (inCode) out.push("</pre>");
  return out.join("\n");
}

const html = `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;background:#fcfbf8"><div style="max-width:620px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0b0e13;font-size:16px;line-height:1.55">
<div style="padding-bottom:20px;border-bottom:1px solid #e7e4da;margin-bottom:24px"><span style="font-weight:600;letter-spacing:-.02em">mywebmaster</span></div>
${toHtml(markdown)}
<p style="margin:32px 0 0;padding-top:20px;border-top:1px solid #e7e4da;color:#5a6472;font-size:13px">
Reply to this email to change anything, or reply with the word <strong>stop</strong> to halt all automatic activity immediately.</p>
</div></body></html>`;

if (dry) {
  console.log(`DRY RUN — would send "${date}" to ${to}`);
  console.log(`  ${markdown.split("\n").length} lines of Markdown, ${html.length} chars of HTML`);
  process.exit(0);
}

const check = await verifyConnection();
if (!check.ok) {
  console.error(`SMTP rejected the connection: ${check.reason}`);
  process.exit(1);
}

const result = await send({
  to,
  subject: `Autopilot report — ${date}`,
  text: markdown,
  html,
});
console.log(result.sent ? `Sent to ${to} (${result.id})` : `Failed: ${result.reason}`);
process.exit(result.sent ? 0 : 1);
