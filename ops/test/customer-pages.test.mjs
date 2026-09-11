/**
 * The customer's own pages, against the one fixer that sweeps the whole tree.
 *
 * planRun refuses findings aimed at a page the customer wrote, but img-attrs
 * ignores `target`, so that refusal never sees it. These run the real fixer
 * over real files in a scratch project, because a filter tested on its own
 * says nothing about whether the fixer uses it.
 */
import { mkdtemp, mkdir, writeFile, readFile, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { suite, check } from "./harness.mjs";
import { fixers, customerFiles } from "../apply.mjs";

suite("apply — img-attrs never touches a customer-written page");

const base = `${await mkdtemp(join(tmpdir(), "img-attrs-"))}/`;
await mkdir(join(base, "src/pages"), { recursive: true });
await mkdir(join(base, "public/brand"), { recursive: true });
await copyFile(fileURLToPath(new URL("../../public/brand/og.png", import.meta.url)), join(base, "public/brand/og.png"));

const tag = '<img src="/brand/og.png" alt="card">';
const theirsBefore = `<p>Written by the customer</p>\n${tag}\n`;
await writeFile(join(base, "src/pages/emergency.astro"), theirsBefore);
await writeFile(join(base, "src/pages/areas-covered.astro"), `<p>Generated</p>\n${tag}\n`);

const client = { frozen: [{ path: "/emergency/", editedBy: "Dan Whitfield", until: "2026-12-06T00:00:00Z" }] };
const result = await fixers["img-attrs"]({ capability: "img-attrs" }, { client, base });
const theirs = await readFile(join(base, "src/pages/emergency.astro"), "utf8");
const ours = await readFile(join(base, "src/pages/areas-covered.astro"), "utf8");

check("the customer's page is byte-for-byte unchanged", theirs === theirsBefore);
check("the generated page gets its width and height",
  /<img src="\/brand\/og\.png" alt="card" width="\d+" height="\d+">/.test(ours));
check("only the generated page is reported as changed",
  result.applied === true && result.files.length === 1 && result.files[0] === "src/pages/areas-covered.astro");
check("and the summary says a customer page was skipped", /1 customer-written page skipped/.test(result.summary));

check("a customer page stays off limits after its 'until' date",
  customerFiles({ frozen: [{ path: "/emergency/", until: "2020-01-01" }] }, base).has(join(base, "src/pages/emergency.astro")));
check("an answer page maps to its content file",
  customerFiles({ frozen: [{ path: "/answers/x/" }] }, base).has(join(base, "src/content/answers/x.mdx")));
check("no client record means nothing is off limits", customerFiles(null, base).size === 0);

// Only the directory this test made.
await rm(base, { recursive: true, force: true });
