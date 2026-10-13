import { hexToString } from "viem";
import type { FeedItem } from "./feed";
import { reasonInfo } from "./reasons";

/** Plain-language title for one activity item. */
export function feedTitle(i: FeedItem): string {
  switch (i.kind) {
    case "MANAGER_ACTION":
      return i.detail === "OK" ? "Rebalanced within the rules" : `Refused: ${reasonInfo(i.detail).label.toLowerCase()}`;
    case "ESCALATED":
      return "Asked members to decide";
    case "ADAPTER":
      return "Trade settled";
    case "NAV":
      return i.detail === "FALLBACK" ? "Priced by the FALLBACK writer" : "Priced by the independent administrator";
    case "PAUSED":
      return "Members paused the manager";
    case "UNPAUSED":
      return "Members resumed the manager";
    case "CONTRIBUTED":
      return "Contribution";
    case "REDEEMED":
      return "Money taken out";
    case "JOINED":
      return "New member joined";
    case "APPROVED":
      return "A member approved";
    case "EXECUTED":
      return "Members' decision carried out";
    case "LEFT":
      return "A member left";
    case "EXIT_FEE":
      return "Fee for leaving early";
    case "RULE_PROPOSED":
      return "New rules proposed";
    case "RULE_SCHEDULED":
      return "New rules passed, waiting to apply";
    case "RULE_APPLIED":
      return "New rules in force";
    case "MANAGER_PROPOSED":
      return "A new manager was proposed";
    case "MANAGER_REPLACED":
      return "Members replaced the manager";
  }
}

/** One-sentence explanation under the title. */
export function feedBody(i: FeedItem): string {
  switch (i.kind) {
    case "MANAGER_ACTION":
      return reasonInfo(i.detail).why;
    case "ESCALATED":
      return `This move is outside the manager's authority (${i.detail}). Nothing moves until enough members approve.`;
    case "NAV":
      return i.detail === "FALLBACK"
        ? "Valued by the labelled FALLBACK writer, used only to keep the demo running."
        : "Valued by the Chainlink CRE workflow. The manager never writes prices.";
    case "ADAPTER":
      return i.detail;
    case "EXIT_FEE": {
      const m = i.detail.match(/toGroup=(\d+) toTreasury=(\d+)/);
      return m ? `Shared by the members who remain: $${(Number(m[1]) / 1e6).toFixed(2)}. To Plenum: $${(Number(m[2]) / 1e6).toFixed(2)}.` : i.detail;
    }
    case "RULE_SCHEDULED":
      return "Members passed new rules. They apply after the waiting period; anyone can leave free of charge until then.";
    case "MANAGER_REPLACED":
      return `A different manager key now runs the money, with the same limits (${i.detail}).`;
    default:
      return i.detail;
  }
}

export function modelName(hex: string) {
  try {
    return hexToString(hex as `0x${string}`, { size: 32 }).replace(/\0/g, "");
  } catch {
    return hex.slice(0, 10);
  }
}
