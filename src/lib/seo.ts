import { site } from "~/data/site";

/** Google truncates around here; past it the brand suffix costs more than it earns. */
const TITLE_MAX = 65;

/**
 * Appends the brand only when it fits. A truncated title loses its ending,
 * which is where the differentiating words usually are.
 */
export function pageTitle(base: string, suffix = site.name): string {
  const withBrand = `${base} | ${suffix}`;
  return withBrand.length <= TITLE_MAX ? withBrand : base.slice(0, TITLE_MAX);
}
