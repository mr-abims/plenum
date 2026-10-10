"use client";

import type { ReactNode } from "react";
import { useParams } from "next/navigation";
import type { Address as Addr } from "viem";
import { ArrowsLeftRight, Clock, Coins, Gavel, HandPalm, Hourglass, Prohibit, Scales, Swap, UserSwitch } from "@phosphor-icons/react";
import { Address } from "@/components/Address";
import { ChamberDial, rowsFromPlenum } from "@/components/ChamberDial";
import { SkeletonPanel } from "@/components/Skeleton";
import { Card, Chip, MockTag, PageHeader } from "@/components/ui";
import { pct } from "@/lib/format";
import { usePlenum } from "@/lib/usePlenum";

const duration = (s: number) => (s >= 3600 ? `${s / 3600} hour${s === 3600 ? "" : "s"}` : `${Math.round(s / 60)} minute${s === 60 ? "" : "s"}`);

export default function RulesPage() {
  const { plenum } = useParams<{ plenum: Addr }>();
  const { state: p } = usePlenum(plenum);
  if (!p) return <SkeletonPanel lines={8} />;

  return (
    <div className="space-y-8">
      <PageHeader title="The group's mandate" lead="These rules are checked by the contracts before every action. The AI manager can't change them, and can't act outside them without you.">
        <Address value={p.mandate} />
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="flex flex-col items-center justify-center">
          <div className="w-full max-w-[380px]">
            <ChamberDial rows={rowsFromPlenum(p)} seats={p.memberCount} />
          </div>
        </Card>
        <Card>
          <Group title="What it may hold">
            {p.sleeves.map((s) => (
              <Clause key={s.adapter} icon={<Swap size={16} />}>
                <span className="flex flex-wrap items-center gap-2">
                  {s.name} <MockTag />
                </span>
                <Value>
                  target {pct(s.targetBps, 0)}, allowed {pct(s.targetBps - s.bandBps, 0)} to {pct(s.targetBps + s.bandBps, 0)}
                </Value>
              </Clause>
            ))}
            <Clause icon={<Coins size={16} />}>
              Cash, kept so members can take money out
              <Value>at least {pct(p.minLiquidityBps, 0)}</Value>
            </Clause>
          </Group>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <Group title="Limits on the manager">
            <Clause icon={<Prohibit size={16} />} tone="bad">
              It can only buy or sell the assets above. There is no way for it to send money anywhere else.
            </Clause>
            <Clause icon={<Scales size={16} />}>
              One trade
              <Value>at most {pct(p.maxTradeBps, 0)} of the group's value</Value>
            </Clause>
            <Clause icon={<ArrowsLeftRight size={16} />}>
              All trades in one day
              <Value>at most {pct(p.maxDailyTurnoverBps, 0)}</Value>
            </Clause>
            <Clause icon={<Clock size={16} />}>
              Wait between trades
              <Value>{duration(p.cooldown)}</Value>
            </Clause>
            <Clause icon={<Hourglass size={16} />}>
              Oldest price it may act on
              <Value>{duration(p.navMaxAge)}, from the independent administrator</Value>
            </Clause>
          </Group>
        </Card>
        <Card>
          <Group title="What needs you">
            <Clause icon={<Gavel size={16} />}>
              Anything outside these limits becomes a proposal
              <Value>
                {pct(p.escalateQuorumBps, 0)} of members within {duration(p.votingPeriod)}
              </Value>
            </Clause>
            <Clause icon={<HandPalm size={16} />}>
              Pause the manager, instantly
              <Value>any {p.pauseQuorum} members</Value>
            </Clause>
            <Clause icon={<UserSwitch size={16} />}>
              <span className="flex flex-wrap items-center gap-2">
                Replace the manager or change these rules <Chip>Roadmap</Chip>
              </span>
              <Value>supermajority plus a 48-hour delay. Today, members can always pause.</Value>
            </Clause>
          </Group>
        </Card>
      </div>
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="font-display text-xl font-semibold tracking-tight">{title}</h2>
      <ul className="mt-5 space-y-4">{children}</ul>
    </section>
  );
}

function Clause({ icon, children, tone }: { icon: ReactNode; children: ReactNode; tone?: "bad" }) {
  return (
    <li className="flex gap-3 text-sm leading-relaxed">
      <span className={`grid size-8 shrink-0 place-items-center rounded-xl border ${tone === "bad" ? "border-bad/30 bg-bad/10 text-bad" : "border-line bg-sunk text-accent"}`}>{icon}</span>
      <span className="min-w-0 pt-1">{children}</span>
    </li>
  );
}

function Value({ children }: { children: ReactNode }) {
  return <span className="mt-0.5 block font-mono text-xs text-muted">{children}</span>;
}
