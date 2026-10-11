import { describe, expect, it } from "vitest";
import { decodeAbiParameters } from "viem";
import { computeNav, encodeNavReport, encodePriceReport, goldValue, toUsd6 } from "../plenum-nav/nav";

const USD = 1_000_000n;
const A = "0x00000000000000000000000000000000000000a1" as const;

describe("NAV computation (SPEC §9)", () => {
  it("adds cash, adapter values and pending redemptions; drift is signed bps vs target", () => {
    const r = computeNav(2_000n * USD, [
      { adapter: A, value: 4_500n * USD, pending: 0n, targetBps: 4500 },
      { adapter: A, value: 2_200n * USD, pending: 400n * USD, targetBps: 2000 },
      { adapter: A, value: 1_500n * USD, pending: 0n, targetBps: 1500 },
    ]);
    expect(r.nav).toBe(10_600n * USD);
    expect(r.driftBps).toEqual([4245n - 4500n, 2452n - 2000n, 1415n - 1500n]);
  });

  it("handles an empty fund", () => {
    expect(computeNav(0n, [{ adapter: A, value: 0n, pending: 0n, targetBps: 4500 }])).toEqual({ nav: 0n, driftBps: [0n] });
  });

  it("encodes exactly what NavOracle._processReport decodes", () => {
    const r = { nav: 10_000n * USD, driftBps: [-255n, 452n, -85n] };
    const payload = encodeNavReport(A, r, 1_760_000_000n);
    const [plenum, nav, drift, ts] = decodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }, { type: "int256[]" }, { type: "uint64" }],
      payload,
    );
    expect(plenum.toLowerCase()).toBe(A);
    expect(nav).toBe(r.nav);
    expect(drift).toEqual(r.driftBps);
    expect(ts).toBe(1_760_000_000n);
  });
});

describe("gold price from external market data (SPEC A25)", () => {
  it("converts a USD spot price to 6-decimal units", () => {
    expect(toUsd6(4195.600098)).toBe(4_195_600_098n);
    expect(() => toUsd6(0)).toThrow();
    expect(() => toUsd6(Number.NaN)).toThrow();
  });

  it("values ounces like MockGold.valueOf (18-decimal ounces, rounded down)", () => {
    expect(goldValue(10n ** 18n, 4_195_600_098n)).toBe(4_195_600_098n);
    expect(goldValue(5n * 10n ** 17n, 4_195_600_099n)).toBe(2_097_800_049n);
  });

  it("encodes exactly what MockGold._processReport decodes", () => {
    const [price, ts] = decodeAbiParameters([{ type: "uint256" }, { type: "uint64" }], encodePriceReport(4_195_600_098n, 1_760_000_000n));
    expect(price).toBe(4_195_600_098n);
    expect(ts).toBe(1_760_000_000n);
  });
});
