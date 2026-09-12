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
| `measurements` | nothing yet — kept empty; the lift calculation that was meant to fill it was retired with the holdout on 11 September 2026 |
| `runs` | `ops/reports/*.md` (the reports stay; this makes them queryable) |

Staying in git, because their value **is** being version-controlled and a
customer can audit the diff:

- `ops/data/snapshot.json` — the record that the restore promise is real.
- `ops/data/freeze.json`, `declined.json` — measurement windows and refusals.
- `src/content/changelog/` — the published record of every change.
- **Pages the customer wrote themselves.** Recorded in each page's own
  frontmatter in the client repo. Derived on every run rather than stored here:
  if the table and the repo disagree, the loop could rewrite a customer's own
  words while the sync lags, and that is the one mistake the system must not
  make.

## A shape that must not be "tidied"

`clients.baseline` has **no** `clicks` key when nothing was measurable, rather
than `clicks: null`. A new venture has no starting score, and a zero turns its
first ordinary month into a fabricated improvement.

## The holdout, removed

The owner dropped the untouched-pages comparison and the refund on 11 September 2026.
`0004_drop_clients_holdout.sql` removes `clients.holdout` and `clients.holdout_note`; the
values they held were exported to `old/2026-09-11-ai-2026-holdout-removed-owner-decision/`
at the monorepo root before the drop.

## Applying

```bash
# against whichever project ref is current
supabase db push          # or paste each file in migrations/ into the SQL editor, in number order
```

Access is service-role only: RLS is on for every table with no policies defined,
so anon and authenticated get nothing. Customer logins, when they exist, add
policies here and the default stays deny.
