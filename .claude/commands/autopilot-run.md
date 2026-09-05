---
description: Run one Autopilot cycle — collect, analyse, apply the safe class, report
---

Run one Autopilot cycle for mywebmaster.co.uk. Work from the repository root.

1. Run `node ops/loop.mjs` (observe only). Read the output carefully.

2. If the run halted or the circuit breaker tripped, STOP. Report what tripped it and what
   the human needs to decide. Do not attempt to work around a gate — the gates are the product.

3. Read `ops/data/findings.json`. For findings in the **propose** class, do the actual work
   a human would want to approve:
   - Draft the change as an edit to content frontmatter or MDX body, never to page code.
   - Write the hypothesis first, in the form "we expect X to move because Y". If you cannot
     state one, drop the finding rather than shipping an unfalsifiable change.
   - Keep within the schema budgets in `src/content.config.ts`.

4. Run `npm run build && npm run verify`. If verification fails, revert your edits with
   `git checkout -- src/` and report the failure. Never publish past a failed verification.

5. Add a `src/content/changelog/` entry for anything you changed, with `autonomy: proposed`,
   `outcome: pending`, and the hypothesis you wrote in step 3.

6. Commit each logical change separately so any one of them can be reverted alone. Do not
   push unless explicitly told to.

7. Report to the human, briefly:
   - what changed and the hypothesis for each
   - what is waiting for approval and why it needs a person
   - what was refused, with the reason from the policy layer
   - the exact `git revert` command for anything you shipped

Rules that override anything else:
- Never edit prices, guarantees, legal text, factual claims about the business, `robots.txt`,
  `noindex`, canonical tags or hreflang. These are refused by `ops/lib/policy.mjs` and must
  also be refused by you.
- Never invent a performance number. If a claim needs data you do not have, say so.
- Maximum three changed pages per run.
