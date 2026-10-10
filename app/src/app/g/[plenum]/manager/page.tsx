"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import type { Address as Addr } from "viem";
import { Check, Fingerprint, Robot, SealCheck, X } from "@phosphor-icons/react";
import { Address } from "@/components/Address";
import { MemoView } from "@/components/MemoView";
import { ReasonChip } from "@/components/ReasonChip";
import { Skeleton } from "@/components/Skeleton";
import { Card, Chip, MockTag, Notice, PageHeader, TxLink } from "@/components/ui";
import { loadFeed, type FeedItem } from "@/lib/feed";
import { feedBody, feedTitle, modelName } from "@/lib/feedText";
import { inTimeZone, money } from "@/lib/format";
import { useSession } from "@/lib/session";
import { usePlenum } from "@/lib/usePlenum";

const MANAGER_KINDS = ["MANAGER_ACTION", "ESCALATED", "ADAPTER", "NAV", "PAUSED", "UNPAUSED", "REFUSED"];
const FILTERS = [
  { key: "all", label: "Everything", match: () => true },
  { key: "acted", label: "Acted", match: (i: FeedItem) => (i.kind === "MANAGER_ACTION" && i.detail === "OK") || i.kind === "ADAPTER" },
  { key: "refused", label: "Refused", match: (i: FeedItem) => (i.kind === "MANAGER_ACTION" && i.detail !== "OK") || i.kind === "REFUSED" },
  { key: "asked", label: "Asked members", match: (i: FeedItem) => i.kind === "ESCALATED" },
  { key: "prices", label: "Prices", match: (i: FeedItem) => i.kind === "NAV" },
] as const;

export default function ManagerPage() {
  const { plenum } = useParams<{ plenum: Addr }>();
  const { state: p } = usePlenum(plenum);
  const { profile } = useSession();
  const reduce = useReducedMotion();
  const [items, setItems] = useState<FeedItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");

  useEffect(() => {
    if (!p) return;
    loadFeed(p)
      .then((f) => setItems(f.filter((i) => MANAGER_KINDS.includes(i.kind))))
      .catch((e) => setError(String(e)));
  }, [p?.total, p?.nav.timestamp]); // eslint-disable-line react-hooks/exhaustive-deps

  const model = useMemo(() => items?.find((i) => i.modelId)?.modelId, [items]);
  const shown = items?.filter(FILTERS.find((f) => f.key === filter)!.match) ?? null;

  return (
    <div className="space-y-8">
      <PageHeader
        title="What the manager did, and why"
        lead="Every action carries a fingerprint of the manager's written reasoning and the model that produced it. What the rules refused is shown too."
      />

      <Card className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <div className="flex gap-4">
          <span className="relative grid size-14 shrink-0 place-items-center rounded-2xl border border-line-strong bg-sunk text-accent">
            <Robot size={28} weight="duotone" />
            {p && !p.paused ? <span className="pulse absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-accent text-accent" /> : null}
          </span>
          <div className="min-w-0 space-y-2">
            <p className="font-display text-xl font-semibold tracking-tight">{model ? modelName(model) : "AI manager"}</p>
            {p ? <Address value={p.manager} /> : <Skeleton className="h-4 w-32" />}
            <div className="flex flex-wrap gap-2">
              {p ? p.paused ? <Chip tone="bad">Paused by members</Chip> : <Chip tone="accent">Active</Chip> : null}
              <Chip>Autonomy L1</Chip>
            </div>
            <p className="text-xs leading-relaxed text-muted">Acts on its own inside the rules. Asks members for everything else.</p>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Powers
            tone="ok"
            title="It can"
            items={["Buy and sell the assets the group approved", "Correct drift, inside each holding's range", "Propose bigger moves for members to vote on"]}
          />
          <Powers
            tone="bad"
            title="It can never"
            items={["Send money anywhere else", "Change the rules or write prices", "Approve its own proposals"]}
          />
        </div>
      </Card>

      <div>
        <div className="rail -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
          {FILTERS.map((f) => {
            const count = items?.filter(f.match).length;
            const on = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                aria-pressed={on}
                className={`relative inline-flex min-h-9 shrink-0 items-center gap-2 rounded-full border px-4 text-sm transition ${on ? "border-transparent text-accent-ink" : "border-line-strong text-muted hover:text-ink"}`}
              >
                {on ? <motion.span layoutId="feed-filter" className="absolute inset-0 rounded-full bg-accent" transition={{ type: "spring", stiffness: 420, damping: 34 }} /> : null}
                <span className="relative">{f.label}</span>
                {count !== undefined ? <span className={`relative font-mono text-[11px] ${on ? "" : "text-faint"}`}>{count}</span> : null}
              </button>
            );
          })}
        </div>

        {error ? (
          <div className="mt-6">
            <Notice tone="bad">{error}</Notice>
          </div>
        ) : null}

        {!shown ? (
          <div className="mt-8 space-y-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-28 rounded-[20px]!" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="mt-8 rounded-[20px] border border-dashed border-line-strong p-10 text-center">
            <Robot size={32} weight="light" className="mx-auto text-faint" />
            <p className="mt-3 font-medium">Nothing here yet</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted">
              The manager's moves, refusals and requests appear here with their reasons. Without an indexer, only the last few minutes of chain history are read.
            </p>
          </div>
        ) : (
          <ol className="relative mt-8 space-y-4 before:absolute before:bottom-4 before:left-[19px] before:top-4 before:w-px before:bg-line">
            {shown.map((i, n) => {
              const refused = (i.kind === "MANAGER_ACTION" && i.detail !== "OK") || i.kind === "REFUSED" || i.kind === "PAUSED";
              const dot = refused ? "border-bad/50 text-bad" : i.kind === "ESCALATED" ? "border-warn/50 text-warn" : i.kind === "NAV" ? "border-info/50 text-info" : "border-accent/50 text-accent";
              return (
                <motion.li
                  key={i.id}
                  className="relative grid grid-cols-[40px_minmax(0,1fr)] gap-4"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: reduce ? 0 : Math.min(n, 8) * 0.04 }}
                >
                  <span className={`relative z-10 mt-5 grid size-10 place-items-center rounded-full border bg-page ${dot}`}>
                    {refused ? <X size={16} weight="bold" /> : i.kind === "NAV" ? <Fingerprint size={16} /> : <Check size={16} weight="bold" />}
                  </span>
                  <Card as="article" className={refused ? "border-bad/30" : ""}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium">{feedTitle(i)}</p>
                        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{feedBody(i)}</p>
                      </div>
                      <div className="text-right">
                        {i.amount !== undefined ? <p className="font-display text-xl font-semibold tabular">{money(i.amount)}</p> : null}
                        <p className="text-xs text-muted">{inTimeZone(i.timestamp, profile.timeZone)}</p>
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-3 text-xs text-muted">
                      {i.kind === "MANAGER_ACTION" ? <ReasonChip reason={i.detail} /> : null}
                      {i.kind === "NAV" && i.detail === "FALLBACK" ? <MockTag>FALLBACK</MockTag> : null}
                      <TxLink hash={i.txHash}>transaction</TxLink>
                      {i.rationaleHash ? (
                        <Link href={`/verify?tx=${i.txHash}`} className="inline-flex items-center gap-1 transition hover:text-accent">
                          <SealCheck size={13} /> verify
                        </Link>
                      ) : null}
                      {i.modelId ? <span className="font-mono">model {modelName(i.modelId)}</span> : null}
                      {i.rationaleHash ? <span className="font-mono">fingerprint {i.rationaleHash.slice(0, 12)}…</span> : null}
                    </div>
                    {i.rationaleHash && p ? <MemoView rationaleHash={i.rationaleHash} manager={p.manager} /> : null}
                  </Card>
                </motion.li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

function Powers({ title, items, tone }: { title: string; items: string[]; tone: "ok" | "bad" }) {
  const Icon = tone === "ok" ? Check : X;
  return (
    <div className={`rounded-2xl border p-4 ${tone === "ok" ? "border-accent/20 bg-accent-soft" : "border-bad/20 bg-bad/[0.06]"}`}>
      <p className="text-sm font-medium">{title}</p>
      <ul className="mt-3 space-y-2">
        {items.map((s) => (
          <li key={s} className="flex gap-2 text-sm leading-snug text-muted">
            <Icon size={15} weight="bold" className={`mt-0.5 shrink-0 ${tone === "ok" ? "text-accent" : "text-bad"}`} />
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}
