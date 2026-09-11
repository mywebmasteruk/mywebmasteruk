-- Delivery bookkeeping for the notice queue.
--
-- A queue's failure mode is not the lost message, it is the double send: a row
-- still showing `sent_at IS NULL` after a crash mid-send gets picked up again by
-- the next run. Over SMTP there is no exactly-once — the send either happens or
-- it does not, and the acknowledgement can be lost after the fact — so the
-- choice is which failure to prefer.
--
-- We prefer the duplicate. A lost notice is an unaccountable change to somebody's
-- website, which is the one thing this system exists not to do; a second copy of
-- an email is an annoyance. But "prefer" is not "shrug": a lease stops two runs
-- sending the same row at once, an attempt count stops a crashing row being
-- retried for ever, and both are visible rather than inferred.
alter table notices
  add column claimed_at timestamptz,
  add column message_id text;

comment on column notices.claimed_at is
  'Held while a run is sending. A row is only re-claimable once the lease expires, so two runs cannot send it at the same moment.';
comment on column notices.attempts is
  'Incremented on claim, not on failure — a crash between claim and send still counts, which is what stops an infinite retry.';
comment on column notices.message_id is
  'The Message-ID we set. A duplicate that does arrive can be traced to the row that caused it.';

-- Only one runner can claim a row, and only rows that are actually due.
create index notices_claimable on notices (queued_at)
  where sent_at is null;
