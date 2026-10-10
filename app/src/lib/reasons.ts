import type { Reason } from "@plenum/abis";
import type { Tone } from "@/components/ui";

/**
 * Plain-language meaning of every `Reason` the contracts return (order pinned in Types.sol).
 * `kind` follows the agent's classify map (SPEC A6): act, escalate, wait or drop.
 */
export const REASON_INFO: Record<Reason, { label: string; why: string; tone: Tone; kind: "act" | "escalate" | "wait" | "drop" }> = {
  OK: { label: "Within the rules", why: "Every holding stays inside its range and every limit holds, so it can happen now.", tone: "accent", kind: "act" },
  ADAPTER_NOT_ALLOWED: { label: "Not on the list", why: "The group never approved that destination. Money can only move between approved assets.", tone: "bad", kind: "drop" },
  WEIGHT_OUT_OF_BAND: { label: "Outside a holding's range", why: "A holding would end up outside the range the group set for it. Members must approve.", tone: "warn", kind: "escalate" },
  LIQUIDITY_FLOOR: { label: "Too little cash left", why: "Cash would drop below the floor kept for members who want money back. Members must approve.", tone: "warn", kind: "escalate" },
  TRADE_TOO_LARGE: { label: "Trade too large", why: "A single trade may only move a set share of the group's value. Bigger moves go to a vote.", tone: "warn", kind: "escalate" },
  TURNOVER_CAP: { label: "Daily limit reached", why: "All trades in one day are capped. The manager has to wait for tomorrow.", tone: "neutral", kind: "wait" },
  NAV_STALE: { label: "No fresh price", why: "The independent valuation is too old, so nothing can move until the administrator prices the fund again.", tone: "info", kind: "drop" },
  COOLDOWN: { label: "Too soon", why: "The manager must wait between trades.", tone: "neutral", kind: "wait" },
  PAUSED: { label: "Manager paused", why: "Members paused the manager. It cannot trade or propose anything.", tone: "bad", kind: "drop" },
  PAYEE_NOT_VERIFIED: { label: "Payee not verified", why: "Money can only be paid to a verified person.", tone: "bad", kind: "drop" },
  MEMBER_NOT_VERIFIED: { label: "Member not verified", why: "Only verified people can put money in or join.", tone: "bad", kind: "drop" },
  JURISDICTION_BLOCKED: { label: "Country not allowed", why: "The group's rules don't allow members or assets from that place.", tone: "bad", kind: "drop" },
  MEMBER_CAP: { label: "Group is full", why: "A group can have at most 99 members.", tone: "neutral", kind: "drop" },
};

export const reasonInfo = (r: string) => REASON_INFO[r as Reason] ?? { label: r, why: "", tone: "neutral" as Tone, kind: "drop" as const };
