-- Restore the pages a customer wrote themselves to the client record.
--
-- I dropped the `frozen_pages` table on the right argument — the client repo's
-- own frontmatter is where a customer can audit what we consider theirs, and a
-- table that disagreed with the repo would be worse than no table. But I then
-- left `fromRow()` returning `frozen: []`, so a client read from Postgres
-- arrived at the policy layer with nothing frozen at all. The pages a customer
-- wrote themselves were protected only while the loop still read the file.
--
-- This column is not a second source of truth. The pipeline derives it from the
-- repo on every run and writes it here, because the loop does not clone a
-- customer's repo and cannot derive it at run time. Stale-but-present beats
-- absent: a path that has since been unfrozen costs one skipped improvement, and
-- a path wrongly absent costs a customer their own words.
alter table clients add column frozen jsonb not null default '[]'::jsonb;

comment on column clients.frozen is
  'Derived from the client repo by the pipeline, refreshed on every run. Entries: { path, editedBy, editedAt, until, reason }.';
