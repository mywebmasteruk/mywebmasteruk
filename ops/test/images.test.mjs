/**
 * The two mechanical image repairs.
 *
 * Both ship unattended, so both have to be exactly right about not changing
 * anything they were not asked to.
 */
import { suite, check } from "./harness.mjs";
import { imagesMissingSize, withSize } from "../lib/images.mjs";

suite("images — finding tags that need a size");

const src = `
<img src="/brand/og.png" alt="a">
<img src="/brand/logo.svg" alt="b" width="48" height="48">
<img src="https://cdn.example.com/x.png" alt="remote">
<img src="data:image/gif;base64,R0lGOD" alt="inline">
<img src="/brand/icon.png" alt="c" class="x" />
`;
const hits = imagesMissingSize(src);
check("only local tags missing a size are returned", hits.length === 2);
check("a tag that already declares both is skipped", !hits.some((h) => h.src.endsWith("logo.svg")));
check("remote images are left alone", !hits.some((h) => /^https?:/.test(h.src)));
check("data URIs are left alone", !hits.some((h) => h.src.startsWith("data:")));

suite("images — adding the attributes");

check("both are added", withSize('<img src="/a.png" alt="a">', { width: 10, height: 20 }) === '<img src="/a.png" alt="a" width="10" height="20">');
check("a self-closing tag stays self-closing", withSize('<img src="/a.png" />', { width: 10, height: 20 }) === '<img src="/a.png" width="10" height="20" />');
check("only the missing one is added", withSize('<img src="/a.png" width="10">', { width: 10, height: 20 }) === '<img src="/a.png" width="10" height="20">');
check("a complete tag is returned untouched", withSize('<img src="/a.png" width="10" height="20">', { width: 1, height: 2 }) === '<img src="/a.png" width="10" height="20">');
