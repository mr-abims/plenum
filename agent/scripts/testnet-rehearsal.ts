/**
 * Testnet rehearsal without a live model (SPEC §8, §9, GV-1). A scripted plan stands in for the model; everything
 * else is real: Monad testnet, the deployed contracts, the CRE workflow, the app's data-room API.
 *
 *   1. Price the plenum via the CRE workflow simulation (--broadcast); FALLBACK writer only if CRE fails.
 *   2. Manager in-band cycle → executeInBand with keccak256(memo) + model id; memo encrypted to the data room.
 *   3. Oversized trade → refused in-band (TRADE_TOO_LARGE) → escalated to a proposal.
 *   4. Members approve and execute the proposal.
 *   5. The manager's own key decrypts the memo and it matches the onchain rationale hash.
 *
 * Env (from ../.env): MONAD_TESTNET_RPC, PLENUM_ADDRESS, MANAGER_OPERATOR_KEY, MANAGER_ENC_SEED, DEPLOYER_PRIVATE_KEY,
 * FALLBACK_NAV_WRITER_KEY. APP_URL defaults to http://localhost:3100.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { createWalletClient, hexToBytes, http, keccak256, toHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { governanceAbi, mandateAbi, navOracleAbi } from "@plenum/abis";
import { canonicalJson, decryptDocument, deriveEncryptionKey, memoDocId, type Envelope } from "@plenum/crypto";
import { makeClients, writeWithGas } from "../src/chain.ts";
import { loadDeployment } from "../src/config.ts";
import { buildContext } from "../src/context.ts";
import { runOnce } from "../src/loop.ts";
import { observe } from "../src/observe.ts";
import { BlobMemberContext, BlobMemoStore } from "../src/stores.ts";
import { ScriptedModel, call, plan, say } from "../redteam/harness.ts";

const env = process.env;
const RPC = env.MONAD_TESTNET_RPC!;
const API = `${env.APP_URL ?? "http://localhost:3100"}/api/blobs`;
const EXPLORER = "https://testnet.monadvision.com/tx/";
const USD = 1_000_000n;
const plenum = env.PLENUM_ADDRESS as Address;
const dep = loadDeployment(10143);
const clients = makeClients(RPC, 10143, env.MANAGER_OPERATOR_KEY as Hex);
const enc = deriveEncryptionKey(hexToBytes(env.MANAGER_ENC_SEED as Hex));
const step = (s: string) => console.log(`\n== ${s}`);
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${what}`);
  if (!cond) process.exitCode = 1;
};
const asClients = (key: Hex) => ({ ...clients, account: privateKeyToAccount(key), walletClient: createWalletClient({ chain: monadTestnet, transport: http(RPC), account: privateKeyToAccount(key) }) });

async function price() {
  const before = await clients.publicClient.readContract({ address: dep.navOracle as Address, abi: navOracleAbi, functionName: "latest", args: [plenum] });
  try {
    execFileSync("cre", ["workflow", "simulate", "plenum-nav", "--target", "staging-settings", "--trigger-index", "0", "--non-interactive", "--broadcast"], {
      cwd: join(import.meta.dirname, "../../cre"),
      stdio: "pipe",
      env: { ...env, PATH: `${env.HOME}/.cre/bin:${env.HOME}/.bun/bin:${env.PATH}` },
    });
  } catch (err) {
    console.log("CRE simulation failed; using the labelled FALLBACK writer:", String(err).slice(0, 200));
    const mandate = (await import("../src/context.ts")) && (await clients.publicClient.readContract({ address: plenum, abi: [{ type: "function", name: "mandate", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] }], functionName: "mandate" }));
    const total = await clients.publicClient.readContract({ address: mandate, abi: mandateAbi, functionName: "holdingsTotal" });
    await writeWithGas(asClients(env.FALLBACK_NAV_WRITER_KEY as Hex), { address: dep.navOracle as Address, abi: navOracleAbi, functionName: "fallbackWrite", args: [plenum, total] });
  }
  const after = await clients.publicClient.readContract({ address: dep.navOracle as Address, abi: navOracleAbi, functionName: "latest", args: [plenum] });
  ok(after.timestamp > before.timestamp, `fresh NAV ${after.nav / USD} USD from ${after.source === 0 ? "CRE" : "FALLBACK"}`);
}

const ctxFor = (model: ScriptedModel) =>
  buildContext({ clients, model, plenum, external: [], log: () => {}, memoStore: new BlobMemoStore(clients, plenum, API, enc), memberContext: new BlobMemberContext(plenum, API, enc) }, dep);

step("1. Price via Chainlink CRE");
await price();
const obs = await observe(await ctxFor(new ScriptedModel([])));
console.log(
  `holdings ${Number(obs.holdings.total) / 1e6} USD, cash ${obs.holdings.cashBps / 100}%,`,
  obs.holdings.sleeves.map((s) => `${s.name} ${s.weightBps / 100}% (target ${s.targetBps / 100}±${s.bandBps / 100})`).join(", "),
  `| paused ${obs.paused} | cooldown ${obs.cooldownRemainingSeconds}s`,
);

step("2. In-band rebalance");
const inband = plan([{ adapter: dep.tbillVault, op: "Deposit", assets: 200n * USD }]);
const m1 = new ScriptedModel([call("get_portfolio", {}), call("simulate", { actions: inband.actions }), call("execute_in_band", { plan: inband })]);
const r1 = await runOnce(await ctxFor(m1));
ok(r1.status === "executed", `in-band executed (${r1.status}${"reason" in r1 ? ` ${r1.reason}` : ""})`);
if ("txHash" in r1) console.log(EXPLORER + r1.txHash);

step("3. Oversized trade → escalation");
const big = plan([
  { adapter: dep.tbillVault, op: "Withdraw", assets: 1_500n * USD },
  { adapter: dep.gold, op: "Deposit", assets: 1_500n * USD },
]);
const m2 = new ScriptedModel([call("execute_in_band", { plan: big }), call("escalate", { plan: big })]);
const r2 = await runOnce(await ctxFor(m2));
ok(r2.status === "escalated" && r2.why === "TRADE_TOO_LARGE", `escalated (${r2.status}${"why" in r2 ? ` because ${r2.why}` : ""})`);
if (r2.status !== "escalated") process.exit(1);
console.log(EXPLORER + r2.txHash);

step("4. Members approve and execute");
const member = asClients(env.DEPLOYER_PRIVATE_KEY as Hex);
const ctx = await ctxFor(m2);
const id = BigInt(r2.proposalId);
const a = await writeWithGas(member, { address: ctx.governance, abi: governanceAbi, functionName: "approve", args: [id] });
console.log("approve", EXPLORER + a.hash);
const e = await writeWithGas(member, { address: ctx.governance, abi: governanceAbi, functionName: "executeProposal", args: [id] });
console.log("execute", EXPLORER + e.hash);
const prop = await clients.publicClient.readContract({ address: ctx.governance, abi: governanceAbi, functionName: "proposals", args: [id] });
ok(prop[5] === true, `proposal ${id} executed by members`);

step("5. Memo in the data room matches the onchain hash");
for (const r of [r1, r2]) {
  if (!("memoHash" in r)) continue;
  const res = await fetch(`${API}/${memoDocId(r.memoHash, clients.account.address)}`);
  const memo = res.ok ? JSON.parse(new TextDecoder().decode(await decryptDocument((await res.json()) as Envelope, enc))) : undefined;
  ok(!!memo && keccak256(toHex(canonicalJson(memo))) === r.memoHash, `memo ${r.memoHash.slice(0, 12)}… decrypts and matches`);
}
