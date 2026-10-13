/**
 * SPEC A26 end to end on Monad testnet, on a group from the second factory ("Rules Demo Club"):
 *
 *   1. Three members join by invite and contribute (MOCK test dollars). Demo timing: 10-minute investment periods,
 *      3-minute free-exit window, 2% breaking fee, 10-minute rule-change delay.
 *   2. Member B takes money out mid-period: pays the fee; a quarter goes to the treasury, the rest stays with the group.
 *   3. Members pass a rule change (2 of 3 approve): it is queued behind the delay. Member C disagrees and leaves
 *      during the delay, free of charge.
 *   4. Members replace the AI manager with another key, then vote the original back.
 *   5. After the delay, anyone applies the new rules.
 *
 * Prices for this demo group come from the labelled FALLBACK writer (the CRE workflow prices the long-lived groups).
 *
 * Env (from ../.env): MONAD_TESTNET_RPC, DEPLOYER_PRIVATE_KEY (member A, organizer, MOCK minter),
 * LIFECYCLE_MEMBER_B_KEY, LIFECYCLE_MEMBER_C_KEY, FALLBACK_NAV_WRITER_KEY, MANAGER_OPERATOR_KEY.
 */
import { decodeEventLog, encodeAbiParameters, erc20Abi, type Address, type Hash, type Hex } from "viem";
import { governanceAbi, managerGatewayAbi, mandateAbi, mockUSDAbi, navOracleAbi, plenumAbi, plenumFactoryAbi } from "@plenum/abis";
import { makeClients, type Clients } from "../src/chain.ts";
import { loadDeployment } from "../src/config.ts";

const env = process.env;
const RPC = env.MONAD_TESTNET_RPC!;
const EXPLORER = "https://testnet.monadvision.com/tx/";
const USD = 1_000_000n;
const ZERO32 = `0x${"00".repeat(32)}` as Hex;
const dep = loadDeployment(10143) as unknown as Record<"factory" | "asset" | "navOracle" | "tbillVault" | "creditVault" | "gold" | "treasury", Address>;
const A = makeClients(RPC, 10143, env.DEPLOYER_PRIVATE_KEY as Hex);
const B = makeClients(RPC, 10143, env.LIFECYCLE_MEMBER_B_KEY as Hex);
const C = makeClients(RPC, 10143, env.LIFECYCLE_MEMBER_C_KEY as Hex);
const W = makeClients(RPC, 10143, env.FALLBACK_NAV_WRITER_KEY as Hex);
const managerKey = makeClients(RPC, 10143, env.MANAGER_OPERATOR_KEY as Hex).account.address;
const pc = A.publicClient;
const evidence: { step: string; tx: Hash }[] = [];

const step = (s: string) => console.log(`\n== ${s}`);
const ok = (cond: boolean, what: string) => {
  console.log(`${cond ? "PASS" : "FAIL"}  ${what}`);
  if (!cond) process.exitCode = 1;
};
/**
 * Writes with an explicit gas limit (estimate + 20%) and fee (base fee + 2 gwei). Monad bills the declared limit, and
 * viem's default max fee can exceed a lightly funded account's balance check, so both are kept tight.
 */
async function tx(c: Clients, label: string, req: { address: Address; abi: readonly unknown[]; functionName: string; args: readonly unknown[] }) {
  const [estimate, block] = await Promise.all([pc.estimateContractGas({ ...req, account: c.account } as never), pc.getBlock()]);
  const tip = 2_000_000_000n;
  const hash = await c.walletClient.writeContract({
    ...req,
    account: c.account,
    chain: c.chain,
    gas: (estimate * 12n) / 10n,
    maxFeePerGas: (block.baseFeePerGas ?? 100_000_000_000n) + tip,
    maxPriorityFeePerGas: tip,
  } as never);
  const r = await pc.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${label} reverted: ${hash}`);
  evidence.push({ step: label, tx: hash });
  console.log(`  ${label} · ${EXPLORER}${hash}`);
  return hash;
}
const read = <T,>(address: Address, abi: readonly unknown[], functionName: string, args: readonly unknown[] = []) =>
  pc.readContract({ address, abi, functionName, args } as never) as Promise<T>;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// RESUME_PLENUM skips steps 1-2 for a group that already ran them (their transactions are in the first run's log).
const resume = env.RESUME_PLENUM as Address | undefined;
// ------------------------------------------------------------------ 1. create, join, contribute
step("1. Create Rules Demo Club on the second factory; three members join and contribute");
const config = {
  adapters: [dep.tbillVault, dep.creditVault, dep.gold] as Address[],
  targetBps: [4500, 2000, 1500],
  bandBps: [500, 300, 300],
  minLiquidityBps: 2000,
  maxTradeBps: 1000,
  maxDailyTurnoverBps: 2500,
  navMaxAge: 600,
  cooldown: 60,
  maxMembers: 99,
  escalateQuorumBps: 4000,
  mandateChangeBps: 6666,
  timelock: 600,
  pauseQuorum: 2,
  votingPeriod: 3600,
  periodLength: 600,
  exitWindow: 180,
  earlyExitFeeBps: 200,
};
let plenum: Address | undefined = resume;
const createHash = resume
  ? undefined
  : await tx(A, "create Rules Demo Club", { address: dep.factory, abi: plenumFactoryAbi, functionName: "createPlenum", args: ["Rules Demo Club", 1, config, managerKey] });
for (const log of createHash ? (await pc.getTransactionReceipt({ hash: createHash })).logs : []) {
  try {
    const ev = decodeEventLog({ abi: plenumFactoryAbi, data: log.data, topics: log.topics });
    if (ev.eventName === "PlenumCreated") plenum = ev.args.plenum;
  } catch {}
}
if (!plenum) throw new Error("PlenumCreated not found");
const [mandate, governance, gateway] = await Promise.all([
  read<Address>(plenum, plenumAbi, "mandate"),
  read<Address>(plenum, plenumAbi, "governance"),
  read<Address>(plenum, plenumAbi, "gateway"),
]);
console.log(`  plenum ${plenum} · mandate ${mandate} · governance ${governance} · gateway ${gateway}`);

async function invite(invitee: Address, nonce: bigint) {
  const expiry = (await pc.getBlock()).timestamp + 86_400n;
  const signature = await A.walletClient.signTypedData({
    account: A.account,
    domain: { name: "Plenum", version: "1", chainId: 10143, verifyingContract: plenum! },
    types: { Invite: [{ name: "invitee", type: "address" }, { name: "nonce", type: "uint256" }, { name: "expiry", type: "uint64" }] },
    primaryType: "Invite",
    message: { invitee, nonce, expiry },
  });
  return encodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "uint64" }, { type: "bytes" }], [invitee, nonce, expiry, signature]);
}
async function reprice() {
  const total = await read<bigint>(mandate, mandateAbi, "holdingsTotal");
  await tx(W, "FALLBACK price (labelled demo writer)", { address: dep.navOracle, abi: navOracleAbi, functionName: "fallbackWrite", args: [plenum, total] });
}

const members: [string, Clients, bigint][] = [["A", A, 1n], ["B", B, 2n], ["C", C, 3n]];
if (!resume) {
for (const [name, c, nonce] of members) {
  await tx(c, `${name} joins`, { address: plenum, abi: plenumAbi, functionName: "join", args: [await invite(c.account.address, nonce), ZERO32] });
}
for (const [name, c] of members) {
  await tx(A, `mint 1,000 MOCK test dollars to ${name}`, { address: dep.asset, abi: mockUSDAbi, functionName: "mint", args: [c.account.address, 1_000n * USD] });
  await tx(c, `${name} approves`, { address: dep.asset, abi: erc20Abi, functionName: "approve", args: [plenum, 1_000n * USD] });
  if (name !== "A") await reprice();
  await tx(c, `${name} contributes 1,000`, { address: plenum, abi: plenumAbi, functionName: "contribute", args: [1_000n * USD] });
}
ok((await read<bigint>(plenum, plenumAbi, "memberCount")) === 3n, "three members, 3,000 contributed");

// ------------------------------------------------------------------ 2. early exit pays the breaking fee
step("2. B takes money out mid-period: pays the 2% breaking fee");
ok((await read<number>(mandate, mandateAbi, "exitFeeBps")) === 200, "exit fee right now: 2%");
await reprice();
const treasuryBefore = await read<bigint>(dep.asset, erc20Abi, "balanceOf", [dep.treasury]);
const bUnits = await read<bigint>(plenum, plenumAbi, "unitsOf", [B.account.address]);
const redeemHash = await tx(B, "B redeems half its units", { address: plenum, abi: plenumAbi, functionName: "redeem", args: [bUnits / 2n, B.account.address] });
let fee = 0n;
let toTreasury = 0n;
for (const log of (await pc.getTransactionReceipt({ hash: redeemHash })).logs) {
  try {
    const ev = decodeEventLog({ abi: plenumAbi, data: log.data, topics: log.topics });
    if (ev.eventName === "ExitFeeCharged") ({ fee, toTreasury } = ev.args as { fee: bigint; toTreasury: bigint });
  } catch {}
}
const treasuryGot = (await read<bigint>(dep.asset, erc20Abi, "balanceOf", [dep.treasury])) - treasuryBefore;
ok(fee > 0n && toTreasury * 4n <= fee + 1n && treasuryGot === toTreasury, `fee ${Number(fee) / 1e6} USD: ${Number(toTreasury) / 1e6} to the treasury, ${Number(fee - toTreasury) / 1e6} stays with the group`);
}

// ------------------------------------------------------------------ 3. rule change, minority exits free
step("3. Members pass new rules (2 of 3); C disagrees and leaves free during the delay");
const next = { ...config, maxTradeBps: 800, earlyExitFeeBps: 100 };
// RULE_PROPOSAL_ID resumes a rule change that was already proposed and approved.
let ruleId = env.RULE_PROPOSAL_ID ? BigInt(env.RULE_PROPOSAL_ID) : 0n;
if (!ruleId) {
  await tx(A, "A proposes new rules (one trade at most 8%, fee 1%)", { address: governance, abi: governanceAbi, functionName: "proposeMandateChange", args: [next, ZERO32] });
  ruleId = await read<bigint>(governance, governanceAbi, "proposalCount");
  await tx(A, "A approves", { address: governance, abi: governanceAbi, functionName: "approve", args: [ruleId] });
  ok(!(await read<boolean>(governance, governanceAbi, "quorumReached", [ruleId])), "1 of 3 is not enough for a rule change");
  await tx(B, "B approves", { address: governance, abi: governanceAbi, functionName: "approve", args: [ruleId] });
}
ok(await read<boolean>(governance, governanceAbi, "quorumReached", [ruleId]), "2 of 3 is a two-thirds supermajority");
const executed = (await read<readonly [string, string, Address, bigint, number, boolean]>(governance, governanceAbi, "proposals", [ruleId]))[5];
if (!executed) await tx(B, "execute: rules queued behind the delay", { address: governance, abi: governanceAbi, functionName: "executeProposal", args: [ruleId] });
const [, eta] = await read<readonly [unknown, bigint]>(mandate, mandateAbi, "pendingChange");
ok(eta > 0n, `new rules apply at ${new Date(Number(eta) * 1000).toISOString()}`);
ok((await read<number>(mandate, mandateAbi, "exitFeeBps")) === 0, "exits are free while the change is pending");
await reprice();
const leaveHash = await tx(C, "C leaves (withdraws everything, gives up membership)", { address: plenum, abi: plenumAbi, functionName: "leave", args: [C.account.address] });
const leaveLogs = (await pc.getTransactionReceipt({ hash: leaveHash })).logs.flatMap((l) => {
  try {
    return [decodeEventLog({ abi: plenumAbi, data: l.data, topics: l.topics }).eventName];
  } catch {
    return [];
  }
});
ok(leaveLogs.includes("MemberLeft") && !leaveLogs.includes("ExitFeeCharged"), "C left with no fee");
ok((await read<bigint>(plenum, plenumAbi, "memberCount")) === 2n, "two members remain");

// ------------------------------------------------------------------ 4. replace the manager and back
step("4. Members replace this group's AI manager with another key (other groups are unaffected)");
for (const [label, to] of [["replace the manager with another key", W.account.address]] as const) {
  await tx(A, `A proposes: ${label}`, { address: governance, abi: governanceAbi, functionName: "proposeManagerReplacement", args: [to, ZERO32] });
  const id = await read<bigint>(governance, governanceAbi, "proposalCount");
  await tx(A, "A approves", { address: governance, abi: governanceAbi, functionName: "approve", args: [id] });
  await tx(B, "B approves", { address: governance, abi: governanceAbi, functionName: "approve", args: [id] });
  await tx(A, "execute", { address: governance, abi: governanceAbi, functionName: "executeProposal", args: [id] });
  ok((await read<Address>(gateway, managerGatewayAbi, "manager")).toLowerCase() === to.toLowerCase(), `manager is now ${to}`);
}

// ------------------------------------------------------------------ 5. apply after the delay
step("5. After the delay, anyone applies the new rules");
for (;;) {
  const now = (await pc.getBlock()).timestamp;
  if (now >= eta) break;
  console.log(`  waiting ${Number(eta - now)} s for the delay to pass…`);
  await sleep(Math.min(60, Number(eta - now) + 2) * 1000);
}
await tx(B, "B applies the new rules", { address: mandate, abi: mandateAbi, functionName: "applyChange", args: [] });
const cfg = await read<{ maxTradeBps: number; earlyExitFeeBps: number }>(mandate, mandateAbi, "config");
ok(cfg.maxTradeBps === 800 && cfg.earlyExitFeeBps === 100, "rules in force: one trade at most 8%, fee 1%");

console.log(`\n${evidence.length} transactions; record them in docs/deployments.md.`);
