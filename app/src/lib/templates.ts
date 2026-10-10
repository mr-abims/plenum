import type { Address } from "viem";
import { DEPLOYMENT } from "./config";

/** Mirrors contracts/script/Templates.sol (SPEC §12). Demo timing: 10-min NAV age, 1-min cooldown, 1-hour votes. */
export const TEMPLATES = [
  {
    id: 0,
    key: "conservative",
    title: "Conservative",
    blurb: "Mostly short-term government debt. Smallest swings.",
    sleeves: [
      { adapter: DEPLOYMENT.tbillVault, target: 6000, band: 500 },
      { adapter: DEPLOYMENT.creditVault, target: 1000, band: 300 },
      { adapter: DEPLOYMENT.gold, target: 1000, band: 300 },
    ],
    cashFloor: 2000,
    maxTrade: 1000,
  },
  {
    id: 1,
    key: "balanced",
    title: "Balanced",
    blurb: "Government debt, private credit and gold, with a fifth in cash.",
    sleeves: [
      { adapter: DEPLOYMENT.tbillVault, target: 4500, band: 500 },
      { adapter: DEPLOYMENT.creditVault, target: 2000, band: 300 },
      { adapter: DEPLOYMENT.gold, target: 1500, band: 300 },
    ],
    cashFloor: 2000,
    maxTrade: 1000,
  },
  {
    id: 2,
    key: "liquidity",
    title: "Liquidity-first",
    blurb: "Plenty of cash on hand so members can leave quickly.",
    sleeves: [
      { adapter: DEPLOYMENT.tbillVault, target: 5000, band: 500 },
      { adapter: DEPLOYMENT.gold, target: 1000, band: 300 },
    ],
    cashFloor: 4000,
    maxTrade: 1500,
  },
] as const;

export type Template = (typeof TEMPLATES)[number];

/**
 * Onchain mandate for a template. `personal` makes a portfolio of one (SPEC A23): one member, the owner alone approves
 * escalations and can pause the manager. Same safety bounds as a group.
 */
export function mandateConfig(t: Template, { demo = true, personal = false }: { demo?: boolean; personal?: boolean } = {}) {
  return {
    adapters: t.sleeves.map((s) => s.adapter as Address),
    targetBps: t.sleeves.map((s) => s.target),
    bandBps: t.sleeves.map((s) => s.band),
    minLiquidityBps: t.cashFloor,
    maxTradeBps: t.maxTrade,
    maxDailyTurnoverBps: 2500,
    navMaxAge: demo ? 600 : 900,
    cooldown: demo ? 60 : 300,
    maxMembers: personal ? 1 : 99,
    escalateQuorumBps: personal ? 10_000 : demo ? 4000 : 5000,
    mandateChangeBps: 6667,
    timelock: 48 * 3600,
    jurisdictionsRoot: `0x${"00".repeat(32)}` as `0x${string}`,
    pauseQuorum: personal ? 1 : 2,
    votingPeriod: demo ? 3600 : 48 * 3600,
  };
}
