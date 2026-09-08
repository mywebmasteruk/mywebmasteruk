/**
 * The test suite.
 *
 * In the repo, not in a scratch directory. The first version of these lived in a
 * temp folder because they felt like working notes rather than a deliverable;
 * the folder was cleared overnight and a hundred and fifty of them vanished.
 * Tests that only exist on one machine are not tests.
 *
 *   npm test
 *
 * No framework: Node, a `check`, and a non-zero exit. The loop refuses to take a
 * dependency it cannot audit, and the thing that guards it is not the place to
 * make an exception.
 *
 * Anything reaching the network belongs in a *.live.mjs file instead, run by
 * hand. These must pass on a laptop with no credentials.
 */
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { state } from "./harness.mjs";

const dir = fileURLToPath(new URL("./", import.meta.url));
const files = (await readdir(dir)).filter((f) => f.endsWith(".test.mjs")).sort();
for (const file of files) await import(new URL(file, import.meta.url).href);

console.log(`\n${state.failures.length ? "FAIL" : "PASS"} — ${state.passed} passed, ${state.failures.length} failed`);
for (const f of state.failures) console.log(`  ✗ ${f}`);
process.exit(state.failures.length ? 1 : 0);
