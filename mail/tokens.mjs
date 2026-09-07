/**
 * Signed, expiring links for actions a customer takes from an email — pausing,
 * restoring, changing settings — without an account or a password.
 *
 * HMAC over the payload, so a token cannot be edited to point at someone else's
 * site. Short-lived, because an email lives in an inbox for years.
 */
import { createHmac, timingSafeEqual, randomUUID } from "node:crypto";

const b64url = (buf) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64url = (s) =>
  Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

function secret() {
  const s = process.env.LINK_SIGNING_SECRET;
  if (!s) throw new Error("LINK_SIGNING_SECRET is not set");
  return s;
}

/**
 * @param {object} payload  must include `action`; `sub` identifies the subject
 * @param {number} ttlDays  how long the link stays valid
 */
export function sign(payload, ttlDays = 30) {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlDays * 86400, jti: randomUUID() };
  const data = b64url(JSON.stringify(body));
  const mac = b64url(createHmac("sha256", secret()).update(data).digest());
  return `${data}.${mac}`;
}

/** Returns the payload, or null if the token is forged, altered or expired. */
export function verify(token) {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [data, mac] = token.split(".");
  if (!data || !mac) return null;
  try {
    const expected = createHmac("sha256", secret()).update(data).digest();
    const given = fromB64url(mac);
    if (given.length !== expected.length) return null;
    if (!timingSafeEqual(given, expected)) return null;
    const payload = JSON.parse(fromB64url(data).toString("utf8"));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
