"use client";

import { useParams } from "next/navigation";
import type { Address } from "viem";
import { Card, Eyebrow, H1 } from "@/components/ui";
import { pct } from "@/lib/format";
import { usePlenum } from "@/lib/usePlenum";

export default function RulesPage() {
  const { plenum } = useParams<{ plenum: Address }>();
  const { state: p } = usePlenum(plenum);
  if (!p) return <p className="text-muted">Loading…</p>;
  const minutes = (s: number) => (s >= 3600 ? `${s / 3600} hours` : `${Math.round(s / 60)} minutes`);
  return (
    <div className="space-y-6">
      <div>
        <Eyebrow>Rules</Eyebrow>
        <H1>The group's mandate</H1>
        <p className="mt-3 max-w-2xl text-muted">These rules are enforced by the contracts on every action. The AI manager cannot change them.</p>
      </div>
      <Card>
        <h2 className="mb-3 font-medium">What the manager may hold</h2>
        <ul className="divide-y divide-line text-sm">
          {p.sleeves.map((s) => (
            <li key={s.adapter} className="flex justify-between py-2.5">
              <span>{s.name}</span>
              <span className="tabular text-muted">
                {pct(s.targetBps, 0)}, allowed {pct(s.targetBps - s.bandBps, 0)}–{pct(s.targetBps + s.bandBps, 0)}
              </span>
            </li>
          ))}
          <li className="flex justify-between py-2.5">
            <span>Cash</span>
            <span className="tabular text-muted">at least {pct(p.minLiquidityBps, 0)}</span>
          </li>
        </ul>
      </Card>
      <Card>
        <h2 className="mb-3 font-medium">Limits on the manager</h2>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
          <li>It can only buy or sell the assets above. There is no way for it to send money anywhere else.</li>
          <li>A single trade can be at most {pct(p.maxTradeBps, 0)} of the group's value.</li>
          <li>All its trades in one day can add up to at most {pct(p.maxDailyTurnoverBps, 0)}.</li>
          <li>It must wait {minutes(p.cooldown)} between trades.</li>
          <li>It can't act on a valuation older than {minutes(p.navMaxAge)}. Valuations come from an independent administrator.</li>
          <li>Anything else becomes a proposal: {pct(p.escalateQuorumBps, 0)} of members must approve within {minutes(p.votingPeriod)}.</li>
          <li>Any {p.pauseQuorum} members can pause it at any time.</li>
        </ul>
      </Card>
      <Card>
        <h2 className="mb-2 font-medium">Changing the rules or the manager</h2>
        <p className="text-sm text-muted">
          Replacing the manager and changing the mandate (supermajority plus a 48-hour delay) are on the roadmap. Today,
          members can always pause the manager.
        </p>
      </Card>
    </div>
  );
}
