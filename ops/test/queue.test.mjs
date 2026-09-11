/**
 * The queue's pure parts — the bits that decide, without a database.
 */
import { suite, check } from "./harness.mjs";
import { messageIdFor, LEASE_MINUTES, MAX_ATTEMPTS } from "../lib/queue.mjs";

suite("queue — traceability and bounds");

check("a message id is deterministic per row", messageIdFor("abc") === messageIdFor("abc"));
check("and distinct per row, so a duplicate is traceable", messageIdFor("abc") !== messageIdFor("def"));
check("it is a well-formed Message-ID", /^<notice-.+@.+>$/.test(messageIdFor("abc")));
check("the lease is long enough to outlast a send, short enough to recover", LEASE_MINUTES >= 5 && LEASE_MINUTES <= 60);
check("retries are bounded", MAX_ATTEMPTS >= 2 && MAX_ATTEMPTS <= 5);
