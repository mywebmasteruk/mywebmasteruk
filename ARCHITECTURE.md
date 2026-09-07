# How Autopilot works, and why

Decisions made deliberately, with the reasoning, so they can be revisited on
purpose rather than drifted away from by accident.

## The model: we replace the platform, then optimise it

Autopilot does not plug into whatever the customer already runs. We rebuild
their site on our stack — static, version controlled, deployed from a pipeline —
publish it on their domain, and the loop then works at full strength.

**Rejected: an adapter per platform.** Writing a WordPress adapter, a Shopify
adapter, a Webflow adapter and an edge-proxy fallback means four reversibility
models, four snapshot strategies and four sets of caveats in the copy. Every
capability would run at the speed of the weakest platform.

**Rejected: an edge layer in front of their existing site.** It works on any
platform and needs nothing from the customer, but improvements delivered at the
edge stop the day they leave — which is precisely what we criticise competitors
for. It also puts us in the critical path of a live business.

The rebuild is more work per client and it is the honest version.

## What the customer supplies

Their URL, read access to their Google data, and answers to four questions
about their business. Nothing about their tech stack. Which platform they are
on is our problem to detect and our problem to migrate.

## Three ways out, always

No lock-in of any kind. On leaving, the customer picks:

1. **Take the new site.** It is static; it runs on Netlify, Cloudflare Pages or
   GitHub Pages for roughly nothing. They get the repository.
2. **Point DNS back** to their old provider, if they kept it running.
3. **Restore any earlier version** from the history.

Option 1 is usually the best outcome for them and we should say so: leave with a
faster site than the one you arrived with. Retaining customers by holding their
website hostage is what you do when you are not worth keeping.

## Who this is not for

Sites that cannot be static without losing what makes them work: e-commerce
checkouts, booking systems, membership areas, customer portals. Content and
brochure sites are the market, which is also where search and answer-engine work
actually pays. Disqualifying honestly is cheaper than a bad migration.

## Open questions that decide the business

**Can a rebuild be automated to under a day?** This is the unit economics.
At £449/month, three days of skilled work per client means four to six months
before profit and makes early churn actively expensive. At half a day the model
is excellent. Untested — and testable against a real client site.

**How does a customer edit their own content?** Static means a CMS layer
(Decap or Sveltia on git) or they email us — and emailing us recreates the
agency bottleneck the product exists to remove. Unresolved.

**DNS carries their email.** Taking over a domain means MX records. Fumbling one
does not break a website, it breaks a business's email. Needs a checklist and a
tested rollback before the first migration.

**Liability.** Terms cap us at three months of fees. A shop turning over £50k a
month, broken for a day, is worth far more than that. Professional indemnity
cover belongs before the first client, not after the first incident.

## Consequence for the live site

mywebmaster.co.uk currently sells a subscription that improves the site you
already have. This model sells a rebuild plus a subscription — a different
promise, a different price and a different first week. The copy has not been
changed yet, deliberately: it should follow the decision, not lead it.
