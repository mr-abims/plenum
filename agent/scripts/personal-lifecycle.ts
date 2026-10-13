/**
 * Personal portfolio (a plenum of one, SPEC A23) end to end on Monad testnet, the same evidence as the group
 * rehearsal but with the owner acting alone:
 *
 *   1. An outsider holding a valid, owner-signed invite cannot join: the member cap is 1 (MEMBER_CAP, reverted tx).
 *   2. The manager's oversized trade is refused in-band (TRADE_TOO_LARGE) and escalated; the owner alone approves
 *      and the proposal executes (escalateQuorumBps = 10000 of one member).
 *   3. The owner alone pauses the manager (pauseQuorum = 1); the manager's write then reverts (PAUSED); the owner
 *      resumes it.
 *
 * The plan in step 2 is scripted (model id `scripted-plan`); the live model runs separately via src/main.ts.
 *
 * Env (from ../.env): MONAD_TESTNET_RPC, PERSONAL_PLENUM (or deployments' personalPlenum), MANAGER_OPERATOR_KEY,
 * MANAGER_ENC_SEED, DEPLOYER_PRIVATE_KEY (the owner), FALLBACK_NAV_WRITER_KEY (the outsider), BLOB_API_URL.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createWalletClient, encodeAbiParameters, hexToBytes, http, stringToHex, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { governanceAbi, managerGatewayAbi, plenumAbi } from "@plenum/abis";
import { deriveEncryptionKey } from "@plenum/crypto";
import { makeClients, writeWithGas } from "../src/chain.ts";
import { loadDeployment } from "../src/config.ts";
import { buildContext } from "../src/context.ts";
import { runOnce } from "../src/loop.ts";
import { BlobMemberContext, BlobMemoStore } from "../src/stores.ts";
import { toContractActions } from "../src/tools.ts";
import { ScriptedModel, call, plan } from "../redteam/harness.ts";

const env = process.env;
const RPC = env.MONAD_TESTNET_RPC!;
const EXPLORER = "https://testnet.monadvision.com/tx/";
const USD = 1_000_000n;
const raw = JSON.parse(readFileSync(join(import.meta.dirname, "../../contracts/deployments/10143.json"), "utf8"));
const plenum = (env.PERSONAL_PLENUM ?? raw.personalPlenum) as Address;
const dep = loadDeployment(10143);
const manager = makeClients(RPC, 10143, env.MANAGER_OPERATOR_KEY as Hex);
const owner = makeClients(RPC, 10143, env.DEPLOYER_PRIVATE_KEY as Hex);
const outsider = privateKeyToAccount(env.FALLBACK_NAV_WRITER_KEY as Hex);
const enc = deriveEncryptionKey(hexToBytes(env.MANAGER_ENC_SEED as Hex));
const pc = manager.publicClient;

const step = (s: string) => console.log(`\n== ${s}`);
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${what}`);
  if (!cond) process.exitCode = 1;
};
/** Sends a write that is expected to revert, with a fixed gas limit so the refusal is recorded onchain. */
async function sendExpectingRevert(key: Hex, req: { address: Address; abi: readonly unknown[]; functionName: string; args: readonly unknown[] }) {
  const wallet = createWalletClient({ chain: monadTestnet, transport: http(RPC), account: privateKeyToAccount(key) });
  const hash = await wallet.writeContract({ ...req, gas: 300_000n } as never);
  const receipt = await pc.waitForTransactionReceipt({ hash });
  return { hash, status: receipt.status };
}

const ctxFor = (model: ScriptedModel) =>
  buildContext(
    {
      clients: manager,
      model,
      plenum,
      external: [],
      log: () => {},
      memoStore: new BlobMemoStore(manager, plenum, env.BLOB_API_URL!, enc),
      memberContext: new BlobMemberContext(plenum, env.BLOB_API_URL!, enc),
    },
    dep,
  );
const ctx = await ctxFor(new ScriptedModel([]));
console.log(`personal portfolio ${plenum} (owner ${owner.account.address})`);

step("1. Nobody else can join, even with the owner's invite");
const expiry = (await pc.getBlock()).timestamp + 86_400n;
const signature = await owner.walletClient.signTypedData({
  account: owner.account,
  domain: { name: "Plenum", version: "1", chainId: 10143, verifyingContract: plenum },
  types: { Invite: [{ name: "invitee", type: "address" }, { name: "nonce", type: "uint256" }, { name: "expiry", type: "uint64" }] },
  primaryType: "Invite",
  message: { invitee: outsider.address, nonce: 777n, expiry },
});
const invite = encodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "uint64" }, { type: "bytes" }], [outsider.address, 777n, expiry, signature]);
const j = await sendExpectingRevert(env.FALLBACK_NAV_WRITER_KEY as Hex, { address: plenum, abi: plenumAbi, functionName: "join", args: [invite, `0x${"00".repeat(32)}`] });
const members = await pc.readContract({ address: plenum, abi: plenumAbi, functionName: "memberCount" });
ok(j.status === "reverted" && members === 1n, `outsider's join reverted (MEMBER_CAP); still ${members} member · ${EXPLORER}${j.hash}`);

step("2. Too big for the manager alone: escalated, the owner alone approves");
const big = plan([
  { adapter: dep.tbillVault, op: "Withdraw", assets: 1_500n * USD },
  { adapter: dep.gold, op: "Deposit", assets: 1_500n * USD },
]);
const r = await runOnce(await ctxFor(new ScriptedModel([call("execute_in_band", { plan: big }), call("escalate", { plan: big })])));
ok(r.status === "escalated" && r.why === "TRADE_TOO_LARGE", `escalated (${r.status}${"why" in r ? ` because ${r.why}` : ""})`);
if (r.status !== "escalated") process.exit(1);
console.log("escalate", EXPLORER + r.txHash);
const id = BigInt(r.proposalId);
const a = await writeWithGas(owner, { address: ctx.governance, abi: governanceAbi, functionName: "approve", args: [id] });
console.log("approve (owner)", EXPLORER + a.hash);
const e = await writeWithGas(owner, { address: ctx.governance, abi: governanceAbi, functionName: "executeProposal", args: [id] });
console.log("execute", EXPLORER + e.hash);
const prop = await pc.readContract({ address: ctx.governance, abi: governanceAbi, functionName: "proposals", args: [id] });
ok(prop[5] === true, `proposal ${id} executed on the owner's single approval`);

step("3. The owner alone pauses the manager");
const p = await writeWithGas(owner, { address: ctx.governance, abi: governanceAbi, functionName: "pause", args: [] });
const paused = await pc.readContract({ address: ctx.governance, abi: governanceAbi, functionName: "paused" });
ok(paused === true, `paused by one vote · ${EXPLORER}${p.hash}`);
const small = toContractActions([{ adapter: dep.gold, op: "Withdraw", assets: (100n * USD).toString() }]);
const f = await sendExpectingRevert(env.MANAGER_OPERATOR_KEY as Hex, {
  address: ctx.gateway,
  abi: managerGatewayAbi,
  functionName: "executeInBand",
  args: [small, `0x${"00".repeat(32)}`, stringToHex("paused-check (manual test)", { size: 32 })],
});
ok(f.status === "reverted", `manager's write while paused reverted (PAUSED) · ${EXPLORER}${f.hash}`);
const u = await writeWithGas(owner, { address: ctx.governance, abi: governanceAbi, functionName: "unpause", args: [] });
const resumed = !(await pc.readContract({ address: ctx.governance, abi: governanceAbi, functionName: "paused" }));
ok(resumed, `resumed by the owner · ${EXPLORER}${u.hash}`);
