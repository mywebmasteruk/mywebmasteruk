# Assumptions to confirm before launch

Written by the build, deliberately not buried. Each of these is live on the site and is a
guess rather than a fact.

## Must change before launch

| Item | Where | Current value |
| --- | --- | --- |
| Contact email | `src/data/site.ts` | `hello@mywebmaster.co.uk` — invented |
| Phone number | `src/data/site.ts` | `null` — omitted rather than invented |
| Founding year | `src/data/site.ts` | `2016` — guessed; feeds `foundingDate` in schema |
| `sameAs` profiles | `src/data/site.ts` | GitHub only. Add LinkedIn / Companies House once verified |
| Prices | `src/data/plans.json` | £149 / £449 / £1,200 per month — plausible UK rates, not decided |
| Legal pages | `src/pages/legal/` | Written to be honest and specific, but not reviewed by a solicitor |

Entity consistency matters more than it looks: a name or profile that disagrees across the
site, schema markup and third-party listings builds several weak entity nodes instead of one
strong one. Fix these once, everywhere, before the site is indexed.

## Deliberately absent

- **No testimonials or case studies.** There are no clients on this product yet, and
  fabricated social proof is both dishonest and a trust risk if checked.
- **No claimed results.** The only performance numbers on the site are this domain's real
  Search Console baseline. Everything else is described as method, not outcome.
- **No physical address.** `LocalBusiness` schema needs a real, consistent NAP. Inventing one
  poisons entity recognition, so `Organization` is used without an address instead.

## Outstanding technical setup

1. **Enable two Google Cloud APIs** on project `mywebmaster-general` (789678252635):
   Analytics Data API, and Analytics Admin API if property discovery is wanted.
   Search Console API already works.
2. **Set `GA4_PROPERTY_ID`** — GA4 → Admin → Property Settings.
3. **Add `GCP_SA_KEY`** as a GitHub Actions secret so scheduled runs can read the data.
4. **Redirects from the old site.** The previous site had indexed URLs including
   `/webmaster-services` (3,600 impressions in 90 days) and a `blog.` subdomain with
   pages earning thousands of impressions. These need 301s to the closest new page, or that
   demand is lost at cutover. This is the single highest-risk item on the list.
