import type { Address } from "viem";
import type { PlenumState } from "./plenum";

/**
 * Browser-side mirror of Mandate.check steps 3-4 (size, cash floor, bands under the no-worse rule), used by
 * the landing page's "Try to break the rules" console on the EXAMPLE group. Onchain, only the contract's
 * answer counts. Mirrors contracts/src/core/Mandate.sol.
 */
export interface Move {
  adapter: Address;
  side: "buy" | "sell";
  assets: bigint;
  async: boolean;
}

const BPS = 10_000n;

export function after(p: PlenumState, m: Move) {
  const total = p.total;
  let cash = p.cash;
  const held = p.sleeves.map((s) => ({ adapter: s.adapter, value: s.value, pending: s.pending }));
  const s = held.find((h) => h.adapter.toLowerCase() === m.adapter.toLowerCase());
  if (s) {
    if (m.side === "buy") {
      cash -= m.assets;
      s.value += m.assets;
    } else {
      s.value -= m.assets;
      if (m.async) s.pending += m.assets; // RequestRedeem: still counted in the sleeve until claimed
      else cash += m.assets;
    }
  }
  const bps = (x: bigint) => (total === 0n ? 0 : Number((x * BPS) / total));
  return { cashBps: bps(cash), weights: Object.fromEntries(held.map((h) => [h.adapter.toLowerCase(), bps(h.value + h.pending)])), cash };
}

export function previewReason(p: PlenumState, m: Move): string {
  const total = p.total;
  if (total === 0n) return "LIQUIDITY_FLOOR";
  if (m.assets * BPS > BigInt(p.maxTradeBps) * total) return "TRADE_TOO_LARGE";
  const s = p.sleeves.find((x) => x.adapter.toLowerCase() === m.adapter.toLowerCase());
  if (!s) return "ADAPTER_NOT_ALLOWED";
  if (m.side === "buy" && m.assets > p.cash) return "LIQUIDITY_FLOOR";
  if (m.side === "sell" && m.assets > s.value) return "TRADE_TOO_LARGE";
  const a = after(p, m);
  if (a.cash * BPS < BigInt(p.minLiquidityBps) * total && a.cash < p.cash) return "LIQUIDITY_FLOOR";
  for (const x of p.sleeves) {
    const t = BigInt(x.targetBps) * total;
    const b = BigInt(x.bandBps) * total;
    const before = (x.value + x.pending) * BPS;
    const own = x.adapter.toLowerCase() === m.adapter.toLowerCase();
    const afterV = own ? (m.side === "buy" ? x.value + m.assets + x.pending : m.async ? x.value + x.pending : x.value - m.assets + x.pending) * BPS : before;
    if (afterV + b >= t && afterV <= t + b) continue;
    if (afterV > t ? before >= afterV : before <= afterV) continue;
    return "WEIGHT_OUT_OF_BAND";
  }
  return "OK";
}
