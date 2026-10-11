import { readFileSync } from "node:fs";

const wranglerConfig = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
const placeholderKvId = "00000000000000000000000000000000";

if (wranglerConfig.includes(placeholderKvId)) {
  console.error("Deployment blocked: replace the placeholder OAUTH_KV id in wrangler.jsonc first.");
  process.exit(1);
}

console.log("Predeploy configuration check passed.");
