/**
 * The database URL, normalised before it is ever fetched.
 *
 * The notice queue read "fetch failed" in CI. A trailing newline or a stray
 * `/rest/v1` on the secret would each have produced a silent variant of that, so
 * they are stripped here where a test can hold the line. What is left — a URL
 * that parses but points nowhere — is the owner's to fix, and the error now says
 * so by name.
 */
import { suite, check } from "./harness.mjs";
import { restBase } from "../lib/db.mjs";

suite("db — the REST base is normalised, not trusted as pasted");

const withUrl = (value, fn) => {
  const had = Object.prototype.hasOwnProperty.call(process.env, "SUPABASE_URL");
  const previous = process.env.SUPABASE_URL;
  if (value === undefined) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = value;
  try {
    return fn();
  } finally {
    if (had) process.env.SUPABASE_URL = previous;
    else delete process.env.SUPABASE_URL;
  }
};

check(
  "a trailing newline is trimmed",
  withUrl("https://example.supabase.co\n", restBase) === "https://example.supabase.co",
);
check(
  "surrounding spaces are trimmed",
  withUrl("  https://example.supabase.co  ", restBase) === "https://example.supabase.co",
);
check(
  "a trailing slash is dropped",
  withUrl("https://example.supabase.co/", restBase) === "https://example.supabase.co",
);
check(
  "an accidental /rest/v1 suffix is dropped, so the path is never doubled",
  withUrl("https://example.supabase.co/rest/v1", restBase) === "https://example.supabase.co",
);
check(
  "a clean URL is returned untouched",
  withUrl("https://example.supabase.co", restBase) === "https://example.supabase.co",
);
check(
  "with nothing set it falls back to a real host, not an empty string",
  withUrl(undefined, restBase).startsWith("https://"),
);
