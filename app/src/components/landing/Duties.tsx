"use client";

import type { ReactNode } from "react";
import { Brain, Fingerprint, Scales, Ticket } from "@phosphor-icons/react";
import { ChamberDial, rowsFromPlenum } from "@/components/ChamberDial";
import { QuorumSeats } from "@/components/QuorumSeats";
import { Reveal } from "@/components/Reveal";
import { Seal } from "@/components/Seal";
import { Chip, MockTag } from "@/components/ui";
import { ago } from "@/lib/format";
import { EXAMPLE_GROUP as p } from "@/lib/exampleGroup";

/** Separation of duties (SPEC §4): four cells, four holders, four contracts that cannot be skipped. Visuals use the EXAMPLE group. */
export function Duties() {
  return (
    <div className="grid gap-4 md:grid-cols-6">
      <Reveal className="md:col-span-4 md:row-span-1">
        <Cell
          icon={<Brain size={22} weight="duotone" />}
          duty="Manage"
          who="AI manager · Qwen 3.8 Max"
          body="Watches prices and holdings, writes its reasoning, and trades on its own only when every holding stays inside its range."
          contract="ManagerGateway + Mandate.check()"
          className="relative overflow-hidden"
          backdrop={
            <div className="pointer-events-none absolute -bottom-24 -right-16 hidden w-[340px] opacity-90 sm:block" aria-hidden>
              {p ? <ChamberDial rows={rowsFromPlenum(p)} labels={false} /> : null}
            </div>
          }
          pad="sm:pr-[280px]"
        />
      </Reveal>
      <Reveal className="md:col-span-2" delay={0.08}>
        <Cell
          icon={<Scales size={22} weight="duotone" />}
          duty="Price"
          who="Chainlink CRE workflow"
          body="An independent administrator values the fund. The manager can't act on an old price and never writes one."
          contract="NavOracle"
          tint="bg-info/[0.06] border-info/20"
          visual={
            p && p.nav.timestamp ? (
              <div className="mt-5 flex items-center gap-2 font-mono text-xs text-info">
                <span className={`relative size-2 rounded-full ${p.nav.fresh ? "pulse bg-info text-info" : "bg-warn"}`} />
                last priced {ago(p.nav.ageSeconds)} by {p.nav.source === "CRE" ? "CRE" : <MockTag>FALLBACK</MockTag>}
              </div>
            ) : null
          }
        />
      </Reveal>
      <Reveal className="md:col-span-2" delay={0.04}>
        <Cell
          icon={<Ticket size={22} weight="duotone" />}
          duty="Admit"
          who="Members, by signed invite"
          body="Only someone holding an invite signed by a member can join. The contract checks the signature, the expiry and the size limit, which is one for a personal portfolio."
          contract="Plenum.join · EIP-712 invite"
          tint="bg-sunk"
          visual={
            p ? (
              <div className="mt-5 flex items-center gap-3">
                <Seal address={p.organizer} size={34} />
                <Chip tone="accent">Invited by a member</Chip>
              </div>
            ) : null
          }
        />
      </Reveal>
      <Reveal className="md:col-span-4" delay={0.12}>
        <Cell
          icon={<Fingerprint size={22} weight="duotone" />}
          duty="Own & decide"
          who="Members, or just you, signing with passkeys"
          body="Members approve anything outside the rules, can pause the manager instantly, change the rules by a two-thirds vote, or replace the manager outright. In a personal portfolio, that is just you. No seed phrases, no extensions."
          contract="Governance"
          tint="bg-accent-soft border-accent/20"
          visual={
            p ? (
              <div className="mt-5 space-y-2">
                <QuorumSeats votes={0} needed={p.pauseQuorum} members={Math.max(p.memberCount, p.pauseQuorum)} />
                <p className="font-mono text-[11px] text-muted">
                  any {p.pauseQuorum} members can pause it, instantly
                </p>
              </div>
            ) : null
          }
        />
      </Reveal>
    </div>
  );
}

function Cell({
  icon,
  duty,
  who,
  body,
  contract,
  visual,
  backdrop,
  tint = "bg-raised",
  className = "",
  pad = "",
}: {
  icon: ReactNode;
  duty: string;
  who: ReactNode;
  body: string;
  contract: string;
  visual?: ReactNode;
  backdrop?: ReactNode;
  tint?: string;
  className?: string;
  pad?: string;
}) {
  return (
    <article className={`flex h-full min-h-[260px] flex-col rounded-[24px] border border-line p-6 sm:p-7 ${tint} ${className}`}>
      <div className={`relative flex h-full flex-col ${pad}`}>
        <div className="flex items-center gap-3 text-accent">{icon}</div>
        <h3 className="mt-5 font-display text-2xl font-semibold tracking-[-0.02em]">{duty}</h3>
        <p className="mt-1 text-sm text-muted">{who}</p>
        <p className="mt-4 max-w-md text-[15px] leading-relaxed">{body}</p>
        {visual}
        <p className="mt-auto pt-6 font-mono text-[11px] text-faint">enforced by {contract}</p>
      </div>
      {backdrop}
    </article>
  );
}
