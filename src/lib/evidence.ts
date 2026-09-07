import holdoutFile from "../../ops/data/holdout.json";
import experiment from "~/data/experiment.json";

/**
 * What the site is allowed to claim about cause, derived from the file the loop
 * actually enforces.
 *
 * Read from `ops/data/holdout.json` rather than restated in page prose or copied
 * into `experiment.json`, because every previous version of this claim was a
 * sentence somebody wrote once and nobody re-checked. If the holdout file is
 * emptied, `/proof/` stops claiming a control group on the next build — without
 * anyone remembering to edit a page.
 */
const held: string[] = (holdoutFile as { holdout?: string[] }).holdout ?? [];

export const evidence = {
  /** True today: these pages are refused by the policy layer on every run. */
  holdout: held,
  controlled: held.length > 0,
  /**
   * Separate from `controlled` on purpose. Holding pages back is the method;
   * having a result is a different claim, and the first 28-day window has not
   * closed. A page may say "we hold pages back" long before it may say
   * "we proved it worked".
   */
  hasResult: Boolean((experiment as { latest?: unknown }).latest),
  frozenUntil: (holdoutFile as { frozenUntil?: string }).frozenUntil ?? null,
  note:
    (experiment as { design?: { note?: string } }).design?.note ??
    "No pages are being held back on this site, so a result cannot be separated from whatever the market did that month.",
};
