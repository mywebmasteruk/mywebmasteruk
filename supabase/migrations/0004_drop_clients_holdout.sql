-- Drop the holdout from the client record.
--
-- The owner removed the untouched-pages comparison and the refund on
-- 11 September 2026 (pipeline DECISIONS.md, aa3372e). Nothing reads or writes
-- these two columns any more: the loop stopped reading them at a572971, the
-- pipeline's toRow() stopped writing them at 5c05a07, and the admin never used
-- them.
--
-- They still held values for both client rows when this ran. Those are kept,
-- not discarded: see
-- old/2026-09-11-ai-2026-holdout-removed-owner-decision/supabase-clients-holdout-columns.json
-- at the root of the monorepo.
--
-- `measurements` stays. It is empty, but whether any internal before-and-after
-- measurement continues is still the owner's to decide, and dropping the table
-- would pre-empt that.
alter table clients drop column if exists holdout;
alter table clients drop column if exists holdout_note;
