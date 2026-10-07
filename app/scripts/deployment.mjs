// Copies contracts/deployments/<chainId>.json into src/lib/deployment.json for the app build.
// Usage: node scripts/deployment.mjs [10143|31337]
import { copyFileSync } from "node:fs";
import { join } from "node:path";

const chainId = Number(process.argv[2] ?? 10143);
if (chainId !== 10143 && chainId !== 31337) throw new Error("Monad testnet (10143) or local (31337) only");
copyFileSync(
  join(import.meta.dirname, `../../contracts/deployments/${chainId}.json`),
  join(import.meta.dirname, "../src/lib/deployment.json"),
);
console.log(`src/lib/deployment.json ← chain ${chainId}`);
