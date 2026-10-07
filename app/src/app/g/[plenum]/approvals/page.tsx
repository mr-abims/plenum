"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Address } from "viem";
import { governanceAbi } from "@plenum/abis";
import { Badge, Button, Card, Eyebrow, H1, Notice } from "@/components/ui";
import { confirmWithPasskey } from "@/lib/account";
import { send } from "@/lib/chain";
import { inTimeZone, money, pct } from "@/lib/format";
import { loadProposals, type ProposalView } from "@/lib/plenum";
import { useSession } from "@/lib/session";
import { usePlenum } from "@/lib/usePlenum";

const OP_WORDS: Record<string, string> = { Deposit: "Buy", Withdraw: "Sell", RequestRedeem: "Start selling", Claim: "Collect proceeds from" };

export default function ApprovalsPage() {
  const { plenum } = useParams<{ plenum: Address }>();
  const { state: p, position, refresh } = usePlenum(plenum);
  const { session, profile } = useSession();
  const [proposals, setProposals] = useState<ProposalView[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (p) setProposals(await loadProposals(p, session?.account.address));
  }, [p, session]);
  useEffect(() => void load(), [load]);

  async function act(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      await refresh();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message.split("\n")[0]! : String(err));
    } finally {
      setBusy(null);
    }
  }

  const now = Date.now() / 1000;
  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Approvals</Eyebrow>
        <H1>Decisions the manager can't make alone</H1>
        {p ? (
          <p className="mt-3 text-muted">
            A proposal passes when {pct(p.escalateQuorumBps, 0)} of members approve before its deadline. Approve with your
            passkey; nothing moves until then.
          </p>
        ) : null}
      </div>
      {error ? <Notice tone="bad">{error}</Notice> : null}
      {!proposals ? <p className="text-muted">Loading…</p> : proposals.length === 0 ? <p className="text-muted">No proposals yet.</p> : null}
      {proposals?.map((x) => {
        const open = !x.executed && x.deadline > now;
        return (
          <Card key={x.id.toString()} className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-medium">Proposal {x.id.toString()}</h2>
              {x.executed ? <Badge tone="ok">Carried out</Badge> : open ? <Badge>Open</Badge> : <Badge tone="warn">Expired</Badge>}
            </div>
            <ul className="space-y-1 text-sm">
              {x.actions.map((a, i) => (
                <li key={i}>
                  {OP_WORDS[a.op] ?? a.op} <strong>{a.name}</strong>: {money(a.assets)}
                </li>
              ))}
            </ul>
            <div className="grid gap-1 text-sm text-muted sm:grid-cols-2">
              <span>
                Approvals: {x.approvals} of {p?.memberCount} members {x.quorumReached ? "· enough to pass" : ""}
              </span>
              <span>Deadline: {inTimeZone(x.deadline, profile.timeZone)} ({profile.timeZone})</span>
              <span className="font-mono text-xs sm:col-span-2">reasoning {x.rationaleHash.slice(0, 18)}…</span>
            </div>
            {session && position?.isMember && open ? (
              <div className="flex flex-wrap gap-3">
                <Button
                  busy={busy === `a${x.id}`}
                  disabled={x.approvedByMe || !!busy}
                  onClick={() =>
                    act(`a${x.id}`, async () => {
                      await confirmWithPasskey(session.account.address);
                      await send(session.account, { address: p!.governance, abi: governanceAbi, functionName: "approve", args: [x.id] });
                    })
                  }
                >
                  {x.approvedByMe ? "You approved" : "Approve with passkey"}
                </Button>
                {x.quorumReached ? (
                  <Button
                    variant="secondary"
                    busy={busy === `e${x.id}`}
                    disabled={!!busy}
                    onClick={() =>
                      act(`e${x.id}`, () =>
                        send(session.account, { address: p!.governance, abi: governanceAbi, functionName: "executeProposal", args: [x.id] }).then(() => {}),
                      )
                    }
                  >
                    Carry it out
                  </Button>
                ) : null}
              </div>
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
