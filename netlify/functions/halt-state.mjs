/**
 * The stop switch, readable from anywhere without a credential.
 *
 * The pause button writes to Netlify Blobs, which is free and correct — the
 * function that writes it runs on Netlify, so it needs no credentials.
 *
 * The loop does not. It runs on a GitHub Actions runner, where none of the
 * Netlify environment exists: reading Blobs from there needs a site id and an
 * account-wide token, and that token can administer every site on the team,
 * including several businesses that have nothing to do with Autopilot. Copying
 * it into CI to read one boolean is a bad trade.
 *
 * So the state is published here instead. No authentication, because there is
 * nothing to protect: it says only whether we are currently allowed to change a
 * website we were hired to change, and anyone who wants to know that is welcome
 * to. The loop fetches it over plain HTTPS and, crucially, can tell the
 * difference between "not halted" and "could not ask" — which a missing
 * credential silently cannot.
 */
const HALT_KEY = "autopilot:halt";

export default async () => {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  };

  try {
    const { getStore } = await import("@netlify/blobs");
    const state = await getStore("autopilot").get(HALT_KEY, { type: "json" });

    // No key at all means nobody has ever pressed it. That is a real answer.
    if (!state) {
      return new Response(JSON.stringify({ readable: true, halted: false, reason: null }), { headers });
    }

    // Anything that is not an explicit, well-formed `false` counts as halted.
    const halted = state.halted !== false;
    return new Response(JSON.stringify({
      readable: true,
      halted,
      since: state.at ?? null,
      by: state.by ?? null,
      site: state.site ?? null,
      reason: halted ? "the customer pressed stop" : null,
    }), { headers });
  } catch (err) {
    /**
     * 503, not 200. A caller that cannot tell "running" from "we could not
     * check" will assume running, and the one time that assumption is wrong is
     * the time somebody has just asked us to stop.
     */
    return new Response(JSON.stringify({
      readable: false,
      halted: null,
      reason: `cannot read the stop switch: ${String(err.message ?? err).slice(0, 120)}`,
    }), { status: 503, headers });
  }
};

export const config = { path: "/halt.json" };
