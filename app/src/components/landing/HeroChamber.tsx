"use client";

import { ChamberDial, rowsFromPlenum } from "@/components/ChamberDial";
import { AnimatedMoney } from "@/components/Money";
import { Chip } from "@/components/ui";
import { EXAMPLE_GROUP as p } from "@/lib/exampleGroup";

/** Hero figure: an EXAMPLE group (labelled) showing how a healthy plenum looks. Dashboards show live data. */
export function HeroChamber() {
  return (
    <figure className="relative">
      <div className="chamber-grid pointer-events-none absolute -inset-10" aria-hidden />
      <div className="relative mx-auto max-w-[520px]">
        <ChamberDial rows={rowsFromPlenum(p)} seats={p.memberCount}>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Group value</p>
          <p className="mt-1 font-display text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
            <AnimatedMoney amount={p.total} />
          </p>
          <p className="mt-1 text-xs text-muted">{p.memberCount} members, 5 countries</p>
        </ChamberDial>
      </div>
      <figcaption className="relative mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-muted">
        <Chip tone="accent">Every holding inside its range</Chip>
        <Chip tone="info">
          <span className="pulse relative size-1.5 rounded-full bg-info text-info" />
          Priced 42 s ago by Chainlink CRE
        </Chip>
        <span className="w-full text-center">
          Example: a five-member club on the Balanced rules. Shaded arcs are what its rules allow; bright points are where its money sits.
        </span>
      </figcaption>
    </figure>
  );
}
