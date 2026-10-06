import { encodeAbiParameters, type Address, type Hex } from "viem";

/** One mandate sleeve as read onchain, in A-Token base units (6 decimals). */
export interface SleeveRead {
  adapter: Address;
  value: bigint;
  pending: bigint;
  targetBps: number;
}

export interface NavResult {
  nav: bigint;
  driftBps: bigint[]; // weight − target per sleeve, signed basis points
}

/** SPEC §9 step 3: NAV = cash + Σ (adapter value + pending); drift per sleeve in bps vs target. */
export function computeNav(cash: bigint, sleeves: SleeveRead[]): NavResult {
  const nav = sleeves.reduce((t, s) => t + s.value + s.pending, cash);
  const driftBps = sleeves.map((s) =>
    nav === 0n ? 0n : ((s.value + s.pending) * 10_000n) / nav - BigInt(s.targetBps),
  );
  return { nav, driftBps };
}

/** Report payload decoded by NavOracle._processReport: (address plenum, uint256 nav, int256[] driftBps, uint64 ts). */
export function encodeNavReport(plenum: Address, r: NavResult, timestamp: bigint): Hex {
  return encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }, { type: "int256[]" }, { type: "uint64" }],
    [plenum, r.nav, r.driftBps, timestamp],
  );
}
