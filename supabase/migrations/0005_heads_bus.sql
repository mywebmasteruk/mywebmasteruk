-- The team bus, moved off a file inside iCloud.
--
-- Owner rule, 18 September 2026, given first-hand to the iMac VP: the CTOs
-- convey their work and progress on the Supabase realtime bus at all times, so
-- that whichever Mac he switches to, the CTO there first reads what the other
-- did. The old transport was a JSONL file in the iCloud checkout, which stalled
-- on the MacBook for four days.
--
-- The design is Hada's, already proven in use there
-- (5.hada.news/supabase/migrations/20260909_heads_bus_lane_key.sql), and it is
-- what bus/bus.py expects:
--
--   reads   open to the publishable key, so Realtime can deliver to any lane;
--   writes  only with a shared lane key sent as x-lane-key, checked against a
--           SHA-256 hash, because the bus is an instruction channel read by
--           agents that can run commands, and a world-writable bus would be a
--           prompt-injection path into them;
--   edits   none. The bus is append-only; history is not rewritten.
--
-- The service-role key is never needed to use it, and never lives beside
-- bus.py: that file sits in iCloud, and this database holds client records.
--
-- The lane key's hash is inserted separately, not here: a hash in git is
-- still a secret's fingerprint, and it is not needed to rebuild the table.

create table if not exists public.heads_bus (
  id bigint generated always as identity primary key,
  sender text not null,
  body text not null,
  created_at timestamptz not null default now()
);

-- Senders stay legible. This is not the security boundary — the lane key is —
-- it just stops an ambiguous name sending the wrong lane onto the wrong files.
-- Every sender who has ever posted on the file bus is included, so the import
-- of its history keeps each message's author.
alter table public.heads_bus drop constraint if exists heads_bus_sender_check;
alter table public.heads_bus add constraint heads_bus_sender_check
  check (sender in ('cto1', 'cto1_assistant', 'cto2', 'cto2_assistant', 'features', 'owner', 'vp'));

alter table public.heads_bus enable row level security;
revoke all on table public.heads_bus from anon, authenticated;
grant select, insert on table public.heads_bus to anon, authenticated;

drop policy if exists heads_bus_read on public.heads_bus;
create policy heads_bus_read on public.heads_bus
  for select to anon, authenticated
  using (true);

-- ---- The lane key ---------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from anon, authenticated;

create table if not exists private.lane_keys (
  name text primary key,
  key_sha256 text not null,
  created_at timestamptz not null default now()
);

-- SECURITY DEFINER so the check can read private.lane_keys while the caller
-- cannot; search_path is pinned, because a definer function that resolves
-- names through the caller's search_path is a privilege-escalation bug.
create or replace function public.has_lane_key()
returns boolean
language sql
stable
security definer
set search_path = private, extensions, pg_catalog
as $$
  select exists (
    select 1 from private.lane_keys
    where key_sha256 = encode(
      digest(coalesce(current_setting('request.headers', true)::json ->> 'x-lane-key', ''), 'sha256'),
      'hex'
    )
  );
$$;

revoke all on function public.has_lane_key() from public;
grant execute on function public.has_lane_key() to anon, authenticated;

drop policy if exists heads_bus_append on public.heads_bus;
create policy heads_bus_append on public.heads_bus
  for insert to anon, authenticated
  with check (public.has_lane_key());

-- ---- Realtime ---------------------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'heads_bus') then
    alter publication supabase_realtime add table public.heads_bus;
  end if;
end $$;
