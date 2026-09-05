// @ts-check
import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";
import mdx from "@astrojs/mdx";

export default defineConfig({
  site: "https://mywebmaster.co.uk",
  trailingSlash: "always",
  integrations: [
    mdx(),
    sitemap({
      // Legal pages carry no search intent; keep the sitemap to indexable, useful URLs.
      filter: (page) => !page.includes("/legal/"),
      changefreq: "weekly",
      lastmod: new Date(),
    }),
  ],
  build: { inlineStylesheets: "auto", format: "directory" },
  prefetch: { prefetchAll: true, defaultStrategy: "hover" },
  compressHTML: true,
});
