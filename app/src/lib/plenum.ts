import type { Address } from "viem";
import {
  complianceGateAbi,
  governanceAbi,
  iAssetAdapterAbi,
  managerGatewayAbi,
  mandateAbi,
  navOracleAbi,
  plenumAbi,
  REASONS,
  OPS,
} from "@plenum/abis";
import { publicClient } from "./chain";
import { adapterName, DEPLOYMENT } from "./config";

const BPS = 10_000n;
export const UNIT = 10n ** 12n; // units have 12 decimals
export const USD = 10n ** 6n; // A-Token has 6 decimals

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
  votingPeriod: number;
  paused: boolean;
  pauseVotes: number;
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
  type Cfg = {
    adapters: readonly Address[];
    targetBps: readonly number[];
    bandBps: readonly number[];
    minLiquidityBps: number;
    maxTradeBps: number;
    maxDailyTurnoverBps: number;
    navMaxAge: number;
    cooldown: number;
    escalateQuorumBps: number;
    pauseQuorum: number;
    votingPeriod: number;
  };
  const [config, report, manager, paused, pauseVotes, block] = await Promise.all([
    read<Cfg>(mandate, mandateAbi, "config"),
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
    votingPeriod: config.votingPeriod,
    paused,
    pauseVotes: Number(pauseVotes),
  };
}

export interface MemberPosition {
  isMember: boolean;
  units: bigint;
  /** Value of the member's units at V = holdings total (indicative between NAV reports). */
  value: bigint;
  shareBps: number;
  verified: boolean;
  balance: bigint; // mvUSD in wallet
}

export async function loadPosition(p: PlenumState, member: Address): Promise<MemberPosition> {
  const [isMember, units, check, balance] = await Promise.all([
    read<boolean>(p.address, plenumAbi, "isMember", [member]),
    read<bigint>(p.address, plenumAbi, "unitsOf", [member]),
    read<number>(DEPLOYMENT.complianceGate, complianceGateAbi, "checkMember", [member]),
    read<bigint>(DEPLOYMENT.aToken, [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] }], "balanceOf", [member]),
  ]);
  const value = p.totalUnits === 0n ? 0n : (units * p.total) / p.totalUnits;
  const shareBps = p.totalUnits === 0n ? 0 : Number((units * BPS) / p.totalUnits);
  return { isMember, units, value, shareBps, verified: REASONS[check] === "OK", balance };
}

export async function isVerified(member: Address): Promise<boolean> {
  const r = await read<number>(DEPLOYMENT.complianceGate, complianceGateAbi, "checkMember", [member]);
  return REASONS[r] === "OK";
}

export interface ProposalView {
  id: bigint;
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
      const [proposal, actions, quorumReached, approvedByMe] = await Promise.all([
        read<readonly [string, string, Address, bigint, number, boolean]>(p.governance, governanceAbi, "proposals", [id]),
        read<readonly { adapter: Address; op: number; assets: bigint }[]>(p.governance, governanceAbi, "actionsOf", [id]),
        read<boolean>(p.governance, governanceAbi, "quorumReached", [id]),
        me ? read<boolean>(p.governance, governanceAbi, "hasApproved", [id, me]) : Promise.resolve(false),
      ]);
      const [actionsHash, rationaleHash, proposer, deadline, approvals, executed] = proposal;
      return {
        id,
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
