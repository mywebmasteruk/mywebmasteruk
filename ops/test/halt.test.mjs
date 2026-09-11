/**
 * The customer's stop switch.
 *
 * The most consequential logic in the system: a run that changes a site after
 * somebody pressed stop is the worst bug available to this product. Everything
 * here is about refusing to guess.
 */
import { suite, check } from "./harness.mjs";
import { haltReason } from "../lib/policy.mjs";

suite("halt — reading the stored decision");

check("never pressed reads as running", haltReason(null) === null && haltReason(undefined) === null);
check("an explicit false reads as running", haltReason({ halted: false }) === null);

const stopped = haltReason({ halted: true, at: "2026-09-07T09:14:00.000Z", by: "customer link" });
check("a stop is honoured", stopped.includes("stopped Autopilot on 2026-09-07"));
check("and names who did it", stopped.includes("customer link"));
check("a stop without a date still stops", haltReason({ halted: true }).includes("unrecorded time"));

// Anything that is not an explicit, well-formed answer must not read as "running".
check("a missing halted field halts rather than guessing", typeof haltReason({ site: "x" }) === "string");
check("a non-object halts", typeof haltReason("halted") === "string");
check('the string "false" does not read as not-halted', typeof haltReason({ halted: "false" }) === "string");
check("the number 0 does not read as not-halted", typeof haltReason({ halted: 0 }) === "string");
