/**
 * Returns the few details the welcome page needs to avoid asking a customer
 * for something they typed 30 seconds earlier during checkout.
 *
 * Deliberately narrow: website, first name and plan. No email, no address, no
 * payment details — a session id travels in a URL and ends up in browser
 * history, so it should unlock as little as possible.
 */
import Stripe from "stripe";

export default async (request) => {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) return Response.json({ error: "unavailable" }, { status: 503 });

  const id = new URL(request.url).searchParams.get("session_id");
  if (!id || !/^cs_(live|test)_[A-Za-z0-9]+$/.test(id)) {
    return Response.json({ error: "bad id" }, { status: 400 });
  }

  try {
    const stripe = new Stripe(apiKey);
    const s = await stripe.checkout.sessions.retrieve(id, {
      expand: ["line_items.data.price.product"],
    });
    // Only a completed checkout tells us anything worth returning.
    if (s.status !== "complete") return Response.json({ error: "not complete" }, { status: 404 });

    const website = s.custom_fields?.find((f) => f.key === "website")?.text?.value ?? null;
    const firstName = (s.customer_details?.name ?? "").trim().split(/\s+/)[0] || null;
    const plan = s.line_items?.data?.[0]?.price?.product?.name ?? null;

    return new Response(JSON.stringify({ website, firstName, plan }), {
      headers: { "content-type": "application/json", "cache-control": "private, max-age=60" },
    });
  } catch {
    return Response.json({ error: "not found" }, { status: 404 });
  }
};

export const config = { path: "/api/session-info" };
