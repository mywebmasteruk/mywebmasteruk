/**
 * The one decision that separates healing from watching.
 *
 * It lived in a shell comparison in the workflow, where the owner's first
 * hypothesis — that the Tuesday cron never matched and every run stayed dry — was
 * untestable. It is code now, so the branch is proven here rather than in
 * production a week at a time.
 */
import { suite, check } from "./harness.mjs";
import { decideRunMode, APPLY_SCHEDULE } from "../run-mode.mjs";

suite("run-mode — apply only on the weekly slot or an explicit dispatch");

check(
  "the daily observation cron stays dry-run",
  decideRunMode({ schedule: "0 6 * * *", apply: "" }) === "dry-run",
);
check(
  "the weekly release cron applies",
  decideRunMode({ schedule: APPLY_SCHEDULE, apply: "" }) === "apply",
);
check(
  "a manual dispatch that asked to apply applies",
  decideRunMode({ schedule: "", apply: "true" }) === "apply",
);
check(
  "a manual dispatch that did not ask stays dry-run",
  decideRunMode({ schedule: "", apply: "false" }) === "dry-run",
);
check(
  "a bare dispatch (no input) stays dry-run",
  decideRunMode({}) === "dry-run",
);
check(
  "another schedule than the release slot never applies",
  decideRunMode({ schedule: "0 7 * * MON", apply: "" }) === "dry-run",
);
check(
  "stray whitespace around the cron still matches — the failure the shell could have had",
  decideRunMode({ schedule: `  ${APPLY_SCHEDULE}\n`, apply: "" }) === "apply",
);
check(
  "apply wins however it is cased or spaced",
  decideRunMode({ schedule: "", apply: " TRUE " }) === "apply",
);
