"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { hexToString, type Address } from "viem";
import { MemoView } from "@/components/MemoView";
import { Badge, Card, Eyebrow, H1, Notice, TxLink } from "@/components/ui";
import { inTimeZone, money } from "@/lib/format";
import { loadFeed, type FeedItem } from "@/lib/feed";
import { useSession } from "@/lib/session";
import { usePlenum } from "@/lib/usePlenum";

const EXPLAIN: Record<string, string> = {
  OK: "Done within the group's rules",
  ADAPTER_NOT_ALLOWED: "Refused: that asset isn't allowed by the rules",
  WEIGHT_OUT_OF_BAND: "Outside the allowed range for a holding",
  LIQUIDITY_FLOOR: "Would leave too little cash",
  TRADE_TOO_LARGE: "Bigger than a single trade may be",
  TURNOVER_CAP: "Daily trading limit reached",
  NAV_STALE: "Refused: the latest valuation is too old",
  COOLDOWN: "Too soon after the last trade",
  PAUSED: "The manager is paused",
};

export default function ManagerPage() {
  const { plenum } = useParams<{ plenum: Address }>();
  const { state: p } = usePlenum(plenum);
  const { profile } = useSession();
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!p) return;
    loadFeed(p)
      .then((f) => setItems(f.filter((i) => ["MANAGER_ACTION", "ESCALATED", "ADAPTER", "NAV", "PAUSED", "UNPAUSED", "REFUSED"].includes(i.kind))))
      .catch((e) => setError(String(e)));
  }, [p?.total, p?.nav.timestamp]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>AI manager</Eyebrow>
        <H1>What the manager did, and why</H1>
        <p className="mt-3 max-w-2xl text-muted">
          Every action carries a fingerprint of the manager's written reasoning and the model that produced it. Actions the
          rules refused are shown too.
        </p>
      </div>
      {p ? (
        <Card className="flex flex-wrap items-center gap-3 text-sm">
          <span className="text-muted">Manager key</span>
          <code className="text-xs">{p.manager}</code>
          {p.paused ? <Badge tone="bad">Paused by members</Badge> : <Badge tone="ok">Active</Badge>}
        </Card>
      ) : null}
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {!items ? <p className="text-muted">Loading…</p> : items.length === 0 ? <p className="text-muted">Nothing yet.</p> : null}
      <ol className="space-y-3">
        {items?.map((i) => {
          const refused = (i.kind === "MANAGER_ACTION" && i.detail !== "OK") || i.kind === "REFUSED";
          return (
            <li key={i.id}>
              <Card className={refused ? "border-warn/50" : ""}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge tone={refused ? "warn" : i.kind === "ESCALATED" ? "neutral" : i.kind === "PAUSED" ? "bad" : "ok"}>
                      {label(i)}
                    </Badge>
                    {i.amount !== undefined ? <span className="text-sm tabular">{money(i.amount)}</span> : null}
                  </div>
                  <span className="text-xs text-muted">{inTimeZone(i.timestamp, profile.timeZone)}</span>
                </div>
                <p className="mt-2 text-sm">{describe(i)}</p>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted">
                  <TxLink hash={i.txHash}>transaction</TxLink>
                  {i.modelId ? <span>model {modelName(i.modelId)}</span> : null}
                  {i.rationaleHash ? <span className="font-mono">reasoning {i.rationaleHash.slice(0, 14)}…</span> : null}
                </div>
                {i.rationaleHash && p ? <MemoView rationaleHash={i.rationaleHash} manager={p.manager} /> : null}
              </Card>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function label(i: FeedItem) {
  return (
    { MANAGER_ACTION: i.detail === "OK" ? "Rebalanced" : "Refused", ESCALATED: "Asked members", ADAPTER: "Trade", NAV: "Valuation", PAUSED: "Paused", UNPAUSED: "Resumed", REFUSED: "Identity check" } as Record<string, string>
  )[i.kind] ?? i.kind;
}

function describe(i: FeedItem) {
  switch (i.kind) {
    case "MANAGER_ACTION":
      return EXPLAIN[i.detail] ?? i.detail;
    case "ESCALATED":
      return `The manager proposed a change outside its authority (${i.detail}). Nothing moves until members approve.`;
    case "NAV":
      return i.detail === "FALLBACK" ? "Valued by the labelled FALLBACK writer (demo resilience only)." : "Valued by the independent Chainlink CRE administrator.";
    case "REFUSED":
      return `A payment involving an unverified account was refused (${i.detail}).`;
    default:
      return i.detail;
  }
}

function modelName(hex: string) {
  try {
    return hexToString(hex as `0x${string}`, { size: 32 }).replace(/\0/g, "");
  } catch {
    return hex.slice(0, 10);
  }
}
