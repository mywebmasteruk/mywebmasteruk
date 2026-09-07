/**
 * Stripe webhook. Sends the emails that make the subscription feel like a
 * service rather than a card charge.
 *
 * This lives on the public site rather than the admin console because the
 * admin console sits behind Cloudflare Access, which would reject Stripe's
 * requests before any code ran. Security here comes from verifying Stripe's
 * signature, which is the mechanism designed for exactly this.
 *
 * It always returns 200 once the signature checks out, even if an email
 * fails. A non-2xx makes Stripe retry the whole event, and a retried
 * subscription event would email the customer twice.
 */
import Stripe from "stripe";
import { send } from "../../mail/send.mjs";
import { welcome, paymentFailed, cancelled, adminAlert } from "../../mail/templates.mjs";
import { sign } from "../../mail/tokens.mjs";

const money = (pence, currency = "gbp") =>
  new Intl.NumberFormat("en-GB", { style: "currency", currency: currency.toUpperCase() }).format(
    pence / 100,
  );

export default async (request) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!secret || !apiKey) {
    console.error("Webhook not configured: STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY missing");
    return new Response("Not configured", { status: 500 });
  }

  const stripe = new Stripe(apiKey);
  const signature = request.headers.get("stripe-signature");
  const raw = await request.text();

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, signature, secret);
  } catch (err) {
    // An unverified request is not from Stripe. Say nothing useful about why.
    console.error("Signature verification failed:", String(err?.message ?? err).slice(0, 200));
    return new Response("Bad signature", { status: 400 });
  }

  const results = [];
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object;
        if (s.mode !== "subscription") break;
        const website =
          s.custom_fields?.find((f) => f.key === "website")?.text?.value ?? null;
        const email = s.customer_details?.email;
        const name = s.customer_details?.name ?? null;

        // The website answer lives on the session; copy it to the customer so
        // every later view of this client can see it without replaying events.
        if (s.customer && website) {
          await stripe.customers.update(s.customer, { metadata: { website } });
        }

        let plan = "Autopilot";
        try {
          const sub = await stripe.subscriptions.retrieve(s.subscription, {
            expand: ["items.data.price.product"],
          });
          plan = sub.items.data[0]?.price?.product?.name ?? plan;
        } catch { /* the name is a nicety, not worth failing the hook over */ }

        if (email) results.push(await send({ to: email, ...welcome({ name, website, plan }) }));
        results.push(
          await send({
            to: process.env.ADMIN_EMAIL,
            ...adminAlert({
              subject: `New customer: ${website ?? email ?? "unknown"}`,
              lines: [
                `<strong>${name ?? "Unnamed"}</strong> (${email ?? "no email"}) subscribed to ${plan}.`,
                `Website: ${website ?? "not provided"}`,
                `Amount: ${money(s.amount_total ?? 0, s.currency)}${s.amount_total === 0 ? " (fully discounted)" : ""}`,
              ],
            }),
          }),
        );
        break;
      }

      case "invoice.payment_failed": {
        const inv = event.data.object;
        const customer = await stripe.customers.retrieve(inv.customer);
        if (!customer.deleted && customer.email) {
          results.push(
            await send({
              to: customer.email,
              ...paymentFailed({
                name: customer.name,
                website: customer.metadata?.website ?? null,
                amount: money(inv.amount_due ?? 0, inv.currency),
              }),
            }),
          );
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const customer = await stripe.customers.retrieve(sub.customer);
        if (!customer.deleted && customer.email) {
          // A signed link so restoring is self-serve. It opens a confirmation
          // page rather than acting, because mail clients prefetch links.
          let restoreLink = null;
          try {
            restoreLink =
              `https://mywebmaster.co.uk/api/restore?t=` +
              encodeURIComponent(
                sign({
                  action: "restore",
                  sub: customer.id,
                  website: customer.metadata?.website ?? null,
                  siteId: customer.metadata?.netlify_site_id ?? null,
                  baselineDeployId: customer.metadata?.baseline_deploy_id ?? null,
                }),
              );
          } catch (e) {
            console.error("Could not sign restore link:", String(e?.message ?? e));
          }
          results.push(
            await send({
              to: customer.email,
              ...cancelled({
                name: customer.name,
                website: customer.metadata?.website ?? null,
                restoreLink,
              }),
            }),
          );
        }
        break;
      }

      default:
        break;
    }
  } catch (err) {
    // Log loudly, acknowledge anyway: retries would duplicate customer emails.
    console.error(`Handling ${event.type} failed:`, String(err?.message ?? err).slice(0, 300));
  }

  const failed = results.filter((r) => r && !r.sent);
  if (failed.length) console.error("Email failures:", failed.map((f) => f.reason).join(" | "));

  return Response.json({
    received: true,
    type: event.type,
    emails: { attempted: results.length, failed: failed.length },
  });
};

export const config = { path: "/api/stripe-webhook" };
