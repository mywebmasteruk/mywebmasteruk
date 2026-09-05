/**
 * The enforcement layer. Everything the loop is allowed to do passes through here.
 *
 * The published taxonomy in src/data/capabilities.json is the single source of truth:
 * the website and the running system read the same file, so the page describing the
 * boundary cannot drift away from the boundary that is actually enforced.
 */
import { readFile, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));

/** Hard limits. Deliberately conservative: a runaway loop is worse than a slow one. */
export const LIMITS = {
  /** Maximum pages changed in a single run, regardless of confidence. */
  maxChangesPerRun: 3,
  /** A changed page may not change again until its measurement window closes. */
  freezeDays: 28,
  /** Week-over-week click drop that trips the circuit breaker, as a fraction. */
  circuitBreakerDrop: 0.25,
  /** Minimum clicks in the comparison window before the breaker is trusted at all. */
  circuitBreakerMinClicks: 20,
};

export async function loadCapabilities() {
  return JSON.parse(await readFile(root("src/data/capabilities.json"), "utf8"));
}

/**
 * The kill switch. A file on disk rather than a config flag, so it can be tripped
 * by anyone with repo access without understanding the system.
 */
export async function isHalted() {
  if (process.env.AUTOPILOT_HALT === "1") return "AUTOPILOT_HALT=1 is set";
  try {
    await access(root("ops/HALT"));
    return "ops/HALT file is present";
  } catch {
    return null;
  }
}

export async function loadFreezes() {
  try {
    return JSON.parse(await readFile(root("ops/data/freeze.json"), "utf8"));
  } catch {
    return {};
  }
}

export async function freezePage(path, days = LIMITS.freezeDays) {
  const freezes = await loadFreezes();
  freezes[path] = new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
  await writeFile(root("ops/data/freeze.json"), JSON.stringify(freezes, null, 2));
  return freezes[path];
}

export function isFrozen(freezes, path) {
  const until = freezes[path];
  return Boolean(until) && new Date(until) > new Date();
}

/**
 * Maps a finding to the autonomy level published in the taxonomy.
 * A finding whose capability id is not in the taxonomy is refused outright —
 * the default is "not permitted", never "probably fine".
 */
export function classify(capabilities, finding) {
  const cap = capabilities.find((c) => c.id === finding.capability);
  if (!cap) {
    return { autonomy: "refuse", reason: `capability "${finding.capability}" is not in the published taxonomy` };
  }
  if (cap.autonomy === "never") {
    return { autonomy: "refuse", reason: `"${cap.change}" is permanently out of bounds` };
  }
  return { autonomy: cap.autonomy, capability: cap };
}

/**
 * Decides what may ship this run. Returns the auto-applicable set (capped and
 * unfrozen), the set needing a pull request, and everything refused with a reason.
 */
export async function planRun(findings) {
  const capabilities = await loadCapabilities();
  const freezes = await loadFreezes();

  const auto = [];
  const propose = [];
  const refused = [];

  for (const f of findings) {
    const verdict = classify(capabilities, f);
    if (verdict.autonomy === "refuse") {
      refused.push({ ...f, reason: verdict.reason });
      continue;
    }
    if (f.target && isFrozen(freezes, f.target)) {
      refused.push({ ...f, reason: `${f.target} is frozen until ${freezes[f.target]} (measurement window open)` });
      continue;
    }
    if (verdict.autonomy === "auto") auto.push({ ...f, capability: verdict.capability });
    else propose.push({ ...f, capability: verdict.capability });
  }

  auto.sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0));
  const capped = auto.slice(0, LIMITS.maxChangesPerRun);
  const deferred = auto.slice(LIMITS.maxChangesPerRun).map((f) => ({
    ...f,
    reason: `blast-radius cap reached (${LIMITS.maxChangesPerRun} changes per run)`,
  }));

  return { auto: capped, propose, refused: [...refused, ...deferred] };
}

/**
 * Trips when performance falls sharply week over week. Returns a reason string
 * when autonomous activity should stop, or null when it is safe to proceed.
 */
export function circuitBreaker(currentWeek, previousWeek) {
  if (!currentWeek || !previousWeek) return null;
  if (previousWeek.clicks < LIMITS.circuitBreakerMinClicks) return null; // too small to read
  const drop = (previousWeek.clicks - currentWeek.clicks) / previousWeek.clicks;
  if (drop >= LIMITS.circuitBreakerDrop) {
    return `clicks fell ${(drop * 100).toFixed(0)}% week over week (${previousWeek.clicks} → ${currentWeek.clicks})`;
  }
  return null;
}
