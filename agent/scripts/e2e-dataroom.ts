/**
 * End-to-end data-room check (SPEC §10): member joins with a passkey-derived key, saves an encrypted risk profile,
 * grants the manager 24 h consent onchain; the agent reads it via get_member_context, executes, and publishes an
 * encrypted memo; the member decrypts the memo and matches it to the onchain rationale hash.
 *
 * Needs: anvil on :8545 with Deploy + Rehearsal, and the app serving /api/blobs (APP_URL, default :3100).
 */
import { createHash } from "node:crypto";
import { createPublicClient, createWalletClient, encodeAbiParameters, http, keccak256, toHex, hexToBytes, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import { consentRegistryAbi, plenumAbi } from "@plenum/abis";
import { attest, LOCAL_ATTESTER_KEY } from "../redteam/attest.ts";
import {
  addReader, blobMessage, canonicalJson, decryptDocument, deriveEncryptionKey, encryptDocument, memoDocId, publicKeyToBytes32, riskDocId, type Envelope,
} from "@plenum/crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { makeClients } from "../src/chain.ts";
import { loadDeployment } from "../src/config.ts";
import { buildContext } from "../src/context.ts";
import { runOnce } from "../src/loop.ts";
import { BlobMemberContext, BlobMemoStore } from "../src/stores.ts";
import { ScriptedModel, call, plan, say } from "../redteam/harness.ts";

const RPC = "http://127.0.0.1:8545";
const API = `${process.env.APP_URL ?? "http://localhost:3100"}/api/blobs`;
const DEPLOYER = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const MANAGER = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as Hex;
const FALLBACK = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex;
const MEMBER = "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" as Hex;

const pc = createPublicClient({ chain: foundry, transport: http(RPC) });
const wallet = (k: Hex) => createWalletClient({ chain: foundry, transport: http(RPC), account: privateKeyToAccount(k) });
const wait = (hash: Hex) => pc.waitForTransactionReceipt({ hash });
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${what}`);
  if (!ok) process.exitCode = 1;
};

const dep = loadDeployment(31337);
const raw = JSON.parse(readFileSync(join(import.meta.dirname, "../../contracts/deployments/31337.json"), "utf8"));
const plenum = raw.rehearsalPlenum as Address;
const member = privateKeyToAccount(MEMBER);
const memberKeys = deriveEncryptionKey(new Uint8Array(32).fill(0x42)); // stands in for the passkey PRF output
const managerKeys = deriveEncryptionKey(hexToBytes(keccak256(toHex("manager data-room seed (local test)"))));

async function putBlob(key: Hex, id: string, env: Envelope) {
  const account = privateKeyToAccount(key);
  const body = JSON.stringify(env);
  const at = Math.floor(Date.now() / 1000);
  const signature = await account.signMessage({ message: blobMessage(id, "PUT", createHash("sha256").update(body).digest("hex"), at) });
  const res = await fetch(`${API}/${id}`, { method: "PUT", headers: { "x-plenum-signer": account.address, "x-plenum-signature": signature, "x-plenum-at": String(at) }, body });
  if (!res.ok) throw new Error(`PUT ${id}: ${res.status} ${await res.text()}`);
}

// 1. Member is verified by a signed Cleanverse attestation (MOCK attester) and joins with an invite and their data-room public key.
await attest({ rpcUrl: RPC, chain: foundry, registrar: raw.attestationRegistrar, attesterKey: LOCAL_ATTESTER_KEY, relayerKey: DEPLOYER, subject: member.address, country: "0x4e47" });
const expiry = (await pc.getBlock()).timestamp + 86_400n;
const sig = await wallet(DEPLOYER).signTypedData({
  domain: { name: "Plenum", version: "1", chainId: 31337, verifyingContract: plenum },
  types: { Invite: [{ name: "invitee", type: "address" }, { name: "nonce", type: "uint256" }, { name: "expiry", type: "uint64" }] },
  primaryType: "Invite",
  message: { invitee: member.address, nonce: 4242n, expiry },
});
const invite = encodeAbiParameters([{ type: "address" }, { type: "uint256" }, { type: "uint64" }, { type: "bytes" }], [member.address, 4242n, expiry, sig]);
await wait(await wallet(MEMBER).writeContract({ address: plenum, abi: plenumAbi, functionName: "join", args: [invite, publicKeyToBytes32(memberKeys.publicKey)] }));
const members = await pc.readContract({ address: plenum, abi: plenumAbi, functionName: "members" });
check(members.map((m) => m.toLowerCase()).includes(member.address.toLowerCase()), "member joined; listed by Plenum.members()");

// 2. Member saves an encrypted risk profile and shares it with the manager for 24 h (wrapped key + onchain grant).
const docId = riskDocId(plenum, member.address);
const doc = await encryptDocument(docId, new TextEncoder().encode("Tunde: moderate risk, may need $2,000 back in March."), [memberKeys.publicKey]);
await putBlob(MEMBER, docId, await addReader(doc, memberKeys, managerKeys.publicKey));
const grantTx = await wallet(MEMBER).writeContract({
  address: dep.consentRegistry as Address, abi: consentRegistryAbi, functionName: "grant",
  args: [privateKeyToAccount(MANAGER).address, keccak256(toHex(docId)), (await pc.getBlock()).timestamp + 86_400n],
});
await wait(grantTx);
const grantIds = await pc.readContract({ address: dep.consentRegistry as Address, abi: consentRegistryAbi, functionName: "grantIdsOf", args: [member.address] });
const grantId = grantIds.at(-1)!.toString();

// 3. The agent runs: reads the member's context under consent, executes in-band, publishes an encrypted memo.
const t = await pc.getBlock();
await wait(await wallet(FALLBACK).writeContract({ address: dep.navOracle as Address, abi: [{ type: "function", name: "fallbackWrite", stateMutability: "nonpayable", inputs: [{ name: "p", type: "address" }, { name: "n", type: "uint256" }], outputs: [] }], functionName: "fallbackWrite", args: [plenum, 10_000_000_000n] }).catch(async () => t.hash));
const clients = makeClients(RPC, 31337, MANAGER);
const model = new ScriptedModel([
  call("get_member_context", { member: member.address, grantId }),
  call("execute_in_band", { plan: plan([{ adapter: dep.tbillVault, op: "Withdraw", assets: 200_000_000n }]) }),
]);
const ctx = await buildContext(
  { clients, model, plenum, external: [], log: () => {}, memoStore: new BlobMemoStore(clients, plenum, API, managerKeys), memberContext: new BlobMemberContext(plenum, API, managerKeys) },
  dep,
);
const observedConsent = (await import("../src/observe.ts")).observe(ctx).then((o) => o.consentedMembers);
check((await observedConsent).some((c) => c.member.toLowerCase() === member.address.toLowerCase() && c.grantId === grantId), "observation lists the member's active consent grant");
const res = await runOnce(ctx);
const context = JSON.stringify(model.seen.at(-1)?.find((m) => m.role === "tool")?.content ?? "");
check(context.includes("may need $2,000 back"), "agent decrypted the consented risk profile (inside a DATA block)");
check(res.status === "executed", `agent executed in-band (${res.status})`);
if (res.status !== "executed") process.exit(1);

// 4. The member fetches the memo, decrypts it with their own key, and matches it to the onchain hash.
const memoRes = await fetch(`${API}/${memoDocId(res.memoHash, clients.account.address)}`);
check(memoRes.ok, "memo published to the data room");
const memo = JSON.parse(new TextDecoder().decode(await decryptDocument((await memoRes.json()) as Envelope, memberKeys)));
check(keccak256(toHex(canonicalJson(memo))) === res.memoHash, "member's decrypted memo matches the onchain rationale hash");
const stranger = deriveEncryptionKey(new Uint8Array(32).fill(0x99));
const memoEnv = (await (await fetch(`${API}/${memoDocId(res.memoHash, clients.account.address)}`)).json()) as Envelope;
check(await decryptDocument(memoEnv, stranger).then(() => false, () => true), "a non-member cannot decrypt the memo");
