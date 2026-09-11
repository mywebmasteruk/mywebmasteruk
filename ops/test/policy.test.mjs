/**
 * What may ship, and what may not.
 *
 * The customer's own pages are the one thing the loop must never touch. Everything else here is about the circuit breaker being readable
 * on a site too small for clicks to mean anything — which is most customers for
 * their first months, and where removing the human removed the only safety net.
 */
import { suite, check } from "./harness.mjs";
import { circuitBreaker, planRun, normalisePath, sourcesForPath, LIMITS } from "../lib/policy.mjs";

suite("circuit breaker — readable on a quiet site");

const small = { clicks: 8, impressions: 1400, position: 22.0 };

let r = circuitBreaker({ clicks: 5, impressions: 400, position: 24.0 }, small);
check("an 8-click site losing 71% of its impressions trips", Boolean(r.tripped));
check("and does not rely on clicks to notice", r.confidence !== "clicks");

r = circuitBreaker({ clicks: 6, impressions: 1350, position: 31.0 }, small);
check("a nine-place position slip trips with impressions flat", Boolean(r.tripped));

r = circuitBreaker({ clicks: 9, impressions: 1450, position: 21.4 }, small);
check("a healthy small site does not trip", r.tripped === null);
check("and names the signal it could read", r.confidence === "impressions");

r = circuitBreaker({ clicks: 0, impressions: 5, position: 80 }, { clicks: 2, impressions: 40, position: 55 });
check("a site with 40 impressions reports confidence 'none'", r.confidence === "none");
check("which is not a pass — it says harm would be invisible", r.tripped === null && r.reason.includes("too quiet"));

const big = { clicks: 400, impressions: 90000, position: 8.1 };
r = circuitBreaker({ clicks: 180, impressions: 88000, position: 8.3 }, big);
check("a click collapse on a busy site trips on clicks", r.tripped?.includes("clicks") && r.confidence === "clicks");

suite("policy — preconditions on changing words");

const findings = [
  { capability: "img-attrs", severity: 70, title: "mechanical", target: null },
  { capability: "titles", severity: 60, title: "wording", target: "/answers/x/" },
];

let plan = await planRun(findings, { confidence: "none", hasSnapshot: true });
check("on a site too quiet to measure, mechanical repairs still ship", plan.auto.length === 1);
check("but wording is held", plan.notify.length === 0 && plan.held.length === 1);
check("for a stated reason", plan.held[0].includes("too quiet"));

plan = await planRun(findings, { confidence: "impressions", hasSnapshot: false });
check("with no snapshot of the original site, wording is held", plan.notify.length === 0);
check("and mechanical repairs still ship", plan.auto.length === 1);
check("held for the snapshot reason", plan.held[0].includes("snapshot"));

plan = await planRun(findings, { confidence: "impressions", hasSnapshot: true });
check("with both preconditions met, wording ships", plan.notify.length === 1 && plan.held.length === 0);
check("the plan carries no holdout — its absence is the normal shape", !("holdout" in plan));
check("no refusal mentions a holdout or pages held back",
  !plan.refused.some((f) => /holdout|held back|control group/i.test(f.reason ?? "")));

suite("policy — URL paths map to their source files");

check("a path without a trailing slash matches one with",
  normalisePath("/what-it-changes") === normalisePath("/what-it-changes/"));
check("an answer page maps to its content file",
  sourcesForPath("/answers/x")[0] === "src/content/answers/x.mdx");
check("a route maps to its astro file",
  sourcesForPath("/what-it-changes").includes("src/pages/what-it-changes.astro"));

suite("policy — the customer outranks the optimiser");

const client = { frozen: [{ path: "/emergency/", until: "2026-12-06T00:00:00Z" }] };
plan = await planRun(
  [
    { capability: "titles", severity: 90, title: "rewrite theirs", target: "/emergency/" },
    { capability: "img-attrs", severity: 85, title: "mechanical on theirs", target: "/emergency/" },
    { capability: "titles", severity: 60, title: "rewrite ours", target: "/answers/x/" },
  ],
  { confidence: "impressions", hasSnapshot: true, client },
);
check("their page is never reworded", !plan.notify.some((f) => f.target === "/emergency/"));
check("nor mechanically touched", !plan.auto.some((f) => f.target === "/emergency/"));
check("and the refusal says whose page it is",
  plan.refused.find((f) => f.target === "/emergency/").reason.includes("written by the customer"));
check("our own page still ships", plan.notify.some((f) => f.target === "/answers/x/"));

suite("policy — blast radius");

const many = Array.from({ length: 20 }, (_, i) => ({ capability: "img-attrs", severity: 50, title: `fix ${i}`, target: `/p${i}/` }));
plan = await planRun(many, { confidence: "impressions", hasSnapshot: true });
check(`mechanical work is capped at ${LIMITS.maxAutoPerRun} per run`, plan.auto.length === LIMITS.maxAutoPerRun);
check("the rest is deferred, not discarded", plan.refused.some((f) => f.reason.includes("cap reached")));
