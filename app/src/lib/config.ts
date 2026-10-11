import { foundry, monadTestnet } from "viem/chains";
import type { Address } from "viem";
import deployment from "./deployment.json";

/** Shared contract addresses from contracts/deployments/<chainId>.json (copied by scripts/deployment.mjs). */
export const DEPLOYMENT = deployment as unknown as {
  chainId: number;
  startBlock: number;
  asset: Address;
  navOracle: Address;
  consentRegistry: Address;
  tbillVault: Address;
  creditVault: Address;
  gold: Address;
  factory: Address;
  /** Demo group used by the landing page for live reads (Rehearsal.s.sol). */
  rehearsalPlenum?: Address;
  /** Long-lived group the landing page's rule console asks live (Showcase.s.sol). */
  showcasePlenum?: Address;
  /** The AI manager's ERC-8004 agent id in the canonical IdentityRegistry (agent/scripts/register-agent.ts). */
  managerAgentId?: number;
};

export const CHAIN = DEPLOYMENT.chainId === monadTestnet.id ? monadTestnet : foundry;
export const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? (CHAIN.id === monadTestnet.id ? "https://testnet-rpc.monad.xyz" : "http://127.0.0.1:8545");
export const EXPLORER = CHAIN.id === monadTestnet.id ? "https://testnet.monadvision.com" : undefined;
/** Envio GraphQL endpoint; when unset the app reads events directly from the chain. */
export const INDEXER_URL = process.env.NEXT_PUBLIC_INDEXER_URL;
/** The AI manager's operator key (address) and data-room public key, published by the operator. */
export const MANAGER_ADDRESS = process.env.NEXT_PUBLIC_MANAGER_ADDRESS as Address | undefined;
export const MANAGER_ENC_PUBKEY = process.env.NEXT_PUBLIC_MANAGER_ENC_PUBKEY as `0x${string}` | undefined;

export const ADAPTER_NAMES: Record<string, string> = {
  [DEPLOYMENT.tbillVault.toLowerCase()]: "T-bill fund",
  [DEPLOYMENT.creditVault.toLowerCase()]: "Private credit",
  [DEPLOYMENT.gold.toLowerCase()]: "Gold",
};
export const adapterName = (a: string) => ADAPTER_NAMES[a.toLowerCase()] ?? `${a.slice(0, 6)}…${a.slice(-4)}`;
