/**
 * @plenum/sdk — put any AI agent behind a member-written mandate on Monad.
 *
 * A Plenum group gives its manager (any agent, any model) a scoped operator key that can only call
 * `ManagerGateway`: `executeInBand` for moves inside the rules, `escalate` for everything else. Every write commits
 * keccak256 of the agent's written reasoning and its model id. This package is the thin client for that loop:
 *
 *   simulate → (in band? executeInBandRequest : escalateRequest) → verifyAction
 *
 * It holds no keys and sends nothing itself: request builders return viem `writeContract` parameters.
 */
import {
  decodeEventLog,
  encodeAbiParameters,
  hexToString,
  keccak256,
  stringToHex,
  toHex,
  type Address,
  type Hash,
  type Hex,
  type PublicClient,
} from "viem";
import { managerGatewayAbi, mandateAbi, mandateV1Abi, OPS, plenumAbi, plenumFactoryAbi, REASONS, type OpName, type Reason } from "@plenum/abis";
import { canonicalJson } from "@plenum/crypto";

export { OPS, REASONS, type OpName, type Reason };

/** One step of a plan. `assets` is in settlement-asset base units (6 decimals); for `Claim` it is the requestId. */
export interface Action {
  adapter: Address;
  op: OpName;
  assets: bigint;
}

/** What the contract does with each refusal (SPEC A6): act alone, ask members, wait, or give up. */
export type Disposition = "inband" | "escalate" | "wait" | "drop";

export function disposition(reason: Reason): Disposition {
  switch (reason) {
    case "OK":
      return "inband";
    case "WEIGHT_OUT_OF_BAND":
    case "TRADE_TOO_LARGE":
    case "LIQUIDITY_FLOOR":
      return "escalate";
    case "COOLDOWN":
    case "TURNOVER_CAP":
      return "wait";
    default:
      return "drop"; // ADAPTER_NOT_ALLOWED, NAV_STALE, PAUSED, MEMBER_CAP
  }
}

/** The tuple shape `ManagerGateway` takes. Addresses are lowercased so a wrong EIP-55 checksum can't break a call. */
export function toContractActions(actions: readonly Action[]) {
  return actions.map((a) => ({ adapter: a.adapter.toLowerCase() as Address, op: OPS.indexOf(a.op), assets: a.assets }));
}

const ACTIONS_TYPE = [
  {
    type: "tuple[]",
    components: [
      { name: "adapter", type: "address" },
      { name: "op", type: "uint8" },
      { name: "assets", type: "uint256" },
    ],
  },
] as const;

/** `actionsHash` exactly as `ManagerGateway` emits it: keccak256(abi.encode(actions)). */
export function actionsHash(actions: readonly Action[]): Hash {
  return keccak256(encodeAbiParameters(ACTIONS_TYPE, [toContractActions(actions)]));
}

/** `rationaleHash` for a memo: keccak256 of its canonical JSON (sorted keys, no whitespace). */
export function memoHash(memo: unknown): Hash {
  return keccak256(toHex(canonicalJson(memo)));
}

/** Model id as committed onchain: UTF-8, at most 32 bytes, right-padded. */
export function modelIdBytes(modelId: string): Hex {
  return stringToHex(modelId.slice(0, 32), { size: 32 });
}

/** Dry-run through `ManagerGateway.simulate` (an eth_call: no key, no gas). Same checks, same order as a write. */
export async function simulate(client: PublicClient, gateway: Address, actions: readonly Action[]): Promise<Reason> {
  const code = await client.readContract({ address: gateway, abi: managerGatewayAbi, functionName: "simulate", args: [toContractActions(actions)] });
  return REASONS[code] ?? "ADAPTER_NOT_ALLOWED";
}

/** `writeContract` parameters for an in-band move. Set an explicit gas limit: Monad bills the declared limit. */
export function executeInBandRequest(gateway: Address, actions: readonly Action[], memo: unknown, modelId: string) {
  return {
    address: gateway,
    abi: managerGatewayAbi,
    functionName: "executeInBand",
    args: [toContractActions(actions), memoHash(memo), modelIdBytes(modelId)],
  } as const;
}

/** `writeContract` parameters to send a move outside the agent's authority to the members as a proposal. */
export function escalateRequest(gateway: Address, actions: readonly Action[], memo: unknown, modelId: string) {
  return {
    address: gateway,
    abi: managerGatewayAbi,
    functionName: "escalate",
    args: [toContractActions(actions), memoHash(memo), modelIdBytes(modelId)],
  } as const;
}

/** A manager action as read back from the chain, with proof of where it came from. */
export interface VerifiedAction {
  txHash: Hash;
  gateway: Address;
  plenum: Address;
  groupName: string;
  manager: Address;
  actionsHash: Hash;
  rationaleHash: Hash;
  modelId: string;
  reason: Reason;
  block: bigint;
  timestamp: number;
  /** The gateway is an EIP-1167 clone of the factory's ManagerGateway implementation. */
  factoryClone: boolean;
  /** Its group names this gateway as its manager gateway. */
  linked: boolean;
}

const CLONE = /^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3$/i;

/**
 * Decodes the `ManagerAction` in `txHash` and proves its origin from chain state alone (no indexer, no server):
 * the emitting gateway's bytecode must be a clone of `gatewayImpl()` of one of `factories` (pass every Plenum factory
 * generation), and its plenum must point back to it.
 */
export async function verifyAction(client: PublicClient, factories: Address | readonly Address[], txHash: Hash): Promise<VerifiedAction> {
  const list = typeof factories === "string" ? [factories] : factories;
  const receipt = await client.getTransactionReceipt({ hash: txHash });
  for (const log of receipt.logs) {
    let ev;
    try {
      ev = decodeEventLog({ abi: managerGatewayAbi, data: log.data, topics: log.topics });
    } catch {
      continue;
    }
    if (ev.eventName !== "ManagerAction") continue;
    const a = ev.args as { actionsHash: Hash; rationaleHash: Hash; modelId: Hex; reason: number };
    const gateway = log.address;
    const [plenum, manager, code, impls, block] = await Promise.all([
      client.readContract({ address: gateway, abi: managerGatewayAbi, functionName: "plenum" }),
      client.readContract({ address: gateway, abi: managerGatewayAbi, functionName: "manager" }),
      client.getCode({ address: gateway }),
      Promise.all(list.map((f) => client.readContract({ address: f, abi: plenumFactoryAbi, functionName: "gatewayImpl" }))),
      client.getBlock({ blockNumber: receipt.blockNumber }),
    ]);
    const [groupName, backLink] = await Promise.all([
      client.readContract({ address: plenum, abi: plenumAbi, functionName: "name" }),
      client.readContract({ address: plenum, abi: plenumAbi, functionName: "gateway" }),
    ]);
    const cloneOf = code?.match(CLONE)?.[1];
    return {
      txHash,
      gateway,
      plenum,
      groupName,
      manager,
      actionsHash: a.actionsHash,
      rationaleHash: a.rationaleHash,
      modelId: decodeModelId(a.modelId),
      reason: REASONS[a.reason] ?? "ADAPTER_NOT_ALLOWED",
      block: receipt.blockNumber,
      timestamp: Number(block.timestamp),
      factoryClone: !!cloneOf && impls.some((impl) => `0x${cloneOf}`.toLowerCase() === impl.toLowerCase()),
      linked: backLink.toLowerCase() === gateway.toLowerCase(),
    };
  }
  throw new Error("This transaction has no ManagerAction event.");
}

/** Checks a memo (as published by the manager) against an action: reasoning hash, and its actions vs the onchain ones. */
export function checkMemo(memo: { actions?: { adapter: string; op: string; assets: string }[] }, action: Pick<VerifiedAction, "rationaleHash" | "actionsHash">) {
  const reasoning = memoHash(memo) === action.rationaleHash;
  let actions: boolean | null = null;
  if (memo.actions) {
    try {
      actions =
        actionsHash(memo.actions.map((x) => ({ adapter: x.adapter as Address, op: x.op as OpName, assets: BigInt(x.assets) }))) === action.actionsHash;
    } catch {
      actions = false;
    }
  }
  return { reasoning, actions };
}

function decodeModelId(hex: Hex): string {
  return hexToString(hex, { size: 32 }).replace(/\0+$/, "");
}

/** A group's rules. Groups from the first factory (before SPEC A26) have no investment period: those fields read 0. */
export type MandateConfig = {
  adapters: readonly Address[];
  targetBps: readonly number[];
  bandBps: readonly number[];
  minLiquidityBps: number;
  maxTradeBps: number;
  maxDailyTurnoverBps: number;
  navMaxAge: number;
  cooldown: number;
  maxMembers: number;
  escalateQuorumBps: number;
  mandateChangeBps: number;
  timelock: number;
  pauseQuorum: number;
  votingPeriod: number;
  periodLength: number;
  exitWindow: number;
  earlyExitFeeBps: number;
};

/**
 * Reads `Mandate.config()` from either generation. `v2` is false for groups created by the first factory, which
 * also lack rule changes, periods and the breaking fee.
 */
export async function readMandateConfig(client: PublicClient, mandate: Address): Promise<{ config: MandateConfig; v2: boolean }> {
  try {
    const c = await client.readContract({ address: mandate, abi: mandateAbi, functionName: "config" });
    return { config: c as MandateConfig, v2: true };
  } catch {
    const c = await client.readContract({ address: mandate, abi: mandateV1Abi, functionName: "config" });
    return { config: { ...c, periodLength: 0, exitWindow: 0, earlyExitFeeBps: 0 } as MandateConfig, v2: false };
  }
}
