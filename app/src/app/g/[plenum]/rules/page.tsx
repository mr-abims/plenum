"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { Address as Addr } from "viem";
import { ArrowRight, ArrowsLeftRight, CalendarBlank, Clock, Coins, Gavel, HandPalm, Hourglass, PencilSimple, Prohibit, Scales, Swap, UserSwitch } from "@phosphor-icons/react";
import { mandateAbi } from "@plenum/abis";
import { Address } from "@/components/Address";
import { ChamberDial, rowsFromPlenum } from "@/components/ChamberDial";
import { SkeletonPanel } from "@/components/Skeleton";
import { TxSteps } from "@/components/TxSteps";
import { Button, Card, Chip, MockTag, PageHeader } from "@/components/ui";
import { send } from "@/lib/chain";
import { duration, durationAdj, inTimeZone, pct, until } from "@/lib/format";
import { configDiff } from "@/lib/rules";
import { useSession } from "@/lib/session";
import { usePlenum } from "@/lib/usePlenum";
import { useTx } from "@/lib/useTx";

export default function RulesPage() {
  const { plenum } = useParams<{ plenum: Addr }>();
  const { state: p, position, refresh } = usePlenum(plenum);
  const { session } = useSession();
  const tx = useTx();
  if (!p) return <SkeletonPanel lines={8} />;
  const member = !!(session && position?.isMember);
  const fee = (bps: number) => pct(bps, bps % 100 ? 1 : 0);
  const apply = () =>
    session &&
    tx
      .run([{ label: "Apply the new rules", run: (sent) => send(session.account, { address: p.mandate, abi: mandateAbi, functionName: "applyChange", args: [] }, sent) }])
      .then(async (ok) => {
        if (ok) await refresh();
      });

  return (
    <div className="space-y-8">
      <PageHeader title="The group's mandate" lead="These rules are checked by the contracts before every action. The AI manager can't change them, and can't act outside them without you.">
        <Address value={p.mandate} />
      </PageHeader>

      {p.pendingChange ? (
        <Card className="space-y-4 border-accent/40">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-display text-xl font-semibold tracking-tight">New rules, passed by the members</p>
              <p className="mt-1 text-sm text-muted">
                {p.pendingChange.eta <= p.now ? "The waiting period is over: anyone can apply them now." : `They apply ${until(p.pendingChange.eta, p.now)} (${inTimeZone(p.pendingChange.eta)}). Until then, anyone can leave free of charge.`}
              </p>
            </div>
            {member && p.pendingChange.eta <= p.now ? (
              <Button busy={tx.busy} disabled={tx.busy} onClick={apply}>
                Apply the new rules
              </Button>
            ) : null}
          </div>
          <ul className="space-y-1.5 font-mono text-xs text-muted">
            {configDiff(p.config, p.pendingChange.config).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <TxSteps steps={tx.steps} error={tx.error} />
        </Card>
      ) : null}

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
            {p.v2 ? (
              <>
                <Clause icon={<PencilSimple size={16} />}>
                  Change these rules
                  <Value>
                    {p.personal ? "you alone" : `${pct(p.mandateChangeBps, 0)} of members`}, then a {durationAdj(p.timelock)} wait before they apply; leaving is free during the wait
                  </Value>
                </Clause>
                <Clause icon={<UserSwitch size={16} />}>
                  Replace the AI manager
                  <Value>{p.personal ? "you alone" : `${pct(p.mandateChangeBps, 0)} of members`}, effective at once</Value>
                </Clause>
                <Clause icon={<CalendarBlank size={16} />}>
                  Investment period
                  <Value>
                    {p.periodLength
                      ? `${durationAdj(p.periodLength)} periods, renewing; free to leave for ${duration(p.exitWindow)} after each period, otherwise a ${fee(p.earlyExitFeeBps)} fee${p.personal ? " to Plenum" : `: ${pct(10_000 - p.protocolFeeCutBps, 0)} stays with the group, ${pct(p.protocolFeeCutBps, 0)} to Plenum`}`
                      : "none: leaving is always free"}
                  </Value>
                </Clause>
                {member && !p.pendingChange ? (
                  <li>
                    <Link href={`/g/${plenum}/rules/change`} className="inline-flex min-h-10 items-center gap-2 rounded-full border border-line-strong px-4 text-sm transition hover:border-accent hover:text-accent">
                      Propose a change <ArrowRight size={15} />
                    </Link>
                  </li>
                ) : null}
              </>
            ) : (
              <Clause icon={<UserSwitch size={16} />}>
                <span className="flex flex-wrap items-center gap-2">
                  Replace the manager or change these rules <Chip>Not for this group</Chip>
                </span>
                <Value>This group was created before rule changes shipped (Oct 13), so its rules are fixed. Members can always pause.</Value>
              </Clause>
            )}
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
