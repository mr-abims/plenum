import type { Address } from "viem";
import { adapterName, DEPLOYMENT } from "./config";
import type { PlenumState } from "./plenum";
import { TEMPLATES } from "./templates";

/**
 * EXAMPLE group for the landing page only: a five-member club on the Balanced template (SPEC §1 demo
 * persona), every holding inside its range and freshly priced. It shows how Plenum is meant to look.
 * Members' own dashboards always read live data from the chain.
 */
const USD = (n: number) => BigInt(Math.round(n * 1_000_000));
const balanced = TEMPLATES[1];
const holdings = [21_278.25, 10_229.0, 7_044.5]; // T-bill, credit, gold
const cash = 9_698.25;
const total = holdings.reduce((a, b) => a + b, cash);
const bps = (x: number) => Math.round((x / total) * 10_000);
const placeholder = (n: number) => `0x${n.toString(16).padStart(40, "0")}` as Address;

export const EXAMPLE_GROUP: PlenumState = {
  address: "0x7a1f0c3b9e42d58a6c0b1e93f27d4a85c6e0b912",
  name: "São Paulo Investment Club",
  organizer: "0x3e9b71c04fa25d8e6b0c917a42f8d35e1c06ab47",
  mandate: placeholder(1),
  governance: placeholder(2),
  gateway: placeholder(3),
  manager: placeholder(4),
  memberCount: 5,
  totalUnits: USD(total) * 1_000_000n,
  cash: USD(cash),
  total: USD(total),
  cashBps: bps(cash),
  minLiquidityBps: balanced.cashFloor,
  sleeves: balanced.sleeves.map((s, i) => {
    const weightBps = bps(holdings[i]!);
    return {
      adapter: s.adapter as Address,
      name: adapterName(s.adapter),
      value: USD(holdings[i]!),
      pending: 0n,
      weightBps,
      targetBps: s.target,
      bandBps: s.band,
      inBand: Math.abs(weightBps - s.target) <= s.band,
    };
  }),
  nav: { nav: USD(total), timestamp: 1, source: "CRE", ageSeconds: 42, fresh: true },
  navMaxAge: 600,
  maxTradeBps: balanced.maxTrade,
  maxDailyTurnoverBps: 2500,
  cooldown: 60,
  escalateQuorumBps: 4000,
  pauseQuorum: 2,
  maxMembers: 99,
  personal: false,
  votingPeriod: 48 * 3600,
  paused: false,
  pauseVotes: 0,
};

/** Credit is the async (request-then-claim) adapter; selling it is a RequestRedeem. */
export const isAsyncAdapter = (a: string) => a.toLowerCase() === DEPLOYMENT.creditVault.toLowerCase();
