import type { Address } from "viem";
import { DEPLOYMENT } from "./config";

/** Mirrors contracts/script/Templates.sol (SPEC §12). Demo timing: 10-min NAV age, 1-min cooldown, 1-hour votes, 10-min rule-change wait. */
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

/** Investment period choices (SPEC A26). The demo period lets a judge see a free-exit window open within minutes. */
export const PERIODS = [
  { key: "none", label: "No fixed period", length: 0, window: 0 },
  { key: "3m", label: "3 months", length: 91 * 86_400, window: 7 * 86_400 },
  { key: "6m", label: "6 months", length: 182 * 86_400, window: 7 * 86_400 },
  { key: "12m", label: "12 months", length: 365 * 86_400, window: 7 * 86_400 },
  { key: "demo", label: "10 minutes (testnet demo)", length: 600, window: 180 },
] as const;
export type Period = (typeof PERIODS)[number];
export const FEES = [50, 100, 200, 500] as const; // breaking fee choices, basis points (cap 1000)

/**
 * Onchain mandate for a template. `personal` makes a portfolio of one (SPEC A23): one member, the owner alone approves
 * escalations and can pause the manager. Same safety bounds as a group.
 */
export function mandateConfig(
  t: Template,
  { demo = true, personal = false, period = PERIODS[0], feeBps = 200 }: { demo?: boolean; personal?: boolean; period?: Period; feeBps?: number } = {},
) {
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
    mandateChangeBps: 6666, // two-thirds: 2 of 3, 66 of 99
    timelock: demo ? 600 : 48 * 3600, // a passed rule change waits this long; exits are free meanwhile
    pauseQuorum: personal ? 1 : 2,
    votingPeriod: demo ? 3600 : 48 * 3600,
    periodLength: period.length,
    exitWindow: period.window,
    earlyExitFeeBps: period.length === 0 ? 0 : feeBps,
  };
}
