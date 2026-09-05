/**
 * Minimal Google service-account auth. No SDK: one RS256 JWT exchanged for an
 * access token. Keeps the loop's dependency surface small enough to audit.
 *
 * The key file is never read from the repo — only from GOOGLE_APPLICATION_CREDENTIALS
 * (or GSC_SERVICE_ACCOUNT), so it cannot be committed by accident.
 */
import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";

const TOKEN_URL = "https://oauth2.googleapis.com/token";

function b64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function loadCredentials() {
  const path =
    process.env.GOOGLE_APPLICATION_CREDENTIALS ||
    process.env.GSC_SERVICE_ACCOUNT ||
    `${process.env.HOME}/.config/gsc/service-account.json`;
  return JSON.parse(await readFile(path, "utf8"));
}

export async function getAccessToken(scopes) {
  const creds = await loadCredentials();
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: creds.client_email,
      scope: scopes.join(" "),
      aud: TOKEN_URL,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = b64url(signer.sign(creds.private_key));

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${signature}`,
    }),
  });
  if (!res.ok) throw new Error(`Token exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()).access_token;
}

export const SCOPES = {
  searchConsole: ["https://www.googleapis.com/auth/webmasters.readonly"],
  analytics: ["https://www.googleapis.com/auth/analytics.readonly"],
};

export async function gscFetch(path, { method = "GET", body, token } = {}) {
  const accessToken = token || (await getAccessToken(SCOPES.searchConsole));
  const res = await fetch(`https://searchconsole.googleapis.com/webmasters/v3${path}`, {
    method,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`GSC ${path} → ${res.status} ${await res.text()}`);
  return res.json();
}
