/**
 * Single source of truth for entity identity.
 * Entity-name consistency across content, schema and social profiles is what
 * lets an AI engine build one strong knowledge-graph node instead of three weak ones,
 * so nothing here should be restated ad hoc elsewhere in the codebase.
 */
export const site = {
  /** Canonical legal/brand name. Used verbatim in every schema.org block. */
  name: "MyWebMaster",
  /** Canonical product name. Always written as "Autopilot" after first mention. */
  product: "MyWebMaster Autopilot",
  domain: "mywebmaster.co.uk",
  url: "https://mywebmaster.co.uk",
  tagline: "Websites that optimise themselves",
  description:
    "MyWebMaster Autopilot checks your website every day, makes small improvements based on what the numbers show, and proves they worked by comparing against pages we left alone.",
  // TODO_CONFIRM: real contact details before launch.
  email: "hello@mywebmaster.co.uk",
  phone: null as string | null,
  country: "GB",
  locale: "en-GB",
  founded: "2016",
  /** sameAs targets. Weak or wrong links dilute entity recognition — keep them real. */
  sameAs: [
    "https://github.com/mywebmasteruk",
    // TODO_CONFIRM: add LinkedIn / Companies House / Crunchbase once verified.
  ],
  author: {
    name: "MyWebMaster",
    role: "Web engineering studio",
  },
} as const;

export const nav = [
  { href: "/how-it-works/", label: "How it works" },
  { href: "/what-it-changes/", label: "What it changes" },
  { href: "/proof/", label: "Proof" },
  { href: "/pricing/", label: "Pricing" },
  { href: "/answers/", label: "Answers" },
] as const;

export const footerNav = [
  {
    title: "Autopilot",
    links: [
      { href: "/how-it-works/", label: "How it works" },
      { href: "/what-it-changes/", label: "What it changes" },
      { href: "/proof/", label: "Proof & method" },
      { href: "/pricing/", label: "Pricing" },
    ],
  },
  {
    title: "Evidence",
    links: [
      { href: "/changelog/", label: "Changelog" },
      { href: "/answers/", label: "Answers" },
      { href: "/rss.xml", label: "RSS feed" },
      { href: "/llms.txt", label: "llms.txt" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about/", label: "About" },
      { href: "/contact/", label: "Contact" },
      { href: "/legal/privacy/", label: "Privacy" },
      { href: "/legal/terms/", label: "Terms" },
    ],
  },
] as const;
