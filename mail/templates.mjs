/**
 * Email templates.
 *
 * Written to be read in 30 seconds on a phone. Plain English, no jargon, and
 * the useful thing first — the same standard as the website, because an email
 * that reads differently from the site is a different company as far as the
 * reader is concerned.
 */

const SITE = "https://mywebmaster.co.uk";
const INK = "#0b0e13";
const MUTED = "#5a6472";
const LINE = "#e7e4da";

/** Minimal, table-free, inline-styled shell. Renders acceptably everywhere. */
function shell({ preheader, heading, body, cta, manageLink }) {
  return `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#fcfbf8;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</span>
<div style="max-width:560px;margin:0 auto;padding:32px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${INK};font-size:16px;line-height:1.55">
  <div style="padding-bottom:24px;border-bottom:1px solid ${LINE};margin-bottom:28px">
    <span style="font-weight:600;font-size:17px;letter-spacing:-.02em">mywebmaster</span>
  </div>
  <h1 style="font-size:24px;line-height:1.2;letter-spacing:-.02em;margin:0 0 16px">${heading}</h1>
  ${body}
  ${
    cta
      ? `<p style="margin:28px 0"><a href="${cta.href}" style="background:#c8f04a;color:${INK};text-decoration:none;font-weight:600;padding:12px 22px;border-radius:4px;display:inline-block">${cta.label}</a></p>`
      : ""
  }
  <p style="margin:32px 0 0;padding-top:20px;border-top:1px solid ${LINE};color:${MUTED};font-size:13px">
    ${manageLink ? `<a href="${manageLink}" style="color:${MUTED}"><strong>Pause, change your settings or manage billing</strong></a><br>` : ""}
    Or just reply to this email — a person reads it.<br>
    <a href="${SITE}/what-it-changes/" style="color:${MUTED}">What we can and cannot change</a>
  </p>
</div></body></html>`;
}

const p = (t) => `<p style="margin:0 0 14px">${t}</p>`;
const muted = (t) => `<p style="margin:0 0 14px;color:${MUTED};font-size:14px">${t}</p>`;

export function welcome({ name, website, plan }) {
  const who = name ? name.split(" ")[0] : "there";
  const text = `Hello ${who},

Your ${plan} subscription is active and ${website || "your site"} is now on Autopilot.

There are four things we cannot work out by looking at your site. They take about two minutes and nothing starts until you have answered them:

${SITE}/welcome/

What happens next:
- Within 2 working days we take a full copy of your site exactly as it is now, and keep it for as long as you are a client. If you ever want the original back, you ask and we put it there.
- In week one the visible fixes land first: speed, broken links, error pages, and whether AI assistants can read you. All checkable by you.
- After that, one email a week. What changed, what it did, and anything waiting for your approval. There is no dashboard to log into.

Things we will never change: your prices, your guarantees, your legal wording, or the settings that control whether Google shows your site.

Reply to this email any time. Reply with the word stop and all automatic activity halts immediately.`;

  return {
    subject: `${website || "Your site"} is on Autopilot — four quick questions`,
    text,
    html: shell({
      preheader: "Four quick questions and we can start.",
      heading: `Your site is on Autopilot.`,
      body:
        p(`Hello ${who}, your <strong>${plan}</strong> subscription is active.`) +
        p(
          `There are four things we cannot work out by looking at your site. They take about two minutes, and nothing starts until you have answered them.`,
        ) +
        p(`<strong>What happens next</strong>`) +
        muted(
          `<strong>Within 2 working days</strong> — we take a full copy of your site exactly as it is now, kept for as long as you are a client. If you ever want the original back, you ask and we put it there.`,
        ) +
        muted(
          `<strong>Week one</strong> — the visible fixes land first: speed, broken links, error pages, and whether AI assistants can read you. All checkable by you without taking our word for it.`,
        ) +
        muted(
          `<strong>Every week after</strong> — one email, 90 seconds to read. What changed, what it did, and anything waiting on you.`,
        ) +
        p(
          `We will never change your prices, your guarantees, your legal wording, or the settings that control whether Google shows your site.`,
        ),
      cta: { href: `${SITE}/welcome/`, label: "Answer the four questions" },
    }),
  };
}

export function paymentFailed({ name, website, amount }) {
  const who = name ? name.split(" ")[0] : "there";
  const text = `Hello ${who},

A payment of ${amount} for ${website || "your site"} did not go through. This is usually an expired card.

Stripe will try again automatically over the next few days. If you would rather fix it now, use the link in your original receipt to update the card.

Nothing has stopped. Autopilot carries on while this resolves, and we will only pause if it stays unpaid for a while — and we would email you before that happened.`;

  return {
    subject: `Payment did not go through for ${website || "your site"}`,
    text,
    html: shell({
      preheader: "Usually an expired card. Nothing has stopped.",
      heading: "A payment did not go through.",
      body:
        p(`Hello ${who}, a payment of <strong>${amount}</strong> failed. This is usually an expired card.`) +
        p(`Stripe will retry automatically over the next few days. To fix it now, use the link in your original receipt to update the card.`) +
        p(`<strong>Nothing has stopped.</strong> Autopilot carries on while this resolves, and we would email you before pausing anything.`),
    }),
  };
}

export function cancelled({ name, website, restoreLink }) {
  const who = name ? name.split(" ")[0] : "there";
  const text = `Hello ${who},

Your subscription has been cancelled and nothing further will be charged.

Everything we improved on ${website || "your site"} stays exactly where it is. It is part of your website, not something we switch on from our end, so there is nothing to remove.

If you would rather have your original site back — the copy we took before we touched anything — you can do that yourself here:

${restoreLink || "(reply to this email and we will send you the link)"}

It shows you exactly what would change and does nothing until you confirm.

No hard feelings either way. If it is something we got wrong, I would genuinely like to know.`;

  return {
    subject: `Cancelled — and everything we improved stays yours`,
    text,
    html: shell({
      preheader: "Nothing is removed. The original is still available if you want it.",
      heading: "Your subscription is cancelled.",
      ...(restoreLink ? { cta: { href: restoreLink, label: "Restore my original site" } } : {}),
      body:
        p(`Hello ${who}, nothing further will be charged.`) +
        p(
          `Everything we improved on ${website || "your site"} stays exactly where it is. It is part of your website rather than something we switch on from our end, so there is nothing to remove.`,
        ) +
        p(
          `If you would rather have your <strong>original site back</strong> — the copy we took before touching anything — you can do it yourself. It shows what would change and does nothing until you confirm.`,
        ) +
        p(`If we got something wrong, I would genuinely like to know.`),
    }),
  };
}

export function adminAlert({ subject, lines }) {
  const text = lines.join("\n");
  return {
    subject: `[Autopilot] ${subject}`,
    text,
    html: shell({
      preheader: subject,
      heading: subject,
      body: lines.map((l) => p(l)).join(""),
    }),
  };
}
