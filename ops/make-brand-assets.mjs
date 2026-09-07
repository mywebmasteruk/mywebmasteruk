/** Square icon and wordmark logo for Stripe (and anywhere else that needs raster). */
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 48 48">
  <rect width="48" height="48" rx="11" fill="#0B0E13"/>
  <path d="M13 30a11 11 0 1 1 4.2 4.9" fill="none" stroke="#C8F04A" stroke-width="3.4" stroke-linecap="round"/>
  <circle cx="24" cy="13" r="3.6" fill="#C8F04A"/>
</svg>`;

const logo = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="256" viewBox="0 0 256 64">
  <rect width="256" height="64" fill="#0B0E13"/>
  <g transform="translate(16,12)">
    <rect width="40" height="40" rx="9" fill="#12161D" stroke="#2A323F"/>
    <path d="M10.8 25a9.2 9.2 0 1 1 3.5 4.1" fill="none" stroke="#C8F04A" stroke-width="2.9" stroke-linecap="round"/>
    <circle cx="20" cy="10.8" r="3" fill="#C8F04A"/>
  </g>
  <text x="68" y="39" font-family="Helvetica,Arial,sans-serif" font-size="20" font-weight="600" fill="#FCFBF8" letter-spacing="-0.6">mywebmaster</text>
</svg>`;

for (const [name, svg] of [["stripe-icon.png", icon], ["stripe-logo.png", logo]]) {
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(new URL(`../public/brand/${name}`, import.meta.url), png);
  console.log(`${name} — ${(png.length / 1024).toFixed(1)}KB`);
}
