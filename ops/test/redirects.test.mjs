/**
 * The redirect rewriter.
 *
 * It ships unattended and `_redirects` is order-sensitive: a rewrite that
 * reorders, duplicates or drops a line can break every rule below the one it
 * meant to fix. So the tests are about what it does NOT touch.
 */
import { suite, check } from "./harness.mjs";
import { rewriteRedirects } from "../apply.mjs";

const source = [
  "# --- Services ---",
  "/webmaster-services                      /                                   301!",
  "/portfolio                               /proof/                             301!",
  "/old-page/                               /answers/                           302",
  "",
].join("\n");
const domain = "mywebmaster.co.uk";

suite("redirects — repointing an existing rule");

let r = rewriteRedirects(source, new URL("https://www.mywebmaster.co.uk/webmaster-services"), "/answers/what-a-webmaster-does/", { domain });
const lines = r.text.split("\n");
check("an existing rule is rewritten, not appended", r.appended === false);
check("in place, at the same line", lines[1] === "/webmaster-services   /answers/what-a-webmaster-does/   301!");
check("the line count is unchanged", lines.length === source.split("\n").length);
check("the rule above is untouched", lines[0] === "# --- Services ---");
check("the rule below is untouched", lines[2] === "/portfolio                               /proof/                             301!");
check("a www address is keyed as a bare path, same site", r.from === "/webmaster-services");

r = rewriteRedirects(source, new URL("https://mywebmaster.co.uk/old-page"), "/answers/new/", { domain });
check("a trailing-slash difference still finds the existing rule", r.appended === false);
check("and the rule's own status code is kept, not forced to 301", r.text.includes("/old-page/   /answers/new/   302"));

suite("redirects — an address with no rule yet");

r = rewriteRedirects(source, new URL("https://blog.mywebmaster.co.uk/how-dns-works/"), "/answers/dns/", { domain });
check("a new address is appended", r.appended === true);
check("another host is keyed as an absolute URL", r.from === "https://blog.mywebmaster.co.uk/how-dns-works/");
check("under a marked, machine-written block", r.text.includes("# --- Recovered by Autopilot"));
check("existing rules keep their positions", r.text.split("\n").slice(0, 4).join("\n") === source.split("\n").slice(0, 4).join("\n"));

const twice = rewriteRedirects(r.text, new URL("https://blog.mywebmaster.co.uk/another/"), "/answers/other/", { domain });
check("a second recovery reuses the marker rather than adding another",
  twice.text.split("\n").filter((l) => l.startsWith("# --- Recovered by Autopilot")).length === 1);
check("and both recovered rules are present",
  twice.text.includes("https://blog.mywebmaster.co.uk/how-dns-works/") && twice.text.includes("https://blog.mywebmaster.co.uk/another/"));
