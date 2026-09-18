/**
 * Drafting availability: disabled, unauthenticated, and ready are three different
 * states, and only the last one lets a fixer run.
 *
 * The weekly run entered its fixers with drafting on and no key, and each one
 * threw from inside the SDK — so its report blamed the fixer for what was an unset
 * secret. These check that the loop can tell "off" from "no key" before it edits
 * anything, and never mistakes a missing key for a working one.
 */
import { suite, check } from "./harness.mjs";
import { hasAiCredentials, draftingUnavailableReason, applySettings } from "../lib/ai.mjs";

suite("ai — drafting knows whether it can actually run");

const env = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"];
const saved = Object.fromEntries(env.map((k) => [k, process.env[k]]));
const clearKeys = () => env.forEach((k) => delete process.env[k]);
const restoreKeys = () =>
  env.forEach((k) => (saved[k] === undefined ? delete process.env[k] : (process.env[k] = saved[k])));

try {
  clearKeys();

  applySettings({ drafting: true });
  check(
    "no key present is detected",
    hasAiCredentials() === false,
  );
  check(
    "drafting on with no key is reported as a missing key, not as disabled",
    /no API key/.test(draftingUnavailableReason() ?? ""),
  );

  applySettings({ drafting: false });
  check(
    "drafting off reads as a deliberate choice, distinct from a missing key",
    draftingUnavailableReason() === "drafting is disabled (AI_DRAFTING=off)",
  );

  process.env.ANTHROPIC_API_KEY = "sk-test-not-real";
  applySettings({ drafting: true });
  check(
    "a key present is detected",
    hasAiCredentials() === true,
  );
  check(
    "drafting on with a key present is available — nothing holds the fixers back",
    draftingUnavailableReason() === null,
  );
} finally {
  restoreKeys();
}
