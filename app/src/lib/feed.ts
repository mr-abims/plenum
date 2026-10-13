import { decodeEventLog, type Address, type Hash } from "viem";
import { governanceAbi, managerGatewayAbi, mandateAbi, navOracleAbi, plenumAbi, REASONS, OPS } from "@plenum/abis";
import { publicClient } from "./chain";
import { adapterName, CHAIN, DEPLOYMENT, INDEXER_URL } from "./config";
import type { PlenumState } from "./plenum";

export type FeedKind =
  | "CONTRIBUTED" | "REDEEMED" | "JOINED" | "LEFT" | "EXIT_FEE" | "MANAGER_ACTION" | "ESCALATED" | "APPROVED"
  | "EXECUTED" | "PAUSED" | "UNPAUSED" | "NAV" | "ADAPTER" | "RULE_PROPOSED" | "RULE_SCHEDULED" | "RULE_APPLIED"
  | "MANAGER_PROPOSED" | "MANAGER_REPLACED";

export interface FeedItem {
  id: string;
  kind: FeedKind;
  actor: string;
  amount?: bigint;
  detail: string;
  txHash: Hash;
  timestamp: number;
  /** Manager actions only. */
  rationaleHash?: string;
  modelId?: string;
}

/** Activity for one plenum, newest first. Envio when configured, otherwise straight from chain logs. */
export async function loadFeed(p: PlenumState): Promise<FeedItem[]> {
  if (INDEXER_URL) {
    try {
      return await fromIndexer(p.address);
    } catch {
      // fall through to chain reads
    }
  }
  return fromChain(p);
}

async function fromIndexer(plenum: Address): Promise<FeedItem[]> {
  const query = `query Feed($p: String!) {
    Activity(where: {plenum_id: {_eq: $p}}, order_by: {timestamp: desc}, limit: 200) {
      id kind actor amount detail txHash timestamp
    }
    ManagerAction(where: {plenum_id: {_eq: $p}}) { txHash rationaleHash modelId }
  }`;
  const res = await fetch(INDEXER_URL!, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables: { p: plenum.toLowerCase() } }),
  });
  const body = (await res.json()) as {
    data?: {
      Activity: { id: string; kind: FeedKind; actor: string; amount: string | null; detail: string; txHash: Hash; timestamp: string }[];
      ManagerAction: { txHash: string; rationaleHash: string; modelId: string }[];
    };
  };
  if (!body.data) throw new Error("indexer unavailable");
  const provenance = new Map(body.data.ManagerAction.map((m) => [m.txHash, m]));
  return body.data.Activity.map((a) => ({
    ...a,
    amount: a.amount === null ? undefined : BigInt(a.amount),
    timestamp: Number(a.timestamp),
    rationaleHash: provenance.get(a.txHash)?.rationaleHash,
    modelId: provenance.get(a.txHash)?.modelId,
  }));
}

/** Monad public RPCs cap eth_getLogs at 100 blocks; without an indexer only recent history is shown on testnet. */
const LOG_CHUNK = 100n;
const TESTNET_LOOKBACK = 3_000n; // ~15 minutes of 300 ms blocks

async function fromChain(p: PlenumState): Promise<FeedItem[]> {
  const latest = await publicClient.getBlockNumber();
  const start = BigInt(DEPLOYMENT.startBlock);
  const from = CHAIN.id === 31337 ? start : latest > start + TESTNET_LOOKBACK ? latest - TESTNET_LOOKBACK : start;
  const address = [p.address, p.gateway, p.governance, p.mandate, DEPLOYMENT.navOracle];
  const raw = [];
  for (let lo = from; lo <= latest; lo += CHAIN.id === 31337 ? latest + 1n : LOG_CHUNK) {
    const hi = CHAIN.id === 31337 ? latest : lo + LOG_CHUNK - 1n > latest ? latest : lo + LOG_CHUNK - 1n;
    raw.push(...(await publicClient.getLogs({ address, fromBlock: lo, toBlock: hi })));
  }
  const abi = [...plenumAbi, ...managerGatewayAbi, ...governanceAbi, ...mandateAbi, ...navOracleAbi];
  const all = raw.flatMap((l) => {
    try {
      const ev = decodeEventLog({ abi, data: l.data, topics: l.topics });
      if (ev.eventName === "NavReported" && (ev.args as { plenum: string }).plenum.toLowerCase() !== p.address.toLowerCase()) return [];
      return [{ ...l, eventName: ev.eventName, args: ev.args }];
    } catch {
      return [];
    }
  });
  const blocks = new Map<bigint, number>();
  await Promise.all(
    [...new Set(all.map((l) => l.blockNumber!))].map(async (n) => {
      blocks.set(n, Number((await publicClient.getBlock({ blockNumber: n })).timestamp));
    }),
  );
  const items: FeedItem[] = [];
  for (const log of all) {
    const base = { id: `${log.transactionHash}-${log.logIndex}`, txHash: log.transactionHash!, timestamp: blocks.get(log.blockNumber!) ?? 0 };
    const a = (log as unknown as { args: Record<string, never> }).args as Record<string, any>;
    switch (log.eventName) {
      case "MemberJoined": items.push({ ...base, kind: "JOINED", actor: a.member, detail: "joined" }); break;
      case "Contributed": items.push({ ...base, kind: "CONTRIBUTED", actor: a.member, amount: a.assets, detail: "" }); break;
      case "Redeemed": items.push({ ...base, kind: "REDEEMED", actor: a.member, amount: a.assets, detail: `paid to ${a.to}` }); break;
      case "ActionExecuted":
        items.push({ ...base, kind: "ADAPTER", actor: a.adapter, amount: a.assets, detail: `${OPS[a.op]} · ${adapterName(a.adapter)}` });
        break;
      case "ManagerAction":
        items.push({ ...base, kind: "MANAGER_ACTION", actor: p.manager, detail: REASONS[a.reason] ?? "", rationaleHash: a.rationaleHash, modelId: a.modelId });
        break;
      case "Escalated": items.push({ ...base, kind: "ESCALATED", actor: p.manager, detail: `proposal ${a.proposalId}` }); break;
      case "Approved": items.push({ ...base, kind: "APPROVED", actor: a.member, detail: `proposal ${a.proposalId}` }); break;
      case "ProposalExecuted": items.push({ ...base, kind: "EXECUTED", actor: p.governance, detail: `proposal ${a.proposalId}` }); break;
      case "MemberLeft": items.push({ ...base, kind: "LEFT", actor: a.member, detail: "left" }); break;
      case "ExitFeeCharged":
        items.push({ ...base, kind: "EXIT_FEE", actor: a.member, amount: a.fee, detail: `toGroup=${a.fee - a.toTreasury} toTreasury=${a.toTreasury}` });
        break;
      case "MandateChangeProposed": items.push({ ...base, kind: "RULE_PROPOSED", actor: p.governance, detail: `proposal ${a.proposalId}` }); break;
      case "ManagerReplacementProposed": items.push({ ...base, kind: "MANAGER_PROPOSED", actor: a.newManager, detail: `proposal ${a.proposalId}` }); break;
      case "ManagerReplaced": items.push({ ...base, kind: "MANAGER_REPLACED", actor: a.newManager, detail: `was ${a.oldManager}` }); break;
      case "MandateChangeScheduled": items.push({ ...base, kind: "RULE_SCHEDULED", actor: p.mandate, detail: `applies at ${a.eta}` }); break;
      case "MandateChangeApplied": items.push({ ...base, kind: "RULE_APPLIED", actor: p.mandate, detail: a.configHash }); break;
      case "Paused": items.push({ ...base, kind: "PAUSED", actor: a.by, detail: "manager paused" }); break;
      case "Unpaused": items.push({ ...base, kind: "UNPAUSED", actor: a.by, detail: "manager unpaused" }); break;
      case "NavReported": items.push({ ...base, kind: "NAV", actor: DEPLOYMENT.navOracle, amount: a.nav, detail: a.source === 1 ? "FALLBACK" : "CRE" }); break;
    }
  }
  return items.sort((x, y) => y.timestamp - x.timestamp || (y.id > x.id ? 1 : -1));
}

export interface MemberRow {
  address: Address;
  encPubKey: `0x${string}`;
}

/** Members and their data-room keys from contract state (SPEC A20), no log scans. */
export async function loadMembers(p: PlenumState): Promise<MemberRow[]> {
  const members = (await publicClient.readContract({ address: p.address, abi: plenumAbi, functionName: "members" })) as Address[];
  return Promise.all(
    members.map(async (address) => ({
      address,
      encPubKey: (await publicClient.readContract({ address: p.address, abi: plenumAbi, functionName: "encPubKeyOf", args: [address] })) as `0x${string}`,
    })),
  );
}

export interface MyGroup {
  address: Address;
  name: string;
  memberCount: number;
  /** A personal portfolio: a plenum of one (maxMembers = 1, SPEC A23). */
  personal: boolean;
}

/**
 * The groups an account belongs to, from the Envio indexer. Nothing about membership is stored on the device, so this
 * list rebuilds from the passkey alone on any browser (the Mera stateless test).
 */
export async function loadMyGroups(member: Address): Promise<MyGroup[]> {
  if (!INDEXER_URL) return [];
  type Body = { data?: { Member: { plenum: { id: Address; name: string; memberCount: number; mandate: Address } }[] } };
  const ask = async (where: string) => {
    const query = `query Mine($m: String!) { Member(where: {${where}}) { plenum { id name memberCount mandate } } }`;
    const res = await fetch(INDEXER_URL!, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables: { m: member.toLowerCase() } }),
    });
    return ((await res.json()) as Body).data;
  };
  // Members who left are excluded (SPEC A26); an indexer deployed before `active` existed answers the plain query.
  const data = (await ask("address: {_eq: $m}, active: {_eq: true}")) ?? (await ask("address: {_eq: $m}"));
  if (!data) throw new Error("indexer unavailable");
  const plenums = data.Member.map((m) => m.plenum);
  // One batched read per mandate: a member cap of 1 marks a personal portfolio.
  const caps = await Promise.all(
    plenums.map((p) => publicClient.readContract({ address: p.mandate, abi: mandateAbi, functionName: "maxMembers" }).catch(() => 0)),
  );
  return plenums.map((p, i) => ({ address: p.id, name: p.name, memberCount: p.memberCount, personal: Number(caps[i]) === 1 }));
}
