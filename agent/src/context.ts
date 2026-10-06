import type { Address } from "viem";
import { plenumAbi } from "@plenum/abis";
import type { Clients } from "./chain.ts";
import type { Deployment } from "./config.ts";
import type { ChatModel } from "./model.ts";
import type { MemberContextSource, MemoStore } from "./stores.ts";

/** Everything one run of the manager needs. Built once at startup (or per test). */
export interface AgentContext {
  clients: Clients;
  model: ChatModel;
  memoStore: MemoStore;
  memberContext: MemberContextSource;
  plenum: Address;
  mandate: Address;
  gateway: Address;
  governance: Address;
  navOracle: Address;
  consentRegistry: Address;
  creditVault: Address;
  /** Human names for allowlisted adapters (tbill / credit / gold), used in observations. */
  adapterNames: Record<string, string>;
  /** Untrusted outside text (news, notes) shown to the model inside DATA blocks. */
  external: { label: string; text: string }[];
  log: (msg: string, data?: unknown) => void;
}

export async function buildContext(
  base: Omit<AgentContext, "mandate" | "gateway" | "governance" | "navOracle" | "consentRegistry" | "creditVault" | "adapterNames">,
  deployment: Deployment,
): Promise<AgentContext> {
  const read = (functionName: "mandate" | "gateway" | "governance" | "navOracle") =>
    base.clients.publicClient.readContract({ address: base.plenum, abi: plenumAbi, functionName }) as Promise<Address>;
  const [mandate, gateway, governance, navOracle] = await Promise.all([
    read("mandate"),
    read("gateway"),
    read("governance"),
    read("navOracle"),
  ]);
  return {
    ...base,
    mandate,
    gateway,
    governance,
    navOracle,
    consentRegistry: deployment.consentRegistry as Address,
    creditVault: deployment.creditVault as Address,
    adapterNames: {
      [deployment.tbillVault.toLowerCase()]: "tbill",
      [deployment.creditVault.toLowerCase()]: "credit",
      [deployment.gold.toLowerCase()]: "gold",
    },
  };
}
