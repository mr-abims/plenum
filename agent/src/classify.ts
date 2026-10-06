import type { Reason } from "@plenum/abis";

export type Disposition = "inband" | "escalate" | "wait" | "drop";

/** SPEC A6: what the runtime does with each reason code from ManagerGateway.simulate. */
export function classify(reason: Reason): Disposition {
  switch (reason) {
    case "OK":
      return "inband";
    case "WEIGHT_OUT_OF_BAND":
    case "TRADE_TOO_LARGE":
    case "LIQUIDITY_FLOOR":
      return "escalate";
    case "COOLDOWN":
    case "TURNOVER_CAP":
      return "wait";
    default:
      return "drop"; // ADAPTER_NOT_ALLOWED, NAV_STALE, PAUSED, *_NOT_VERIFIED, JURISDICTION_BLOCKED, MEMBER_CAP
  }
}
