import type { Address } from "viem";
import {
  consentRegistryAbi,
  governanceAbi,
  iAssetAdapterAbi,
  managerGatewayAbi,
  mandateAbi,
  mockCreditVaultAbi,
  navOracleAbi,
  plenumAbi,
} from "@plenum/abis";
import type { AgentContext } from "./context.ts";

const BPS = 10_000n;
const NAV_SOURCES = ["CRE", "FALLBACK"] as const;

export interface Sleeve {
  name: string;
  adapter: Address;
  value: string;
  pending: string;
  weightBps: number;
  targetBps: number;
  bandBps: number;
  inBand: boolean;
}

export interface Observation {
  plenum: Address;
  nav: { nav: string; timestamp: number; source: string; ageSeconds: number; fresh: boolean };
  holdings: { total: string; cash: string; cashBps: number; minLiquidityBps: number; sleeves: Sleeve[] };
  limits: { maxTradeBps: number; maxDailyTurnoverBps: number; cooldownSeconds: number; turnoverUsedToday: string };
  paused: boolean;
  cooldownRemainingSeconds: number;
  pendingRedemptions: { requestId: string; assets: string; claimableNow: boolean }[];
  openProposals: number;
  /** Members with an active consent grant to this manager (use with get_member_context). */
  consentedMembers: { member: Address; grantId: string; expiresAt: number }[];
}

/** Reads everything the manager is allowed to see onchain. All amounts are settlement-asset base units (6 decimals, MOCK test dollars). */
export async function observe(ctx: AgentContext): Promise<Observation> {
  const pc = ctx.clients.publicClient;
  const block = await pc.getBlock();
  const now = Number(block.timestamp);

  const [config, report, cash, paused, lastExecution, turnoverDay, turnoverToday, proposalCount] = await Promise.all([
    pc.readContract({ address: ctx.mandate, abi: mandateAbi, functionName: "config" }),
    pc.readContract({ address: ctx.navOracle, abi: navOracleAbi, functionName: "latest", args: [ctx.plenum] }),
    pc.readContract({ address: ctx.plenum, abi: plenumAbi, functionName: "cash" }),
    pc.readContract({ address: ctx.governance, abi: governanceAbi, functionName: "paused" }),
    pc.readContract({ address: ctx.gateway, abi: managerGatewayAbi, functionName: "lastExecution" }),
    pc.readContract({ address: ctx.gateway, abi: managerGatewayAbi, functionName: "turnoverDay" }),
    pc.readContract({ address: ctx.gateway, abi: managerGatewayAbi, functionName: "turnoverToday" }),
    pc.readContract({ address: ctx.governance, abi: governanceAbi, functionName: "proposalCount" }),
  ]);

  const raw = await Promise.all(
    config.adapters.map(async (adapter) => {
      const [value, pending] = await Promise.all([
        pc.readContract({ address: adapter, abi: iAssetAdapterAbi, functionName: "valueOf", args: [ctx.plenum] }),
        pc.readContract({ address: adapter, abi: iAssetAdapterAbi, functionName: "pendingOf", args: [ctx.plenum] }),
      ]);
      return { adapter, value, pending };
    }),
  );
  const total = raw.reduce((t, s) => t + s.value + s.pending, cash);
  const bps = (x: bigint) => (total === 0n ? 0 : Number((x * BPS) / total));

  const sleeves: Sleeve[] = raw.map((s, i) => {
    const weightBps = bps(s.value + s.pending);
    const targetBps = config.targetBps[i] ?? 0;
    const bandBps = config.bandBps[i] ?? 0;
    return {
      name: ctx.adapterNames[s.adapter.toLowerCase()] ?? s.adapter,
      adapter: s.adapter,
      value: s.value.toString(),
      pending: s.pending.toString(),
      weightBps,
      targetBps,
      bandBps,
      inBand: Math.abs(weightBps - targetBps) <= bandBps,
    };
  });

  const ageSeconds = report.timestamp === 0n ? Number.POSITIVE_INFINITY : now - Number(report.timestamp);
  const today = BigInt(Math.floor(now / 86_400));
  const cooldownEnds = lastExecution === 0n ? 0 : Number(lastExecution) + config.cooldown;

  return {
    plenum: ctx.plenum,
    nav: {
      nav: report.nav.toString(),
      timestamp: Number(report.timestamp),
      source: NAV_SOURCES[report.source] ?? "UNKNOWN",
      ageSeconds,
      fresh: report.timestamp !== 0n && ageSeconds <= config.navMaxAge,
    },
    holdings: {
      total: total.toString(),
      cash: cash.toString(),
      cashBps: bps(cash),
      minLiquidityBps: config.minLiquidityBps,
      sleeves,
    },
    limits: {
      maxTradeBps: config.maxTradeBps,
      maxDailyTurnoverBps: config.maxDailyTurnoverBps,
      cooldownSeconds: config.cooldown,
      turnoverUsedToday: (turnoverDay === today ? turnoverToday : 0n).toString(),
    },
    paused,
    cooldownRemainingSeconds: Math.max(0, cooldownEnds - now),
    pendingRedemptions: await pendingRedemptions(ctx),
    openProposals: Number(proposalCount),
    consentedMembers: await consentedMembers(ctx),
  };
}

/** Active consent grants from this plenum's members to the manager, read from contract state (no log scans). */
async function consentedMembers(ctx: AgentContext): Promise<Observation["consentedMembers"]> {
  const pc = ctx.clients.publicClient;
  const members = (await pc.readContract({ address: ctx.plenum, abi: plenumAbi, functionName: "members" })) as Address[];
  const out: Observation["consentedMembers"] = [];
  for (const member of members) {
    const ids = await pc.readContract({ address: ctx.consentRegistry, abi: consentRegistryAbi, functionName: "grantIdsOf", args: [member] });
    for (const id of ids) {
      const [, grantee, , expiry] = await pc.readContract({ address: ctx.consentRegistry, abi: consentRegistryAbi, functionName: "grants", args: [id] });
      if (grantee.toLowerCase() !== ctx.clients.account.address.toLowerCase()) continue;
      const active = await pc.readContract({ address: ctx.consentRegistry, abi: consentRegistryAbi, functionName: "isActive", args: [id] });
      if (active) out.push({ member, grantId: id.toString(), expiresAt: Number(expiry) });
    }
  }
  return out;
}

/** Credit-vault requests owned by this plenum, found from the vault's request mapping (no log range queries). */
async function pendingRedemptions(ctx: AgentContext): Promise<Observation["pendingRedemptions"]> {
  const pc = ctx.clients.publicClient;
  const next = await pc.readContract({ address: ctx.creditVault, abi: mockCreditVaultAbi, functionName: "nextRequestId" });
  const out: Observation["pendingRedemptions"] = [];
  for (let id = 1n; id < next; id++) {
    const [owner, assets] = await pc.readContract({
      address: ctx.creditVault,
      abi: mockCreditVaultAbi,
      functionName: "requests",
      args: [id],
    });
    if (owner.toLowerCase() !== ctx.plenum.toLowerCase()) continue;
    const claimable = await pc.readContract({
      address: ctx.creditVault,
      abi: mockCreditVaultAbi,
      functionName: "claimable",
      args: [id],
    });
    out.push({ requestId: id.toString(), assets: assets.toString(), claimableNow: claimable > 0n });
  }
  return out;
}

export type { Address };
