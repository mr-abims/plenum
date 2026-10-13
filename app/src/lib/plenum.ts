import type { Address } from "viem";
import {
  governanceAbi,
  iAssetAdapterAbi,
  managerGatewayAbi,
  mandateAbi,
  navOracleAbi,
  plenumAbi,
  OPS,
} from "@plenum/abis";
import { readMandateConfig, type MandateConfig } from "@plenum/sdk";
import { publicClient } from "./chain";
import { adapterName, DEPLOYMENT } from "./config";

const BPS = 10_000n;
export const UNIT = 10n ** 12n; // units have 12 decimals
export const USD = 10n ** 6n; // the settlement asset (MOCK test dollar) has 6 decimals

export interface Sleeve {
  adapter: Address;
  name: string;
  value: bigint;
  pending: bigint;
  weightBps: number;
  targetBps: number;
  bandBps: number;
  inBand: boolean;
}

export interface PlenumState {
  address: Address;
  name: string;
  organizer: Address;
  mandate: Address;
  governance: Address;
  gateway: Address;
  manager: Address;
  memberCount: number;
  totalUnits: bigint;
  cash: bigint;
  total: bigint;
  cashBps: number;
  minLiquidityBps: number;
  sleeves: Sleeve[];
  nav: { nav: bigint; timestamp: number; source: "CRE" | "FALLBACK"; ageSeconds: number; fresh: boolean };
  navMaxAge: number;
  maxTradeBps: number;
  maxDailyTurnoverBps: number;
  cooldown: number;
  escalateQuorumBps: number;
  pauseQuorum: number;
  maxMembers: number;
  /** A personal portfolio: a plenum of one (SPEC A23). */
  personal: boolean;
  votingPeriod: number;
  paused: boolean;
  pauseVotes: number;
  /** The full onchain config (prefills the rule-change editor). */
  config: MandateConfig;
  /** Created by the second factory: rule changes, manager replacement, leaving and periods (SPEC A26). */
  v2: boolean;
  /** Chain time of the last read, seconds. */
  now: number;
  mandateChangeBps: number;
  timelock: number;
  /** Investment period (0 = none), free-exit window and breaking fee. */
  periodLength: number;
  exitWindow: number;
  earlyExitFeeBps: number;
  /** Fee an exit pays right now (0 inside the window, with no period, or while a rule change is pending). */
  exitFeeNowBps: number;
  nextPeriodEnd: number;
  /** Protocol's share of each breaking fee (the rest stays with the group). */
  protocolFeeCutBps: number;
  /** A rule change members passed, waiting out its delay. */
  pendingChange: { config: MandateConfig; eta: number } | null;
}

const read = <T,>(address: Address, abi: readonly unknown[], functionName: string, args: readonly unknown[] = []) =>
  publicClient.readContract({ address, abi, functionName, args } as never) as Promise<T>;

export async function loadPlenum(address: Address): Promise<PlenumState> {
  const [name, organizer, mandate, governance, gateway, memberCount, totalUnits, cash] = await Promise.all([
    read<string>(address, plenumAbi, "name"),
    read<Address>(address, plenumAbi, "organizer"),
    read<Address>(address, plenumAbi, "mandate"),
    read<Address>(address, plenumAbi, "governance"),
    read<Address>(address, plenumAbi, "gateway"),
    read<bigint>(address, plenumAbi, "memberCount"),
    read<bigint>(address, plenumAbi, "totalUnits"),
    read<bigint>(address, plenumAbi, "cash"),
  ]);
  const [{ config, v2 }, report, manager, paused, pauseVotes, block] = await Promise.all([
    readMandateConfig(publicClient as never, mandate),
    read<{ nav: bigint; timestamp: bigint; source: number }>(DEPLOYMENT.navOracle, navOracleAbi, "latest", [address]),
    read<Address>(gateway, managerGatewayAbi, "manager"),
    read<boolean>(governance, governanceAbi, "paused"),
    read<bigint>(governance, governanceAbi, "pauseVotes"),
    publicClient.getBlock(),
  ]);
  const values = await Promise.all(
    config.adapters.map(async (a) => {
      const [value, pending] = await Promise.all([
        read<bigint>(a, iAssetAdapterAbi, "valueOf", [address]),
        read<bigint>(a, iAssetAdapterAbi, "pendingOf", [address]),
      ]);
      return { a, value, pending };
    }),
  );
  const [exitFeeNowBps, nextPeriodEnd, pending, protocolFeeCutBps] = v2
    ? await Promise.all([
        read<number>(mandate, mandateAbi, "exitFeeBps"),
        read<bigint>(mandate, mandateAbi, "nextPeriodEnd"),
        read<readonly [MandateConfig, bigint]>(mandate, mandateAbi, "pendingChange"),
        read<number>(address, plenumAbi, "protocolFeeCutBps"),
      ])
    : [0, 0n, null, 0];
  const total = values.reduce((t, v) => t + v.value + v.pending, cash);
  const bps = (x: bigint) => (total === 0n ? 0 : Number((x * BPS) / total));
  const sleeves = values.map(({ a, value, pending }, i) => {
    const weightBps = bps(value + pending);
    const targetBps = config.targetBps[i] ?? 0;
    const bandBps = config.bandBps[i] ?? 0;
    return { adapter: a, name: adapterName(a), value, pending, weightBps, targetBps, bandBps, inBand: Math.abs(weightBps - targetBps) <= bandBps };
  });
  const now = Number(block.timestamp);
  const ts = Number(report.timestamp);
  return {
    address,
    name,
    organizer,
    mandate,
    governance,
    gateway,
    manager,
    memberCount: Number(memberCount),
    totalUnits,
    cash,
    total,
    cashBps: bps(cash),
    minLiquidityBps: config.minLiquidityBps,
    sleeves,
    nav: {
      nav: report.nav,
      timestamp: ts,
      source: report.source === 1 ? "FALLBACK" : "CRE",
      ageSeconds: ts === 0 ? Infinity : now - ts,
      fresh: ts !== 0 && now - ts <= config.navMaxAge,
    },
    navMaxAge: config.navMaxAge,
    maxTradeBps: config.maxTradeBps,
    maxDailyTurnoverBps: config.maxDailyTurnoverBps,
    cooldown: config.cooldown,
    escalateQuorumBps: config.escalateQuorumBps,
    pauseQuorum: config.pauseQuorum,
    maxMembers: config.maxMembers,
    personal: config.maxMembers === 1,
    votingPeriod: config.votingPeriod,
    paused,
    pauseVotes: Number(pauseVotes),
    config,
    v2,
    now,
    mandateChangeBps: config.mandateChangeBps,
    timelock: config.timelock,
    periodLength: config.periodLength,
    exitWindow: config.exitWindow,
    earlyExitFeeBps: config.earlyExitFeeBps,
    exitFeeNowBps: Number(exitFeeNowBps),
    nextPeriodEnd: Number(nextPeriodEnd),
    protocolFeeCutBps: Number(protocolFeeCutBps),
    pendingChange: pending && pending[1] !== 0n ? { config: pending[0], eta: Number(pending[1]) } : null,
  };
}

/** What leaving or withdrawing `value` costs right now: the fee, and how it splits between the group and Plenum. */
export function exitQuote(p: PlenumState, value: bigint, units: bigint) {
  const fee = (value * BigInt(p.exitFeeNowBps)) / BPS;
  const alone = p.memberCount <= 1 || units === p.totalUnits;
  const toTreasury = alone ? fee : (fee * BigInt(p.protocolFeeCutBps)) / BPS;
  return { fee, toTreasury, toGroup: fee - toTreasury, payout: value - fee };
}

export interface MemberPosition {
  isMember: boolean;
  units: bigint;
  /** Value of the member's units at V = holdings total (indicative between NAV reports). */
  value: bigint;
  shareBps: number;
  balance: bigint; // test dollars in wallet
}

export async function loadPosition(p: PlenumState, member: Address): Promise<MemberPosition> {
  const [isMember, units, balance] = await Promise.all([
    read<boolean>(p.address, plenumAbi, "isMember", [member]),
    read<bigint>(p.address, plenumAbi, "unitsOf", [member]),
    read<bigint>(DEPLOYMENT.asset, [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] }], "balanceOf", [member]),
  ]);
  const value = p.totalUnits === 0n ? 0n : (units * p.total) / p.totalUnits;
  const shareBps = p.totalUnits === 0n ? 0 : Number((units * BPS) / p.totalUnits);
  return { isMember, units, value, shareBps, balance };
}

export interface ProposalView {
  id: bigint;
  /** What the proposal does: run trades, change the rules, or replace the manager (SPEC A26). */
  kind: "ACTIONS" | "RULE_CHANGE" | "REPLACE_MANAGER";
  /** Approvals needed, as a share of members (escalation quorum or the rule-change supermajority). */
  thresholdBps: number;
  newConfig?: MandateConfig;
  newManager?: Address;
  actionsHash: string;
  rationaleHash: string;
  proposer: Address;
  deadline: number;
  approvals: number;
  executed: boolean;
  quorumReached: boolean;
  actions: { adapter: Address; name: string; op: string; assets: bigint }[];
  approvedByMe: boolean;
}

export async function loadProposals(p: PlenumState, me?: Address): Promise<ProposalView[]> {
  const count = Number(await read<bigint>(p.governance, governanceAbi, "proposalCount"));
  const ids = Array.from({ length: count }, (_, i) => BigInt(count - i));
  return Promise.all(
    ids.map(async (id) => {
      const kindIdx = p.v2 ? await read<number>(p.governance, governanceAbi, "kindOf", [id]) : 0;
      const kind = (["ACTIONS", "RULE_CHANGE", "REPLACE_MANAGER"] as const)[kindIdx] ?? "ACTIONS";
      const [newConfig, newManager] = await Promise.all([
        kind === "RULE_CHANGE" ? read<MandateConfig>(p.governance, governanceAbi, "mandateChangeOf", [id]) : undefined,
        kind === "REPLACE_MANAGER" ? read<Address>(p.governance, governanceAbi, "newManagerOf", [id]) : undefined,
      ]);
      const [proposal, actions, quorumReached, approvedByMe] = await Promise.all([
        read<readonly [string, string, Address, bigint, number, boolean]>(p.governance, governanceAbi, "proposals", [id]),
        read<readonly { adapter: Address; op: number; assets: bigint }[]>(p.governance, governanceAbi, "actionsOf", [id]),
        read<boolean>(p.governance, governanceAbi, "quorumReached", [id]),
        me ? read<boolean>(p.governance, governanceAbi, "hasApproved", [id, me]) : Promise.resolve(false),
      ]);
      const [actionsHash, rationaleHash, proposer, deadline, approvals, executed] = proposal;
      return {
        id,
        kind,
        thresholdBps: kind === "ACTIONS" ? p.escalateQuorumBps : p.mandateChangeBps,
        newConfig,
        newManager,
        actionsHash,
        rationaleHash,
        proposer,
        deadline: Number(deadline),
        approvals,
        executed,
        quorumReached,
        approvedByMe,
        actions: actions.map((a) => ({ adapter: a.adapter, name: adapterName(a.adapter), op: OPS[a.op] ?? "?", assets: a.assets })),
      };
    }),
  );
}
