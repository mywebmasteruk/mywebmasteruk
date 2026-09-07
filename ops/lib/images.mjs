/**
 * Image facts and image repairs.
 *
 * Both of the image capabilities in the taxonomy are mechanical: an image either
 * declares its intrinsic size or it does not, and a file is either over its weight
 * budget or it is not. No judgement, no model, no wording — which is exactly why
 * they are allowed to ship unattended.
 *
 * On a customer's site these are usually the two biggest wins available on day one:
 * a hero photo straight off a phone camera, at 4 MB, with no width or height on the
 * tag, is both the slowest thing on the page and the reason the layout jumps while
 * it loads.
 */
import { readFile, writeFile, stat } from "node:fs/promises";
import { basename, extname } from "node:path";

/** Loaded lazily so a machine without the native binary can still run the loop. */
let sharp;
async function getSharp() {
  if (sharp === undefined) {
    try {
      sharp = (await import("sharp")).default;
    } catch {
      sharp = null;
    }
  }
  return sharp;
}

/** SVG carries its size in markup, not in a binary header, so it is read directly. */
async function svgSize(file) {
  const text = await readFile(file, "utf8");
  const viewBox = text.match(/viewBox\s*=\s*["']\s*[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)/i);
  if (viewBox) return { width: Math.round(+viewBox[1]), height: Math.round(+viewBox[2]) };
  const w = text.match(/\bwidth\s*=\s*["'](\d+)/i);
  const h = text.match(/\bheight\s*=\s*["'](\d+)/i);
  return w && h ? { width: +w[1], height: +h[1] } : null;
}

/** Intrinsic pixel dimensions, or null when the file cannot be read as an image. */
export async function dimensions(file) {
  if (extname(file).toLowerCase() === ".svg") return svgSize(file).catch(() => null);
  const s = await getSharp();
  if (!s) return null;
  try {
    const meta = await s(file).metadata();
    return meta.width && meta.height ? { width: meta.width, height: meta.height } : null;
  } catch {
    return null;
  }
}

/**
 * Re-encodes an oversized image in place, capping its longest edge.
 *
 * In place, and committed, so the previous file is one `git revert` away. Writing
 * a second "-optimised" file instead would mean editing every reference to it,
 * which turns a safe mechanical change into a risky one.
 *
 * Returns null when the result is not meaningfully smaller — replacing a file to
 * save two percent is churn, and churn in a git history that a customer is
 * invited to read is a cost of its own.
 */
export async function shrink(file, { maxEdge = 1600, quality = 82, minSaving = 0.15 } = {}) {
  const s = await getSharp();
  if (!s) return null;
  const ext = extname(file).toLowerCase();
  if (ext === ".svg") return null;

  const before = (await stat(file)).size;
  const image = s(file);
  const meta = await image.metadata();
  if (!meta.width || !meta.height) return null;

  const longest = Math.max(meta.width, meta.height);
  const pipeline = longest > maxEdge ? image.resize({ width: meta.width >= meta.height ? maxEdge : undefined, height: meta.height > meta.width ? maxEdge : undefined, withoutEnlargement: true }) : image;

  const encoded =
    ext === ".png"
      ? await pipeline.png({ compressionLevel: 9, palette: true }).toBuffer()
      : ext === ".webp"
        ? await pipeline.webp({ quality }).toBuffer()
        : await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();

  if (encoded.length >= before * (1 - minSaving)) return null;

  await writeFile(file, encoded);
  const after = await dimensions(file);
  return {
    file,
    name: basename(file),
    beforeBytes: before,
    afterBytes: encoded.length,
    savedPercent: Math.round((1 - encoded.length / before) * 100),
    resized: longest > maxEdge ? `${meta.width}×${meta.height} → ${after.width}×${after.height}` : null,
  };
}

/**
 * Every `<img>` in a source file that does not declare both width and height.
 * Returns the tag, its `src`, and where it sits, so a caller can patch it exactly.
 */
export function imagesMissingSize(source) {
  return [...source.matchAll(/<img\b[^>]*>/g)]
    .map((m) => ({ tag: m[0], index: m.index }))
    .filter(({ tag }) => !/\bwidth\s*=/.test(tag) || !/\bheight\s*=/.test(tag))
    .map((hit) => ({ ...hit, src: hit.tag.match(/\bsrc\s*=\s*["']([^"']+)["']/)?.[1] ?? null }))
    .filter((hit) => hit.src && !hit.src.startsWith("data:") && !/^https?:/.test(hit.src));
}

/** Adds width and height to a tag without disturbing anything else on it. */
export function withSize(tag, { width, height }) {
  const attrs = [/\bwidth\s*=/.test(tag) ? null : `width="${width}"`, /\bheight\s*=/.test(tag) ? null : `height="${height}"`]
    .filter(Boolean)
    .join(" ");
  if (!attrs) return tag;
  return tag.replace(/\s*\/?>$/, (end) => ` ${attrs}${end.trimStart().startsWith("/") ? " />" : ">"}`);
}
