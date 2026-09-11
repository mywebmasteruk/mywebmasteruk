-- Autopilot's operational backend.
--
-- State that more than one process must agree on: the loop (a GitHub runner),
-- the admin console and the customer-facing functions (Netlify), and whoever is
-- looking at it. That is precisely what was broken — Netlify Blobs is reachable
-- only from inside Netlify, so the scheduled run could read neither the
-- customer's stop switch nor the settings the console wrote.
--
-- Deliberately NOT here, because their value is being in version control where a
-- customer can audit them and a diff shows what moved: the holdout selection,
-- the site snapshot, measurement freezes, declined work, the published
-- changelog, and the pages a customer wrote themselves.

-- One row per customer site. Shape follows pipeline/fleet/<slug>.json, which is
-- the join between the build pipeline and this loop; the pipeline writes both
-- until the file is retired.
create table clients (
  slug                    text primary key,
  business                text not null,
  host                    text not null unique,
  url                     text not null,
  live_since              timestamptz,               -- null until cutover
  origin                  text check (origin in ('crawl','plan','adopted')),
  sector                  text,

  netlify_site_id         text,
  netlify_site_name       text,
  repo                    text,
  site_dir                text,
  search_console_property text,
  ga4_property            text,
  stripe_customer_id      text unique,

  -- The customer's own details. Distinct from the operator's address: change
  -- notices go here, run reports go to us. `name` may be null and mail must
  -- never be addressed to a null.
  contact                 jsonb not null default '{}'::jsonb,

  -- { takenAt, source, pages, note, clicks?, impressions? }
  -- clicks/impressions are ABSENT, not null, when source = 'none'. A new venture
  -- has no starting score, and a zero would turn its first ordinary month into a
  -- fabricated improvement.
  baseline                jsonb not null default '{}'::jsonb,

  -- Array of held-back paths, or NULL when no control group is possible. Null is
  -- not an empty array: one means "we cannot claim a controlled result", the
  -- other would read as "we held nothing back and still can".
  holdout                 text[],
  holdout_note            text,

  -- { applicable, snapshotAt, document, dnsRecorded, limitations[] }
  -- applicable:false is a pass — a new venture has nothing to restore.
  restore                 jsonb not null default '{}'::jsonb,

  awaiting_client         text[] not null default '{}',
  questions_outstanding   text[] not null default '{}',

  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

comment on column clients.holdout is
  'NULL means no control group is available, which changes what a report may claim. Never store an empty array to mean the same thing.';
comment on column clients.baseline is
  'clicks/impressions absent when unmeasurable. Do not coerce absence to zero anywhere downstream.';

-- Settings the admin console writes and the loop reads.
-- slug null is the default row every client inherits.
create table client_settings (
  id             uuid primary key default gen_random_uuid(),
  slug           text references clients(slug) on delete cascade,
  provider       text not null default 'anthropic',
  model          text not null default 'claude-opus-5',
  effort         text not null default 'high' check (effort in ('low','medium','high','xhigh','max')),
  max_tokens     integer not null default 16000 check (max_tokens between 1000 and 64000),
  drafting       boolean not null default true,
  brand_voice    text not null default '',
  notify_cadence text not null default 'weekly' check (notify_cadence in ('instant','daily','weekly')),
  updated_at     timestamptz not null default now(),
  updated_by     text
);
create unique index client_settings_one_per_client on client_settings (coalesce(slug, '_default'));

comment on table client_settings is
  'No API keys. A provider key belongs in the host environment, read at run time — storing one here puts it in every backup and every query result.';

-- The customer's stop button, written by the one-click link in every email.
create table halt_state (
  slug       text primary key references clients(slug) on delete cascade,
  halted     boolean not null,
  changed_at timestamptz not null default now(),
  changed_by text not null
);

comment on table halt_state is
  'Read fail-closed: a run about to change something that cannot read this must stop. A day of no changes costs nothing; a day of changes after somebody pressed stop costs the customer.';

-- What the customer has been told, and what is still owed to them.
create table notices (
  id          uuid primary key default gen_random_uuid(),
  slug        text references clients(slug) on delete cascade,
  class       text not null check (class in ('auto','notify','decide')),
  title       text not null,
  detail      text,
  target      text,
  before_text text,
  after_text  text,
  hypothesis  text,
  queued_at   timestamptz not null default now(),
  sent_at     timestamptz,
  attempts    integer not null default 0,
  last_error  text
);
create index notices_pending on notices (slug, queued_at) where sent_at is null;

comment on table notices is
  'Never deleted on failure, never marked sent without delivery. An undelivered notice is an unaccountable change.';

-- Difference-in-differences results, kept as history rather than overwritten.
create table measurements (
  id            uuid primary key default gen_random_uuid(),
  slug          text references clients(slug) on delete cascade,
  measured_at   timestamptz not null default now(),
  window_days   integer not null,
  window_before daterange,
  window_after  daterange,
  treated_pages integer not null,
  control_pages integer not null,
  treated_mean  numeric,
  control_mean  numeric,
  lift          numeric,
  claimable     boolean not null,
  blockers      jsonb not null default '[]'::jsonb
);

comment on column measurements.lift is
  'Null unless the design earned it: a control group, a closed window, and enough pages either side. A number here is a claim we can defend.';

-- One row per loop run, so "what did it do last Tuesday" is answerable.
create table runs (
  id              uuid primary key default gen_random_uuid(),
  slug            text references clients(slug) on delete cascade,
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  dry_run         boolean not null default false,
  halted_reason   text,
  breaker         jsonb,
  applied         jsonb not null default '[]'::jsonb,
  held            jsonb not null default '[]'::jsonb,
  settings_source text,
  report          text
);
create index runs_recent on runs (slug, started_at desc);

-- Row level security on everything, with no policies: anon and authenticated get
-- nothing, and only the service role — server side, never in a browser — can
-- read or write. When customers get their own logins their policies go here and
-- the default stays deny.
alter table clients         enable row level security;
alter table client_settings enable row level security;
alter table halt_state      enable row level security;
alter table notices         enable row level security;
alter table measurements    enable row level security;
alter table runs            enable row level security;

create or replace function touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger clients_touch before update on clients
  for each row execute function touch_updated_at();
create trigger client_settings_touch before update on client_settings
  for each row execute function touch_updated_at();
