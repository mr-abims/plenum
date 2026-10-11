import { decodeEventLog, type Address, type Hash } from "viem";
import { governanceAbi, managerGatewayAbi, navOracleAbi, plenumAbi, REASONS, OPS } from "@plenum/abis";
import { publicClient } from "./chain";
import { adapterName, CHAIN, DEPLOYMENT, INDEXER_URL } from "./config";
import type { PlenumState } from "./plenum";

export type FeedKind =
  | "CONTRIBUTED" | "REDEEMED" | "JOINED" | "MANAGER_ACTION" | "ESCALATED" | "APPROVED" | "EXECUTED"
  | "PAUSED" | "UNPAUSED" | "NAV" | "ADAPTER";

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
  const address = [p.address, p.gateway, p.governance, DEPLOYMENT.navOracle];
  const raw = [];
  for (let lo = from; lo <= latest; lo += CHAIN.id === 31337 ? latest + 1n : LOG_CHUNK) {
    const hi = CHAIN.id === 31337 ? latest : lo + LOG_CHUNK - 1n > latest ? latest : lo + LOG_CHUNK - 1n;
    raw.push(...(await publicClient.getLogs({ address, fromBlock: lo, toBlock: hi })));
  }
  const abi = [...plenumAbi, ...managerGatewayAbi, ...governanceAbi, ...navOracleAbi];
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
}

/**
 * The groups an account belongs to, from the Envio indexer. Nothing about membership is stored on the device, so this
 * list rebuilds from the passkey alone on any browser (the Mera stateless test).
 */
export async function loadMyGroups(member: Address): Promise<MyGroup[]> {
  if (!INDEXER_URL) return [];
  const query = `query Mine($m: String!) {
    Member(where: {address: {_eq: $m}}) { plenum { id name memberCount } }
  }`;
  const res = await fetch(INDEXER_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables: { m: member.toLowerCase() } }),
  });
  const body = (await res.json()) as { data?: { Member: { plenum: { id: Address; name: string; memberCount: number } }[] } };
  if (!body.data) throw new Error("indexer unavailable");
  return body.data.Member.map(({ plenum: p }) => ({ address: p.id, name: p.name, memberCount: p.memberCount }));
}
