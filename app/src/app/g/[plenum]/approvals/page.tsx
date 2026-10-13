"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Address } from "viem";
import { CaretDown, CheckCircle, Gavel } from "@phosphor-icons/react";
import { governanceAbi } from "@plenum/abis";
import { Countdown } from "@/components/Countdown";
import { MemoView } from "@/components/MemoView";
import { PasskeySheet } from "@/components/PasskeySheet";
import { QuorumSeats } from "@/components/QuorumSeats";
import { Skeleton } from "@/components/Skeleton";
import { TxSteps } from "@/components/TxSteps";
import { Button, Card, Chip, PageHeader } from "@/components/ui";
import { confirmWithPasskey } from "@/lib/account";
import { send } from "@/lib/chain";
import { duration, inTimeZone, money, pct, short } from "@/lib/format";
import { loadProposals, type PlenumState, type ProposalView } from "@/lib/plenum";
import { configDiff } from "@/lib/rules";
import { useSession } from "@/lib/session";
import { usePlenum } from "@/lib/usePlenum";
import { useTx } from "@/lib/useTx";

const OP_WORDS: Record<string, string> = { Deposit: "Buy", Withdraw: "Sell", RequestRedeem: "Start selling", Claim: "Collect proceeds from" };

/** One-line title for any proposal kind (SPEC A26 adds rule changes and manager replacement). */
function title(x: ProposalView, withAmounts = false) {
  if (x.kind === "RULE_CHANGE") return "Change the rules";
  if (x.kind === "REPLACE_MANAGER") return `Replace the AI manager with ${short(x.newManager ?? "")}`;
  return x.actions.map((a) => `${OP_WORDS[a.op] ?? a.op} ${a.name}${withAmounts ? ` ${money(a.assets)}` : ""}`).join(", ");
}

const neededFor = (x: ProposalView, p: PlenumState | null) => (p ? Math.max(1, Math.ceil((x.thresholdBps * p.memberCount) / 10_000)) : 0);

export default function ApprovalsPage() {
  const { plenum } = useParams<{ plenum: Address }>();
  const { state: p, position, refresh } = usePlenum(plenum);
  const { session, profile } = useSession();
  const [proposals, setProposals] = useState<ProposalView[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const tx = useTx();

  const load = useCallback(async () => {
    if (p) setProposals(await loadProposals(p, session?.account.address));
  }, [p, session]);
  useEffect(() => void load(), [load]);

  const now = Date.now() / 1000;
  const open = proposals?.filter((x) => !x.executed && x.deadline > now) ?? [];
  const closed = proposals?.filter((x) => x.executed || x.deadline <= now) ?? [];
  const canAct = !!session && !!position?.isMember;

  const approve = async (x: ProposalView) => {
    if (!session || !p) return;
    setActive(`a${x.id}`);
    const ok = await tx.run([
      { label: "Confirm it's you", kind: "passkey", run: () => confirmWithPasskey(session.account.address) },
      { label: `Approve proposal ${x.id}`, run: (sent) => send(session.account, { address: p.governance, abi: governanceAbi, functionName: "approve", args: [x.id] }, sent) },
    ]);
    if (ok) await Promise.all([refresh(), load()]);
  };
  const execute = async (x: ProposalView) => {
    if (!session || !p) return;
    setActive(`e${x.id}`);
    const ok = await tx.run([
      { label: `Carry out proposal ${x.id}`, run: (sent) => send(session.account, { address: p.governance, abi: governanceAbi, functionName: "executeProposal", args: [x.id] }, sent) },
    ]);
    if (ok) await Promise.all([refresh(), load()]);
  };

  return (
    <div className="space-y-8">
      <PasskeySheet open={tx.passkey} action="Approving a proposal" />
      <PageHeader
        title="Decisions the manager can't make alone"
        lead={
          p
            ? p.personal
              ? "Bigger moves, rule changes and a new manager wait for you. Nothing changes until you approve with your passkey."
              : `A trade passes when ${pct(p.escalateQuorumBps, 0)} of members approve before its deadline; a rule change or a new manager needs ${pct(p.mandateChangeBps, 0)}. Nothing changes until then.`
            : undefined
        }
      />

      {!proposals ? (
        <Skeleton className="h-64 rounded-[20px]!" />
      ) : open.length === 0 ? (
        <div className="rounded-[20px] border border-dashed border-line-strong p-10 text-center">
          <CheckCircle size={32} weight="light" className="mx-auto text-accent" />
          <p className="mt-3 font-medium">Nothing waiting for you</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">When the manager wants to do something outside its authority, it asks here. You'll approve it with your passkey.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {open.map((x) => (
            <Card key={x.id.toString()} as="article" className="space-y-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex gap-4">
                  <span className="grid size-12 shrink-0 place-items-center rounded-2xl border border-warn/30 bg-warn/10 text-warn">
                    <Gavel size={24} weight="duotone" />
                  </span>
                  <div>
                    <p className="font-mono text-[11px] text-muted">proposal {x.id.toString()}</p>
                    <h2 className="mt-1 font-display text-2xl font-semibold tracking-[-0.02em]">{title(x)}</h2>
                  </div>
                </div>
                <Countdown deadline={x.deadline} className="text-right" />
              </div>

              {x.kind === "RULE_CHANGE" && x.newConfig && p ? (
                <div className="space-y-2">
                  <ul className="space-y-1.5 rounded-2xl border border-line bg-sunk px-4 py-3 font-mono text-xs">
                    {configDiff(p.config, x.newConfig).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <p className="text-sm text-muted">If it passes, the new rules wait {duration(p.timelock)} before they apply. Anyone can leave free of charge during the wait.</p>
                </div>
              ) : null}
              {x.kind === "REPLACE_MANAGER" ? (
                <p className="rounded-2xl border border-line bg-sunk px-4 py-3 text-sm">
                  New manager key <span className="font-mono">{x.newManager}</span>. It takes over as soon as this passes, with exactly the same limits; the current manager loses all access.
                </p>
              ) : null}
              <ul className={`grid gap-2 sm:grid-cols-2 ${x.kind === "ACTIONS" ? "" : "hidden"}`}>
                {x.actions.map((a, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-3 rounded-2xl border border-line bg-sunk px-4 py-3">
                    <span className="text-sm">
                      {OP_WORDS[a.op] ?? a.op} <span className="font-medium">{a.name}</span>
                    </span>
                    <span className="font-display text-lg font-semibold tabular">{money(a.assets)}</span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-2">
                  <QuorumSeats votes={x.approvals} needed={neededFor(x, p)} members={p?.memberCount ?? 0} />
                  <p className="text-sm text-muted">
                    {x.approvals} of {neededFor(x, p)} approvals needed{x.quorumReached ? ", enough to pass" : ""}
                  </p>
                </div>
                {canAct ? (
                  <div className="flex flex-wrap gap-3">
                    <Button busy={tx.busy && active === `a${x.id}`} disabled={x.approvedByMe || tx.busy} onClick={() => approve(x)}>
                      {x.approvedByMe ? (
                        <>
                          <CheckCircle size={16} weight="fill" /> You approved
                        </>
                      ) : (
                        "Approve with passkey"
                      )}
                    </Button>
                    {x.quorumReached ? (
                      <Button variant="secondary" busy={tx.busy && active === `e${x.id}`} disabled={tx.busy} onClick={() => execute(x)}>
                        {x.kind === "RULE_CHANGE" ? "Pass it" : "Carry it out"}
                      </Button>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-sm text-muted">Only members can approve.</p>
                )}
              </div>

              {active?.slice(1) === x.id.toString() ? <TxSteps steps={tx.steps} error={tx.error} /> : null}
              {p && x.kind === "ACTIONS" ? <MemoView rationaleHash={x.rationaleHash} manager={p.manager} /> : null}
            </Card>
          ))}
        </div>
      )}

      {closed.length ? (
        <div>
          <button onClick={() => setShowHistory(!showHistory)} className="inline-flex items-center gap-2 text-sm text-muted transition hover:text-ink" aria-expanded={showHistory}>
            <CaretDown size={14} className={`transition-transform ${showHistory ? "rotate-180" : ""}`} />
            Past proposals ({closed.length})
          </button>
          {showHistory ? (
            <ul className="mt-4 divide-y divide-line overflow-hidden rounded-[20px] border border-line bg-raised">
              {closed.map((x) => (
                <li key={x.id.toString()} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div>
                    <p className="text-sm font-medium">{title(x, true)}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      proposal {x.id.toString()} · {x.approvals} approvals · ended {inTimeZone(x.deadline, profile.timeZone)}
                    </p>
                  </div>
                  {x.executed ? <Chip tone="accent">Carried out</Chip> : <Chip tone="warn">Expired</Chip>}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
