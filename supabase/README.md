# Autopilot's Supabase backend

## Why

Netlify Blobs is reachable only from inside Netlify. The loop's scheduled run
happens on a GitHub runner, so it could read neither the customer's stop switch
nor the settings the admin console writes — the console governed nothing in CI,
and the stop switch needed a public `/halt.json` endpoint as a workaround.
Postgres is reachable from all three places, which removes the workaround rather
than adding to it.

## What lives here, and what deliberately does not

In the database — state more than one process must agree on:

| Table | Replaces |
| --- | --- |
| `clients` | `pipeline/fleet/<slug>.json` |
| `client_settings` | Blobs `settings:<slug>` + `AI_*` env vars |
| `halt_state` | Blobs `autopilot:halt` + `/halt.json` |
| `notices` | `ops/data/notices.json` |
| `measurements` | `ops/data/measurement.json`, which was overwritten each run |
| `runs` | `ops/reports/*.md` (the reports stay; this makes them queryable) |

Staying in git, because their value **is** being version-controlled and a
customer can audit the diff:

- `ops/data/holdout.json` — the control group. Tamper-evidence is the point.
- `ops/data/snapshot.json` — the record that the restore promise is real.
- `ops/data/freeze.json`, `declined.json` — measurement windows and refusals.
- `src/content/changelog/` — the published record of every change.
- **Pages the customer wrote themselves.** Recorded in each page's own
  frontmatter in the client repo. Derived on every run rather than stored here:
  if the table and the repo disagree, the loop could rewrite a customer's own
  words while the sync lags, and that is the one mistake the system must not
  make.

## Two shapes that must not be "tidied"

`clients.holdout` is **NULL** when no control group is possible — not an empty
array. Null means "we cannot claim a controlled result"; an empty array would
read as "we held nothing back and can still claim one".

`clients.baseline` has **no** `clicks` key when nothing was measurable, rather
than `clicks: null`. A new venture has no starting score, and a zero turns its
first ordinary month into a fabricated improvement.

## Applying

```bash
# against whichever project ref is current
supabase db push          # or paste 0001_autopilot_core.sql into the SQL editor
```

Access is service-role only: RLS is on for every table with no policies defined,
so anon and authenticated get nothing. Customer logins, when they exist, add
policies here and the default stays deny.
