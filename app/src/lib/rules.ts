import type { MandateConfig } from "@plenum/sdk";
import { adapterName } from "./config";
import { duration, pct } from "./format";

const fee = (bps: number) => pct(bps, bps % 100 ? 1 : 0);
const period = (c: MandateConfig) => (c.periodLength ? `${duration(c.periodLength)} periods, ${duration(c.exitWindow)} free window, ${fee(c.earlyExitFeeBps)} fee` : "no period");

/** Plain-language lines describing what changes between two rule sets. */
export function configDiff(from: MandateConfig, to: MandateConfig): string[] {
  const out: string[] = [];
  const key = (a: string) => a.toLowerCase();
  const before = new Map(from.adapters.map((a, i) => [key(a), i]));
  const after = new Map(to.adapters.map((a, i) => [key(a), i]));
  for (const [a, i] of after) {
    const j = before.get(a);
    const name = adapterName(to.adapters[i]!);
    if (j === undefined) out.push(`+ ${name}: target ${pct(to.targetBps[i]!, 0)} ± ${pct(to.bandBps[i]!, 0)}`);
    else if (from.targetBps[j] !== to.targetBps[i] || from.bandBps[j] !== to.bandBps[i])
      out.push(`${name}: ${pct(from.targetBps[j]!, 0)} ± ${pct(from.bandBps[j]!, 0)} → ${pct(to.targetBps[i]!, 0)} ± ${pct(to.bandBps[i]!, 0)}`);
  }
  for (const [a, j] of before) if (!after.has(a)) out.push(`− ${adapterName(from.adapters[j]!)} (sell it first: an asset can only be removed once empty)`);
  const num = (label: string, x: number, y: number, f: (n: number) => string) => x !== y && out.push(`${label}: ${f(x)} → ${f(y)}`);
  num("Cash floor", from.minLiquidityBps, to.minLiquidityBps, (n) => pct(n, 0));
  num("One trade at most", from.maxTradeBps, to.maxTradeBps, (n) => pct(n, 0));
  num("Trades per day at most", from.maxDailyTurnoverBps, to.maxDailyTurnoverBps, (n) => pct(n, 0));
  if (period(from) !== period(to)) out.push(`Investment period: ${period(from)} → ${period(to)}`);
  return out.length ? out : ["No change"];
}

/** Mirrors Mandate._validate so members see problems before signing; the contract checks again. */
export function configProblem(c: MandateConfig): string | null {
  const sum = c.targetBps.reduce((t, x) => t + x, c.minLiquidityBps);
  if (!c.adapters.length) return "Keep at least one asset.";
  if (sum > 10_000) return `Targets plus the cash floor add up to ${pct(sum, 0)}; they must be 100% or less.`;
  if (c.maxTradeBps === 0 || c.maxTradeBps > 10_000) return "One trade must be between 1% and 100%.";
  if (c.earlyExitFeeBps > 1000) return "The fee for leaving early can be at most 10%.";
  if (c.periodLength && (c.exitWindow === 0 || c.exitWindow >= c.periodLength)) return "The free window must be shorter than the period.";
  return null;
}
