/**
 * The enforcement layer. Everything the loop is allowed to do passes through here.
 *
 * The published taxonomy in src/data/capabilities.json is the single source of truth:
 * the website and the running system read the same file, so the page describing the
 * boundary cannot drift away from the boundary that is actually enforced.
 */
import { readFile, writeFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { frozenPaths, restoreReady } from "./fleet.mjs";

const root = (p) => fileURLToPath(new URL(`../../${p}`, import.meta.url));

/** Hard limits. Deliberately conservative: a runaway loop is worse than a slow one. */
export const LIMITS = {
  /**
   * Blast radius, split by class. Mechanical repairs are cheap, reversible and
   * carry no judgement, so the loop may do a batch of them; changes to the words
   * on the page cost the customer attention to review, so they stay rationed
   * even though nothing blocks them any more.
   */
  maxAutoPerRun: 10,
  maxNotifyPerRun: 3,
  /** A changed page may not change again until its measurement window closes. */
  freezeDays: 28,
  /** Week-over-week click drop that trips the circuit breaker, as a fraction. */
  circuitBreakerDrop: 0.25,
  /** Minimum clicks in the comparison window before the click signal is trusted. */
  circuitBreakerMinClicks: 20,
  /**
   * The low-volume signals. Impressions run roughly a hundred times the volume of
   * clicks, so they are readable on a site that has barely any clicks at all —
   * which is most customers for their first months.
   */
  circuitBreakerImpressionDrop: 0.35,
  circuitBreakerMinImpressions: 200,
  /** Places of average position lost before the run is treated as harmful. */
  circuitBreakerPositionSlip: 5,
};

export async function loadCapabilities() {
  return JSON.parse(await readFile(root("src/data/capabilities.json"), "utf8"));
}

/** Where netlify/functions/pause.mjs records the customer's decision. */
const HALT_STORE = "autopilot";
const HALT_KEY = "autopilot:halt";

/**
 * The published stop state, for callers that cannot reach Blobs directly.
 *
 * Serving it over HTTP from the site itself is what makes the switch readable from
 * anywhere without handing out credentials: the account-wide Netlify token also
 * opens masjidweb, byesar, filmtvwork and maloca, and copying it into CI to read
 * one boolean would widen the blast radius of all of them for no gain.
 */
const HALT_URL = () => process.env.HALT_STATE_URL || `${process.env.SITE_URL || "https://mywebmaster.co.uk"}/halt.json`;

async function haltOverHttp() {
  const res = await fetch(HALT_URL(), { headers: { accept: "application/json" } });
  // 503 is the deliberate "I could not ask" response, and it carries a body.
  const body = await res.json().catch(() => null);
  if (!res.ok && res.status !== 503) throw new Error(`${res.status} from ${HALT_URL()}`);
  if (!body || body.readable === false) {
    throw new Error(body?.reason ?? `stop state unreadable (${res.status})`);
  }
  return body.halted === true
    ? `the customer stopped Autopilot${body.since ? ` on ${String(body.since).slice(0, 10)}` : ""} (${body.by ?? "customer link"})`
    : haltReason({ halted: body.halted });
}

/**
 * The kill switch. Three sources, any one of which stops everything:
 *
 *   AUTOPILOT_HALT=1   an operator, via the environment
 *   ops/HALT           an operator, via a file anyone with repo access can create
 *   autopilot:halt     the customer, via the one-click link in every email
 *
 * The customer's own stop button is the one that matters most and lives furthest
 * away, so it is read fail-closed — but only when it matters. The question is not
 * "where am I running?", it is **"am I about to change anything?"**. An observe-only
 * run that cannot read the switch has changed nothing and can say so; a writing run
 * that cannot read it is about to act without knowing whether it was told to stop.
 *
 * Keying on intent rather than on environment variables is what makes this correct
 * in all three places the loop runs — a laptop, a GitHub runner, and Netlify —
 * without any env var being kept in sync. Sniffing for `NETLIFY_*` was wrong: the
 * scheduled run happens on `ubuntu-latest` with none of them set, so the guard
 * would have concluded "not production" and proceeded, on the one run that writes.
 *
 * A day of no changes costs nothing. A day of changes after somebody pressed stop
 * costs the customer, and it is the single worst bug this product could have.
 */
export async function isHalted({ willWrite = true } = {}) {
  if (process.env.AUTOPILOT_HALT === "1") return "AUTOPILOT_HALT=1 is set";
  try {
    await access(root("ops/HALT"));
    return "ops/HALT file is present";
  } catch {
    /* no operator halt file; carry on to the customer's own switch */
  }

  const failures = [];

  // Direct read first: faster, and it does not depend on the site being up.
  try {
    const { getStore } = await import("@netlify/blobs");
    return haltReason(await getStore(HALT_STORE).get(HALT_KEY, { type: "json" }));
  } catch (err) {
    failures.push(`blobs: ${String(err?.message ?? err).slice(0, 90)}`);
  }

  // Then the published state, which needs no credentials.
  try {
    return await haltOverHttp();
  } catch (err) {
    failures.push(`${HALT_URL()}: ${String(err?.message ?? err).slice(0, 90)}`);
  }

  if (!willWrite) return null; // nothing is about to change; report and move on
  return `cannot read the customer's stop switch (${failures.join("; ")}) — refusing to change anything without it`;
}

/**
 * Reads the stored decision. Split out from the fetch above so the rule can be
 * tested directly — the fetch is one line of plumbing, but getting this wrong
 * means running against a customer who told us to stop.
 *
 * Anything that is not an explicit, well-formed "not halted" halts. A missing key
 * is fine (nobody has ever pressed it); a key we cannot make sense of is not.
 */
export function haltReason(state) {
  if (state === null || state === undefined) return null; // never pressed
  if (typeof state !== "object") return "the stop switch holds something unreadable — refusing to act on a guess";
  if (state.halted === false) return null;
  if (state.halted === true) {
    const when = state.at ? `on ${String(state.at).slice(0, 10)}` : "at an unrecorded time";
    return `the customer stopped Autopilot ${when} (${state.by ?? "unknown source"})`;
  }
  return "the stop switch holds something unreadable — refusing to act on a guess";
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

/**
 * Work the loop has already decided not to do, and why.
 *
 * Without this the same finding is raised every night for ever: the analyser has
 * no memory, so a query the model correctly refused to write a page about comes
 * back tomorrow with the same evidence and the same answer. Recording the refusal
 * turns a daily cost into a one-off one, and makes the reasoning auditable —
 * "we chose not to, on this date, for this reason" is a better artefact than
 * silence.
 *
 * Deliberately not permanent: a decision made against 90 days of data deserves
 * revisiting when the data has moved on.
 */
const DECLINE_DAYS = 90;

export async function loadDeclined() {
  try {
    return JSON.parse(await readFile(root("ops/data/declined.json"), "utf8"));
  } catch {
    return {};
  }
}

/** A stable identity for a finding across runs. */
export function findingKey(finding) {
  const cap = finding.capability?.id ?? finding.capability;
  return `${cap}:${finding.evidence?.query ?? finding.target ?? finding.title}`;
}

export async function decline(finding, reason) {
  const declined = await loadDeclined();
  declined[findingKey(finding)] = {
    reason,
    at: new Date().toISOString().slice(0, 10),
    until: new Date(Date.now() + DECLINE_DAYS * 864e5).toISOString().slice(0, 10),
    title: finding.title,
  };
  await writeFile(root("ops/data/declined.json"), JSON.stringify(declined, null, 2));
  return declined[findingKey(finding)];
}

export function isDeclined(declined, finding) {
  const entry = declined[findingKey(finding)];
  return entry && new Date(entry.until) > new Date() ? entry : null;
}

/**
 * Whether a copy of the customer's site as we found it exists.
 *
 * Deliberately a file on disk rather than a config flag, for the same reason the
 * kill switch is: it is either there or it is not, and nobody can assert it into
 * existence. Netlify's deploy history does not count — that covers versions we
 * created, not what was there before we arrived.
 */
export async function hasSnapshot(client = null) {
  // A client record is authoritative: the pipeline took the snapshot and knows
  // whether one was even applicable.
  if (client) return restoreReady(client).ready;
  return (await readSnapshot()).ready;
}

/**
 * Reads the standalone snapshot file and says whether the restore promise behind
 * this site is real, along with anything it cannot do.
 *
 * The `applicable` flag carries the load. A new venture has no previous site, so
 * there is no snapshot to take and no promise being made — gating on the mere
 * presence of pages would block that site's wording changes for ever, on a
 * promise with no subject. Only a site we replaced needs a captured original.
 */
export async function readSnapshot() {
  const path = process.env.SNAPSHOT_PATH || root("ops/data/snapshot.json");
  let snapshot;
  try {
    snapshot = JSON.parse(await readFile(path, "utf8"));
  } catch {
    return { ready: false, reason: "no snapshot of the original site has been taken", limitations: [] };
  }

  const limitations = snapshot.limitations ?? [];
  if (snapshot.applicable === false) {
    return { ready: true, reason: "nothing pre-existed, so there is nothing to restore", limitations };
  }
  if (!(snapshot.capturedAt && (snapshot.pages?.length || snapshot.archive))) {
    return { ready: false, reason: "the snapshot file exists but holds nothing restorable", limitations };
  }
  return {
    ready: true,
    reason: `${snapshot.pages?.length ?? 0} page(s) captured ${String(snapshot.capturedAt).slice(0, 10)}` +
      (snapshot.origin === "adopted" ? ", assembled after the rebuild rather than before it" : ""),
    origin: snapshot.origin ?? null,
    limitations,
  };
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
    return {
      autonomy: "refuse",
      outOfBounds: true,
      capability: cap,
      reason: `"${cap.change}" is permanently out of bounds — this is yours to decide`,
    };
  }
  return { autonomy: cap.autonomy, capability: cap };
}

/**
 * Decides what ships this run.
 *
 * Nothing here waits for an operator any more. The three outcomes are:
 *
 *   auto    — applied, and summarised in the customer's next scheduled report.
 *   notify  — applied, and emailed to the customer the same day.
 *   decide  — genuinely the customer's call, not ours. Never applied; sent to
 *             them as a recommendation with the evidence behind it.
 *
 * `decide` exists because "act, never ask" has exactly one honest exception:
 * a capability marked `never` in the published taxonomy — prices, promises,
 * legal wording, and the controls that decide whether Google shows the site at
 * all. Automating those would break the promise the taxonomy makes, so instead
 * of dropping them silently the loop surfaces them as a recommendation.
 */
export async function planRun(findings, { confidence = "unknown", hasSnapshot = null, client = null } = {}) {
  const capabilities = await loadCapabilities();
  const declined = await loadDeclined();
  /**
   * Two sources of frozen pages, merged. Ours are measurement windows that expire;
   * the client record's are pages the customer wrote themselves. Both block a
   * change, and the customer's are the ones that must never be argued with.
   */
  const freezes = { ...(await loadFreezes()), ...frozenPaths(client) };
  const customerWritten = new Set(Object.keys(frozenPaths(client)));

  /**
   * Two preconditions on changing the words a visitor reads. Neither restricts the
   * mechanical class: those are ours, on a site we built, undone by one revert.
   *
   *   No readable signal — the site is too quiet for the breaker to notice harm.
   *     Shipping wording changes into a site where a regression is invisible is
   *     the one case where removing the human genuinely removes a safety net.
   *   No original snapshot — the welcome email, the terms and the cancellation
   *     email all promise we kept the customer's site as it was. Until that
   *     snapshot exists the promise is on paper, and unattended edits to their
   *     words are being made against a restore path nobody has tested.
   */
  const held = [];
  if (confidence === "none") {
    held.push("the site is too quiet for the circuit breaker to detect harm, so wording changes wait for signal");
  }
  if (hasSnapshot === false) {
    held.push("no snapshot of the original site exists yet, so the restore promise is not yet real");
  }

  const auto = [];
  const notify = [];
  const decide = [];
  const refused = [];

  for (const f of findings) {
    const verdict = classify(capabilities, f);
    if (verdict.autonomy === "refuse") {
      // Out of bounds because the taxonomy says so — that is a recommendation for
      // the owner. Out of bounds because we do not recognise it — that is a bug,
      // and it stays a refusal so it shows up in the report rather than the inbox.
      if (verdict.outOfBounds) decide.push({ ...f, reason: verdict.reason, capability: verdict.capability });
      else refused.push({ ...f, reason: verdict.reason });
      continue;
    }
    const past = isDeclined(declined, f);
    if (past) {
      refused.push({ ...f, reason: `decided against on ${past.at}: ${past.reason}` });
      continue;
    }
    if (f.target && isFrozen(freezes, f.target)) {
      refused.push({
        ...f,
        reason: customerWritten.has(f.target)
          ? `${f.target} was written by the customer — never changed automatically (held until ${String(freezes[f.target]).slice(0, 10)})`
          : `${f.target} is frozen until ${freezes[f.target]} (measurement window open)`,
      });
      continue;
    }
    if (verdict.autonomy === "auto") auto.push({ ...f, capability: verdict.capability });
    else if (held.length) refused.push({ ...f, capability: verdict.capability, reason: held.join("; ") });
    else notify.push({ ...f, capability: verdict.capability });
  }

  const bySeverity = (a, b) => (b.severity ?? 0) - (a.severity ?? 0);
  auto.sort(bySeverity);
  notify.sort(bySeverity);

  /** Over-cap work is deferred, not discarded — it is the next run's first job. */
  const cap = (list, n, label) => ({
    kept: list.slice(0, n),
    deferred: list.slice(n).map((f) => ({ ...f, reason: `${label} cap reached (${n} per run)` })),
  });
  const a = cap(auto, LIMITS.maxAutoPerRun, "blast-radius");
  const nfy = cap(notify, LIMITS.maxNotifyPerRun, "same-day-change");

  return {
    auto: a.kept,
    notify: nfy.kept,
    decide,
    refused: [...refused, ...a.deferred, ...nfy.deferred],
    /** Empty when nothing is holding wording changes back. */
    held,
    confidence,
  };
}

/**
 * Trips when performance falls sharply week over week.
 *
 * Clicks alone cannot protect a small site, and a small site is most customers
 * for their first months. Under twenty clicks a week the click signal is noise —
 * one person having a quiet Tuesday looks identical to a change that broke the
 * page — so a clicks-only breaker silently does nothing precisely where the
 * safety net is needed most. That was tolerable while a human read every change
 * before it shipped. It is not tolerable now that they do not.
 *
 * So three signals, in the order they become readable on a growing site:
 *
 *   impressions  move first and are ~100x the volume of clicks. A page that has
 *                been de-indexed or de-ranked shows here within days.
 *   position     moves before impressions do, and is readable at low volume
 *                because it is an average rather than a count.
 *   clicks       the signal that matters most, and the last to be trustworthy.
 *
 * Any one tripping stops the run. Returns `{ tripped, confidence }` — where
 * `confidence` names the strongest signal that had enough volume to be believed,
 * or "none" when the site is too quiet for any of them. "none" is not a pass: it
 * means harm would be undetectable, which the caller must treat as a reason to
 * restrict what ships, not as permission to proceed.
 */
export function circuitBreaker(current, previous) {
  if (!current || !previous) return { tripped: null, confidence: "none", reason: "no comparison window yet" };

  const pct = (before, after) => (before - after) / before;
  const signals = [];

  if (previous.clicks >= LIMITS.circuitBreakerMinClicks) {
    signals.push({
      name: "clicks",
      readable: true,
      tripped: pct(previous.clicks, current.clicks) >= LIMITS.circuitBreakerDrop,
      detail: `clicks fell ${(pct(previous.clicks, current.clicks) * 100).toFixed(0)}% week over week (${previous.clicks} → ${current.clicks})`,
    });
  }

  if (previous.impressions >= LIMITS.circuitBreakerMinImpressions) {
    const drop = pct(previous.impressions, current.impressions);
    signals.push({
      name: "impressions",
      readable: true,
      tripped: drop >= LIMITS.circuitBreakerImpressionDrop,
      detail: `impressions fell ${(drop * 100).toFixed(0)}% week over week (${previous.impressions} → ${current.impressions})`,
    });
  }

  // Position counts upward: 12 is worse than 4. A site with almost no clicks
  // still has a readable average position, which is what makes this the signal
  // that works when nothing else does.
  if (previous.impressions >= LIMITS.circuitBreakerMinImpressions && previous.position && current.position) {
    const slipped = current.position - previous.position;
    signals.push({
      name: "position",
      readable: true,
      tripped: slipped >= LIMITS.circuitBreakerPositionSlip,
      detail: `average position slipped ${slipped.toFixed(1)} places (${previous.position} → ${current.position})`,
    });
  }

  const tripped = signals.find((s) => s.tripped);
  const confidence = signals.length ? signals[0].name : "none";

  return {
    tripped: tripped ? tripped.detail : null,
    confidence,
    readable: signals.map((s) => s.name),
    reason: signals.length
      ? `${signals.length} signal(s) readable: ${signals.map((s) => s.name).join(", ")}`
      : `too quiet to detect harm — under ${LIMITS.circuitBreakerMinImpressions} impressions and ${LIMITS.circuitBreakerMinClicks} clicks in the comparison window`,
  };
}
