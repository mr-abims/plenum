"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import type { Address } from "viem";
import { governanceAbi, plenumAbi } from "@plenum/abis";
import { Badge, Button, Card, Eyebrow, H1, Notice } from "@/components/ui";
import { confirmWithPasskey } from "@/lib/account";
import { publicClient, send } from "@/lib/chain";
import { loadMembers, type MemberRow } from "@/lib/feed";
import { pct, short } from "@/lib/format";
import { isVerified } from "@/lib/plenum";
import { useSession } from "@/lib/session";
import { usePlenum } from "@/lib/usePlenum";

type Row = MemberRow & { units: bigint; verified: boolean };

export default function MembersPage() {
  const { plenum } = useParams<{ plenum: Address }>();
  const { state: p, position, refresh } = usePlenum(plenum);
  const { session } = useSession();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    setBusy(true);
    setError(null);
    try {
      await confirmWithPasskey(session.account.address);
      await send(session.account, { address: p.governance, abi: governanceAbi, functionName: fn });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message.split("\n")[0]! : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Members</Eyebrow>
        <H1>Who's in</H1>
      </div>

      {p && session && position?.isMember ? (
        <Card className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-medium">{p.paused ? "The manager is paused" : "Pause the AI manager"}</h2>
              <p className="text-sm text-muted">
                {p.pauseQuorum} members must agree. Votes so far: {p.pauseVotes} of {p.pauseQuorum}. While paused, the
                manager can't trade or propose anything.
              </p>
            </div>
            <Button variant={p.paused ? "secondary" : "danger"} busy={busy} onClick={() => vote(p.paused ? "unpause" : "pause")}>
              {p.paused ? "Vote to resume" : "Vote to pause"}
            </Button>
          </div>
          {error ? <Notice tone="bad">{error}</Notice> : null}
        </Card>
      ) : null}

      <Card>
        {!rows ? (
          <p className="text-muted">Loading…</p>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.address} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-mono text-sm">{short(r.address)}</p>
                  <p className="text-xs text-muted">
                    {p && p.totalUnits > 0n ? `${pct(Number((r.units * 10_000n) / p.totalUnits))} of the group` : "No contributions yet"}
                    {p && r.address.toLowerCase() === p.organizer.toLowerCase() ? " · organizer" : ""}
                  </p>
                </div>
                {r.verified ? <Badge tone="ok">Verified</Badge> : <Badge tone="warn">Verification lapsed</Badge>}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-xs text-muted">Verification by the <span className="text-mock">MOCK</span> identity provider standing in for Cleanverse A-Pass.</p>
      </Card>
    </div>
  );
}
