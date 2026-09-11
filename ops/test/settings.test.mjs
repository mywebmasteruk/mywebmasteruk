/**
 * Where a run's settings come from.
 *
 * This precedence is what makes the admin console actually govern the scheduled
 * run. Get it backwards and the console saves values that never apply, which is
 * the quiet failure it was built to end.
 */
import { suite, check } from "./harness.mjs";
import { layerSettings, settingsFromEnv, DEFAULTS } from "../lib/settings.mjs";

suite("settings — most specific wins");

let r = layerSettings({});
check("with nothing set, the built-in defaults apply", r.settings.model === DEFAULTS.model && r.source.model === "default");

r = layerSettings({ env: { model: "claude-sonnet-5" } });
check("the environment overrides a default", r.settings.model === "claude-sonnet-5" && r.source.model === "environment");

r = layerSettings({ env: { model: "claude-sonnet-5" }, consoleDefault: { model: "claude-haiku-4-5-20251001" } });
check("the console default overrides the environment", r.settings.model === "claude-haiku-4-5-20251001" && r.source.model === "console default");

r = layerSettings({
  env: { model: "claude-sonnet-5" },
  consoleDefault: { model: "claude-haiku-4-5-20251001" },
  clientRecord: { model: "claude-opus-5" },
  slug: "harbourside",
});
check("a client's own record overrides everything", r.settings.model === "claude-opus-5" && r.source.model === "harbourside record");

r = layerSettings({ env: { effort: "low" }, consoleDefault: { effort: undefined } });
check("an undefined value does not wipe a setting from below", r.settings.effort === "low" && r.source.effort === "environment");

r = layerSettings({ clientRecord: { somethingNew: "x", model: "claude-opus-5" } });
check("a key the loop does not know is ignored", !("somethingNew" in r.settings));

r = layerSettings({ consoleDefault: { notifyCadence: "daily" } });
check("each field records its own source", r.source.notifyCadence === "console default" && r.source.model === "default");

suite("settings — reading the environment");

const saved = { ...process.env };
for (const k of ["AI_PROVIDER", "AI_MODEL", "AI_EFFORT", "AI_MAX_TOKENS", "AI_DRAFTING", "AI_BRAND_VOICE", "NOTIFY_CADENCE"]) delete process.env[k];

check("an unset environment contributes nothing", Object.keys(settingsFromEnv()).length === 0);
process.env.AI_DRAFTING = "off";
check('AI_DRAFTING=off is read as false, not the string "off"', settingsFromEnv().drafting === false);
process.env.AI_DRAFTING = "on";
check("any other AI_DRAFTING value is read as true", settingsFromEnv().drafting === true);
process.env.AI_MAX_TOKENS = "4000";
check("AI_MAX_TOKENS is read as a number", settingsFromEnv().maxTokens === 4000);

for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
Object.assign(process.env, saved);
