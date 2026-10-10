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
    case "REFUSED":
      return "Identity check refused a payment";
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
    case "REFUSED":
      return `A payment involving an unverified account was stopped and logged (${i.detail}).`;
    case "ADAPTER":
      return i.detail;
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
