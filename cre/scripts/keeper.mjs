// Testnet price keeper: runs the real Chainlink CRE workflow (`cre workflow simulate --broadcast`) over every group
// whose price is missing or past half its allowed age, so groups people create get CRE prices without anyone
// running the CLI by hand. CRE allows 15 contract reads per run and pricing a group takes 4, so groups go in
// batches of 3. The app's labelled FALLBACK route covers any gap while this keeper isn't running.
// Usage (from cre/, with ../.env and .env loaded): node scripts/keeper.mjs [--once]
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createPublicClient, http, parseAbi } from "viem";
import { monadTestnet } from "viem/chains";

const DIR = join(import.meta.dirname, "..");
const INDEXER = process.env.NEXT_PUBLIC_INDEXER_URL;
const RPC = process.env.MONAD_TESTNET_RPC ?? "https://testnet-rpc.monad.xyz";
const EVERY_MS = Number(process.env.KEEPER_INTERVAL_SECONDS ?? 240) * 1000;
const BATCH = 3;
if (!INDEXER) throw new Error("NEXT_PUBLIC_INDEXER_URL (the Envio GraphQL endpoint) is required");

const base = JSON.parse(readFileSync(join(DIR, "plenum-nav/config.json"), "utf8"));
const pc = createPublicClient({ chain: monadTestnet, transport: http(RPC, { retryCount: 4 }) });
const oracleAbi = parseAbi(["function latest(address) view returns ((uint256 nav, uint64 timestamp, uint8 source))"]);
const mandateAbi = parseAbi(["function navMaxAge() view returns (uint32)"]);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function stale() {
  const res = await fetch(INDEXER, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: '{ Plenum(where: {totalUnits: {_gt: "0"}}) { id name mandate } }' }),
  });
  const groups = (await res.json()).data?.Plenum ?? [];
  const now = Number((await pc.getBlock()).timestamp);
  const out = [];
  for (const g of groups) {
    const [r, maxAge] = await Promise.all([
      pc.readContract({ address: base.navOracle, abi: oracleAbi, functionName: "latest", args: [g.id] }),
      pc.readContract({ address: g.mandate, abi: mandateAbi, functionName: "navMaxAge" }),
    ]);
    const age = r.timestamp === 0n ? Infinity : now - Number(r.timestamp);
    if (age > maxAge / 2) out.push({ ...g, age });
  }
  return out.sort((a, b) => b.age - a.age);
}

async function tick() {
  const due = await stale();
  log(`${due.length} group(s) need a price`);
  for (let i = 0; i < due.length; i += BATCH) {
    const batch = due.slice(i, i + BATCH);
    writeFileSync(join(DIR, "plenum-nav/keeper-config.json"), JSON.stringify({ ...base, plenums: batch.map((g) => g.id) }, null, 2));
    log("CRE run:", batch.map((g) => g.name).join(", "));
    try {
      const out = execFileSync("cre", ["workflow", "simulate", "plenum-nav", "--target", "keeper-settings", "--trigger-index", "0", "--non-interactive", "--broadcast"], { cwd: DIR, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      for (const line of out.split("\n")) if (/0x[0-9a-f]{64}|NAV|gold spot|rror/i.test(line)) log(" ", line.trim().slice(0, 200));
    } catch (e) {
      log("  run failed:", String(e.stderr ?? e).split("\n").slice(-4).join(" | ").slice(0, 400));
    }
  }
}

do {
  await tick().catch((e) => log("tick failed:", String(e).slice(0, 300)));
  if (process.argv.includes("--once")) break;
  await new Promise((r) => setTimeout(r, EVERY_MS));
} while (true);
