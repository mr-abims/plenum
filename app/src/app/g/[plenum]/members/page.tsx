"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import type { Address as Addr } from "viem";
import { Crown, HandPalm, Play } from "@phosphor-icons/react";
import { governanceAbi, plenumAbi } from "@plenum/abis";
import { Address } from "@/components/Address";
import { PasskeySheet } from "@/components/PasskeySheet";
import { QuorumSeats } from "@/components/QuorumSeats";
import { Seal } from "@/components/Seal";
import { Skeleton } from "@/components/Skeleton";
import { TxSteps } from "@/components/TxSteps";
import { Button, Card, Chip, MockTag, PageHeader } from "@/components/ui";
import { confirmWithPasskey } from "@/lib/account";
import { publicClient, send } from "@/lib/chain";
import { loadMembers, type MemberRow } from "@/lib/feed";
import { pct } from "@/lib/format";
import { isVerified } from "@/lib/plenum";
import { useSession } from "@/lib/session";
import { usePlenum } from "@/lib/usePlenum";
import { useTx } from "@/lib/useTx";

type Row = MemberRow & { units: bigint; verified: boolean };

export default function MembersPage() {
  const { plenum } = useParams<{ plenum: Addr }>();
  const { state: p, position, refresh } = usePlenum(plenum);
  const { session } = useSession();
  const [rows, setRows] = useState<Row[] | null>(null);
  const tx = useTx();

  useEffect(() => {
    if (!p) return;
    void loadMembers(p).then(async (ms) =>
      setRows(
        await Promise.all(
          ms.map(async (m) => ({
            ...m,
            units: await publicClient.readContract({ address: p.address, abi: plenumAbi, functionName: "unitsOf", args: [m.address] }),
            verified: await isVerified(m.address),
          })),
        ),
      ),
    );
  }, [p?.memberCount, p?.totalUnits]); // eslint-disable-line react-hooks/exhaustive-deps

  async function vote(fn: "pause" | "unpause") {
    if (!session || !p) return;
    const ok = await tx.run([
      { label: "Confirm it's you", kind: "passkey", run: () => confirmWithPasskey(session.account.address) },
      { label: fn === "pause" ? "Vote to pause the manager" : "Vote to resume the manager", run: (sent) => send(session.account, { address: p.governance, abi: governanceAbi, functionName: fn }, sent) },
    ]);
    if (ok) await refresh();
  }

  const share = (r: Row) => (p && p.totalUnits > 0n ? Number((r.units * 10_000n) / p.totalUnits) : 0);

  return (
    <div className="space-y-8">
      <PasskeySheet open={tx.passkey} action={p?.paused ? "Voting to resume the manager" : "Voting to pause the manager"} />
      <PageHeader title="Who's in" lead="Every member passed an identity check. Members own the group: they approve big moves and can stop the manager at any time." />

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card className="flex items-center justify-center">
          {rows && p ? <Chamber rows={rows} share={share} organizer={p.organizer} /> : <Skeleton className="aspect-square w-full max-w-[360px] rounded-full!" />}
        </Card>

        {p ? (
          <Card className={`flex flex-col ${p.paused ? "border-bad/40" : ""}`}>
            <span className={`grid size-12 place-items-center rounded-2xl border ${p.paused ? "border-bad/40 bg-bad/10 text-bad" : "border-line-strong bg-sunk text-ink"}`}>
              {p.paused ? <HandPalm size={24} weight="fill" /> : <HandPalm size={24} />}
            </span>
            <h2 className="mt-5 font-display text-2xl font-semibold tracking-[-0.02em]">{p.paused ? "The manager is paused" : "Stop the manager"}</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Any {p.pauseQuorum} members together can pause it instantly. While paused it can't trade or propose anything. Resuming takes the same number of votes.
            </p>
            <div className="mt-6 space-y-2">
              <QuorumSeats votes={p.pauseVotes} needed={p.pauseQuorum} members={Math.max(p.memberCount, p.pauseQuorum)} tone="bad" />
              <p className="font-mono text-xs text-muted">
                {p.pauseVotes} of {p.pauseQuorum} votes
              </p>
            </div>
            <div className="mt-auto space-y-4 pt-6">
              {session && position?.isMember ? (
                <Button variant={p.paused ? "secondary" : "danger"} busy={tx.busy} onClick={() => vote(p.paused ? "unpause" : "pause")}>
                  {p.paused ? <Play size={16} /> : <HandPalm size={16} />}
                  {p.paused ? "Vote to resume" : "Vote to pause"}
                </Button>
              ) : (
                <p className="text-sm text-muted">Only members can vote.</p>
              )}
              <TxSteps steps={tx.steps} error={tx.error} />
            </div>
          </Card>
        ) : (
          <Skeleton className="h-80 rounded-[20px]!" />
        )}
      </div>

      <Card>
        {!rows ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12" />
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => {
              const me = session?.account.address.toLowerCase() === r.address.toLowerCase();
              const organizer = p && r.address.toLowerCase() === p.organizer.toLowerCase();
              return (
                <li key={r.address} className="flex flex-wrap items-center gap-4 py-4 first:pt-0 last:pb-0">
                  <Seal address={r.address} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {me ? "You" : "Member"}
                      {organizer ? (
                        <span className="inline-flex items-center gap-1 text-xs font-normal text-muted">
                          <Crown size={13} /> organizer
                        </span>
                      ) : null}
                    </p>
                    <Address value={r.address} />
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm tabular">{p && p.totalUnits > 0n ? pct(share(r)) : "0%"}</p>
                    <p className="text-xs text-muted">of the group</p>
                  </div>
                  {r.verified ? <Chip tone="accent">Verified</Chip> : <Chip tone="warn">Verification lapsed</Chip>}
                </li>
              );
            })}
          </ul>
        )}
        <p className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4 text-xs text-muted">
          Verified by <MockTag>MOCK identity provider</MockTag> standing in for Cleanverse A-Pass. Names stay private: only account IDs are onchain.
        </p>
      </Card>
    </div>
  );
}

/** Members as seats around the chamber; seal size grows with each member's share. */
function Chamber({ rows, share, organizer }: { rows: Row[]; share: (r: Row) => number; organizer: string }) {
  const reduce = useReducedMotion();
  const n = rows.length;
  return (
    <div className="relative aspect-square w-full max-w-[360px]">
      <div className="absolute inset-[18%] rounded-full border border-dashed border-line-strong" />
      <div className="absolute inset-[34%] grid place-items-center rounded-full bg-accent-soft text-center">
        <div>
          <p className="font-display text-4xl font-semibold tabular">{n}</p>
          <p className="text-xs text-muted">member{n === 1 ? "" : "s"}</p>
        </div>
      </div>
      {rows.map((r, i) => {
        const frac = n === 1 ? 0.5 : i / (n - 1);
        const a = ((135 + 270 * frac) * Math.PI) / 180;
        const size = 34 + Math.round((share(r) / 10_000) * 30);
        return (
          <motion.div
            key={r.address}
            className="absolute"
            style={{ left: `${50 + 41 * Math.cos(a)}%`, top: `${50 + 41 * Math.sin(a)}%`, x: "-50%", y: "-50%" }}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: reduce ? 0 : 0.1 + i * 0.06, type: "spring", stiffness: 260, damping: 20 }}
            title={r.address}
          >
            <span className={`block rounded-full ${r.address.toLowerCase() === organizer.toLowerCase() ? "ring-2 ring-accent ring-offset-2 ring-offset-raised" : ""}`}>
              <Seal address={r.address} size={size} />
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}
