/**
 * Decides whether a run applies changes or only observes.
 *
 * This used to be a bare string comparison inside the workflow YAML, where it
 * could never be tested and a stray quirk in how the runner reports the cron
 * would have silently kept every run in dry-run for ever. It is one decision, it
 * is the decision that separates "heal" from "watch", so it lives in code the
 * test suite exercises rather than in a shell line nobody can assert against.
 *
 *   apply    the weekly release slot, or a manual dispatch that asked for it
 *   dry-run  every other run — the daily observation, and any dispatch that did
 *            not explicitly ask to apply
 *
 * The workflow calls this and passes `--dry-run` to the loop unless the answer is
 * "apply". Run directly it prints the mode, so the YAML stays a single `if`.
 */

/** The one cron entry permitted to write. Everything else observes. */
export const APPLY_SCHEDULE = "0 7 * * TUE";

const clean = (value) => String(value ?? "").trim();

/**
 * @param {{ schedule?: string, apply?: string }} event
 *   schedule — `github.event.schedule`, the cron string that triggered the run,
 *              empty for a manual dispatch.
 *   apply    — `github.event.inputs.apply`, "true" when the dispatch asked to
 *              apply, empty for a scheduled run.
 * @returns {"apply" | "dry-run"}
 */
export function decideRunMode({ schedule, apply } = {}) {
  if (clean(apply).toLowerCase() === "true") return "apply";
  if (clean(schedule) === APPLY_SCHEDULE) return "apply";
  return "dry-run";
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(
    decideRunMode({
      schedule: process.env.AUTOPILOT_SCHEDULE,
      apply: process.env.AUTOPILOT_APPLY_INPUT,
    }),
  );
}
