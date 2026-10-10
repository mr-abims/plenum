/**
 * Gives the AI manager an ERC-8004 identity on Monad testnet's canonical IdentityRegistry (SPEC A24).
 *
 * The operator key registers itself, so the manager owns its identity and the members who rate it are never its
 * owner (the ReputationRegistry refuses self-feedback). Idempotent: if contracts/deployments/10143.json already has
 * managerAgentId, it only checks the onchain record.
 *
 * Writes managerAgentId into contracts/deployments/10143.json and the agent card (app/public/agents/plenum-manager.json),
 * which is served at AGENT_CARD_URL and is the agent's tokenURI.
 *
 * Env (from ../.env): MONAD_TESTNET_RPC, MANAGER_OPERATOR_KEY. AGENT_CARD_URL defaults to the hosted app.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseEventLogs, type Hex } from "viem";
import { ERC8004, erc8004IdentityRegistryAbi } from "@plenum/abis";
import { makeClients, writeWithGas } from "../src/chain.ts";

const env = process.env;
const CARD_URL = env.AGENT_CARD_URL ?? "https://plenumx.vercel.app/agents/plenum-manager.json";
const DEPLOYMENT = join(import.meta.dirname, "../../contracts/deployments/10143.json");
const CARD = join(import.meta.dirname, "../../app/public/agents/plenum-manager.json");
const registry = ERC8004.identityRegistry;

const clients = makeClients(env.MONAD_TESTNET_RPC!, 10143, env.MANAGER_OPERATOR_KEY as Hex);
// Read the raw JSON: the agent's DeploymentSchema would drop keys it doesn't declare.
const deployment = JSON.parse(readFileSync(DEPLOYMENT, "utf8")) as Record<string, unknown>;

let agentId: bigint;
if (typeof deployment.managerAgentId === "number") {
  agentId = BigInt(deployment.managerAgentId);
  console.log(`already registered as agent ${agentId}`);
} else {
  const { hash, status } = await writeWithGas(clients, {
    address: registry,
    abi: erc8004IdentityRegistryAbi,
    functionName: "register",
    args: [CARD_URL],
  });
  if (status !== "success") throw new Error(`register reverted: ${hash}`);
  const receipt = await clients.publicClient.getTransactionReceipt({ hash });
  const [registered] = parseEventLogs({ abi: erc8004IdentityRegistryAbi, eventName: "Registered", logs: receipt.logs });
  agentId = registered!.args.agentId;
  deployment.managerAgentId = Number(agentId);
  deployment.managerAgentTx = hash;
  writeFileSync(DEPLOYMENT, JSON.stringify(deployment, null, 2) + "\n");
  console.log(`registered agent ${agentId}: https://testnet.monadvision.com/tx/${hash}`);
}

const card = JSON.parse(readFileSync(CARD, "utf8"));
card.registrations = [{ agentId: Number(agentId), agentRegistry: `eip155:10143:${registry}` }];
writeFileSync(CARD, JSON.stringify(card, null, 2) + "\n");

const [owner, uri] = await Promise.all([
  clients.publicClient.readContract({ address: registry, abi: erc8004IdentityRegistryAbi, functionName: "ownerOf", args: [agentId] }),
  clients.publicClient.readContract({ address: registry, abi: erc8004IdentityRegistryAbi, functionName: "tokenURI", args: [agentId] }),
]);
console.log(`${owner.toLowerCase() === clients.account.address.toLowerCase() ? "PASS" : "FAIL"}  owned by the operator ${owner}`);
console.log(`${uri === CARD_URL ? "PASS" : "FAIL"}  tokenURI ${uri}`);
