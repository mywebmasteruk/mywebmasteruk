/** Renders the social card once, at build-prep time, so no runtime image service is needed. */
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0B0E13"/>
  <g transform="translate(80,72)">
    <rect width="64" height="64" rx="15" fill="#12161D" stroke="#2A323F"/>
    <path d="M17.3 40a14.7 14.7 0 1 1 5.6 6.5" fill="none" stroke="#C8F04A" stroke-width="4.5" stroke-linecap="round"/>
    <circle cx="32" cy="17.3" r="4.8" fill="#C8F04A"/>
    <text x="84" y="42" font-family="Helvetica,Arial,sans-serif" font-size="30" font-weight="600" fill="#FCFBF8">mywebmaster</text>
  </g>
  <text x="80" y="290" font-family="Helvetica,Arial,sans-serif" font-size="72" font-weight="700" fill="#FCFBF8" letter-spacing="-2">Autopilot</text>
  <text x="80" y="368" font-family="Helvetica,Arial,sans-serif" font-size="42" font-weight="400" fill="#838D9C" letter-spacing="-1">The website that optimises itself —</text>
  <text x="80" y="422" font-family="Helvetica,Arial,sans-serif" font-size="42" font-weight="400" fill="#838D9C" letter-spacing="-1">and publishes every change it makes.</text>
  <rect x="80" y="500" width="1040" height="1" fill="#2A323F"/>
  <text x="80" y="556" font-family="Menlo,monospace" font-size="24" fill="#C8F04A">MEASURE · DECIDE · SHIP · CHECK</text>
  <text x="1120" y="556" text-anchor="end" font-family="Menlo,monospace" font-size="24" fill="#5A6472">mywebmaster.co.uk</text>
</svg>`;

const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
await writeFile(new URL("../public/brand/og.png", import.meta.url), png);
console.log(`og.png written — ${(png.length / 1024).toFixed(1)}KB`);
