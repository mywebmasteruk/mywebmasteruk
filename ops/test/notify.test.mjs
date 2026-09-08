/**
 * Telling the customer.
 *
 * This is what replaced asking permission, so an undelivered notice is not a
 * cosmetic failure — it is an unaccountable change. Most of these are about a
 * notice surviving a failure rather than being quietly dropped or marked sent.
 */
import { suite, check } from "./harness.mjs";
import { recipientFor, isInstant, digestDue, notifyConfig } from "../lib/notify.mjs";

suite("notify — who the email goes to");

const client = { slug: "harbourside", contact: { email: "dan@harboursideelectrical.co.uk", name: "Dan Whitfield" } };
let r = recipientFor(client);
check("the customer's own address is used", r.to === "dan@harboursideelectrical.co.uk");
check("and their name comes with it", r.name === "Dan Whitfield");

delete process.env.CUSTOMER_EMAIL;
process.env.ADMIN_EMAIL = "ops@mywebmaster.co.uk";
r = recipientFor({ slug: "x" });
check("a client with no contact email yields no recipient", r.to === "");
check("it never falls back to the operator's address", r.to !== "ops@mywebmaster.co.uk");
check("and says why, so the failure is visible", r.reason.includes("no contact email"));

r = recipientFor(null);
check("with no client at all it still refuses the operator's address", r.to !== "ops@mywebmaster.co.uk");

process.env.CUSTOMER_EMAIL = "owner@example.com";
check("CUSTOMER_EMAIL is the fallback for our own site", recipientFor(null).to === "owner@example.com");
delete process.env.CUSTOMER_EMAIL;
delete process.env.ADMIN_EMAIL;

suite("notify — what goes out when");

check("a wording change is sent the same day", isInstant({ class: "notify" }));
check("a mechanical repair is batched", !isInstant({ class: "auto" }));

const queue = (pending, lastDigestAt = null) => ({ pending, sent: [], lastDigestAt });
check("nothing batched means no digest", digestDue(queue([{ class: "notify" }])) === false);
check("a first batch is due immediately", digestDue(queue([{ class: "auto" }])) === true);
check("a batch is not due again the same day",
  digestDue(queue([{ class: "auto" }], new Date().toISOString())) === false);
check("and is due once the cadence has elapsed",
  digestDue(queue([{ class: "auto" }], new Date(Date.now() - 8 * 864e5).toISOString())) === true);
check("the default cadence is weekly", notifyConfig.cadence === "weekly");
