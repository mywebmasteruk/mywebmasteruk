# MyWebMaster — Autopilot

The marketing site for MyWebMaster Autopilot, and the running instance of the product it
sells. The site optimises itself; the loop that does it lives in `ops/`.

## Why the site is built this way

Every field an optimiser is allowed to change lives in validated frontmatter or JSON, not in
page code. The collection schemas in `src/content.config.ts` set the budgets — title length,
description length, required fields — so an invalid autonomous edit **fails the build instead
of shipping**. That property is the whole reason this is safe enough to automate.

## Commands

```bash
npm run dev        # local dev on :4000
npm run build      # generates the OG card, then builds to dist/
npm run verify     # metadata, schema graph, links, budgets, crawler access — exits non-zero on failure
```

`npm run verify` is the gate. It fails on: a missing or duplicate H1, a missing canonical,
a dangling `@id` in the structured-data graph, a broken internal link, a JS budget breach, a
missing machine-readable file, or a `robots.txt` that blocks everything.

## The loop

```bash
node ops/collect-gsc.mjs --days 90 --baseline   # capture a baseline (done once, before any change)
node ops/loop.mjs                               # observe and report — changes nothing
node ops/loop.mjs --write                       # apply the cleared safe class locally
node ops/loop.mjs --write --push                # ...and commit and push it
```

The run stops at the first gate that objects:

1. **Kill switch** — `ops/HALT` exists, or `AUTOPILOT_HALT=1`.
2. **Circuit breaker** — clicks down 25%+ week over week (ignored below 20 clicks, where the
   number is noise).
3. **Policy** — `src/data/capabilities.json` is the only source of permission. A capability
   that is not listed is refused; `never` is refused at any confidence; a page inside its
   28-day measurement window is frozen; no more than 3 changes ship per run.
4. **Verification** — the build must pass `npm run verify` or the working tree is reverted.

The same `capabilities.json` renders the public table at `/what-it-changes/`, so the published
boundary and the enforced boundary cannot drift apart.

### Stopping it

```bash
touch ops/HALT && git add ops/HALT && git commit -m "halt autopilot" && git push
```

### Undoing a change

Every change is one commit.

```bash
git revert --no-edit <sha> && git push
```

## Scheduled runs

`.github/workflows/autopilot.yml` observes daily at 06:00 UTC and releases on Tuesdays at
07:00. Reports are posted as a GitHub issue labelled `autopilot` and uploaded as artefacts.

Required repository secret: `GCP_SA_KEY` (the service-account JSON).
Optional variables: `GSC_PROPERTY`, `GA4_PROPERTY_ID`.

## Layout

```
src/content/answers/     Question-shaped pages — the answer-engine surface
src/content/changelog/   The public record of every change, including reverts
src/data/plans.json      Pricing tiers
src/data/capabilities.json  The change taxonomy — published AND enforced
src/data/experiment.json    Published proof figures
ops/                     The loop: collect, crawl, analyse, apply, report
ops/reports/             Human-readable run reports
```
