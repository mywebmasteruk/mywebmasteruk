import { site } from "~/data/site";

/** One canonical Organization node, referenced by @id everywhere else. */
export const ORG_ID = `${site.url}/#organization`;
export const SITE_ID = `${site.url}/#website`;

export function organizationNode() {
  return {
    "@type": "Organization",
    "@id": ORG_ID,
    name: site.name,
    url: site.url,
    description: site.description,
    email: site.email,
    foundingDate: site.founded,
    areaServed: { "@type": "Country", name: "United Kingdom" },
    sameAs: [...site.sameAs],
    logo: {
      "@type": "ImageObject",
      url: `${site.url}/brand/logo.svg`,
      caption: `${site.name} logo`,
    },
  };
}

export function websiteNode() {
  return {
    "@type": "WebSite",
    "@id": SITE_ID,
    url: site.url,
    name: site.name,
    description: site.description,
    publisher: { "@id": ORG_ID },
    inLanguage: site.locale,
  };
}

export function breadcrumbNode(trail: { name: string; href: string }[]) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: trail.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${site.url}${item.href}`,
    })),
  };
}

export function faqNode(faqs: { q: string; a: string }[]) {
  return {
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

/** A single Q&A page. Distinct from FAQPage: one question, one authoritative answer. */
export function qaNode(opts: {
  question: string;
  answer: string;
  url: string;
  updated: Date;
}) {
  return {
    "@type": "QAPage",
    mainEntity: {
      "@type": "Question",
      name: opts.question,
      text: opts.question,
      answerCount: 1,
      dateModified: opts.updated.toISOString(),
      acceptedAnswer: {
        "@type": "Answer",
        text: opts.answer,
        url: opts.url,
        author: { "@id": ORG_ID },
      },
    },
  };
}

export function serviceNode(opts: {
  name: string;
  description: string;
  url: string;
  offers?: { name: string; price: number | null; currency: string; description: string }[];
}) {
  return {
    "@type": "Service",
    "@id": `${opts.url}#service`,
    name: opts.name,
    description: opts.description,
    url: opts.url,
    provider: { "@id": ORG_ID },
    areaServed: { "@type": "Country", name: "United Kingdom" },
    serviceType: "Website optimisation",
    ...(opts.offers?.length
      ? {
          hasOfferCatalog: {
            "@type": "OfferCatalog",
            name: `${opts.name} plans`,
            itemListElement: opts.offers.map((o) => ({
              "@type": "Offer",
              name: o.name,
              description: o.description,
              ...(o.price !== null
                ? {
                    price: String(o.price),
                    priceCurrency: o.currency,
                    priceSpecification: {
                      "@type": "UnitPriceSpecification",
                      price: String(o.price),
                      priceCurrency: o.currency,
                      unitCode: "MON",
                      billingIncrement: 1,
                    },
                  }
                : {}),
            })),
          },
        }
      : {}),
  };
}

export function articleNode(opts: {
  headline: string;
  description: string;
  url: string;
  published: Date;
  updated: Date;
}) {
  return {
    "@type": "Article",
    headline: opts.headline,
    description: opts.description,
    url: opts.url,
    datePublished: opts.published.toISOString(),
    dateModified: opts.updated.toISOString(),
    author: { "@id": ORG_ID },
    publisher: { "@id": ORG_ID },
    isPartOf: { "@id": SITE_ID },
    inLanguage: site.locale,
  };
}

/** Wraps nodes into a single @graph so engines resolve @id references. */
export function graph(nodes: object[]) {
  return JSON.stringify(
    { "@context": "https://schema.org", "@graph": nodes },
    null,
    0,
  );
}
