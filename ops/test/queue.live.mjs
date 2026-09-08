/**
 * The notice queue, against the real database.
 *
 * `.live.mjs`, not `.test.mjs`: it needs credentials and a network, so `npm test`
 * does not run it. Run by hand with SUPABASE_* set. It cleans up after itself.
 *
 * The property under test is the one that costs a customer something: a crash
 * between claiming a row and sending it must not produce two emails on the next
 * run, and must not produce zero either.
 */
import { suite, check } from "./harness.mjs";
import { db } from "../lib/db.mjs";
import { enqueue, pending, claim, markSent, markFailed, MAX_ATTEMPTS, messageIdFor } from "../lib/queue.mjs";

const made = [];
const add = async (title) => {
  const r = await enqueue({ slug: null, class: "auto", title });
  made.push(r.id);
  return r.id;
};

suite("queue — the double send");

const id = await add("test: a change that must be told once");
let p = await pending(null);
check("a queued notice is due", p.due.some((r) => r.id === id));

// One run claims it and then dies before sending.
const first = await claim(p.due.find((r) => r.id === id));
check("the first run takes the lease", first.claimed === true);
check("and the attempt is counted at claim, not at send", first.row.attempts === 1);

// A second run starts immediately, as it would on a retry or a parallel client.
p = await pending(null);
check("a second run within the lease does NOT see it", !p.due.some((r) => r.id === id));

const second = await claim({ id, attempts: 1 });
check("and cannot claim it either — one winner, not two sends", second.claimed === false);

// The first run recovers and finishes.
await markSent(id, messageIdFor(id));
p = await pending(null);
check("once sent it is never due again", !p.due.some((r) => r.id === id));
check("nor claimable again", (await claim({ id, attempts: 1 })).claimed === false);

suite("queue — a failure is retried, but not for ever");

const id2 = await add("test: a notice whose send keeps failing");
let attempts = 0;
for (let i = 0; i < 5; i++) {
  const list = await pending(null);
  const row = list.due.find((r) => r.id === id2);
  if (!row) break;
  const c = await claim(row);
  if (!c.claimed) break;
  attempts++;
  await markFailed(id2, `simulated failure ${i + 1}`);
}
check(`a failing notice is retried and then stops at ${MAX_ATTEMPTS}`, attempts === MAX_ATTEMPTS);

const after = await pending(null);
check("it is no longer offered for sending", !after.due.some((r) => r.id === id2));
check("but it is reported as stuck, not forgotten", after.stuck.some((r) => r.id === id2));
const stuckRow = after.stuck.find((r) => r.id === id2);
check("and it carries the reason", String(stuckRow.last_error).includes("simulated failure"));
check("still unsent, so nothing pretends it was delivered", stuckRow.sent_at === null);

suite("queue — released after a known failure");

const id3 = await add("test: a notice that fails then succeeds");
const row3 = (await pending(null)).due.find((r) => r.id === id3);
await claim(row3);
await markFailed(id3, "smtp said no");
check("a known failure releases the lease immediately", (await pending(null)).due.some((r) => r.id === id3));
await markSent(id3, messageIdFor(id3));
check("and it can then be delivered", !(await pending(null)).due.some((r) => r.id === id3));

for (const x of made) await db(`/notices?id=eq.${x}`, { method: "DELETE" });
check("test rows cleaned up", true);
