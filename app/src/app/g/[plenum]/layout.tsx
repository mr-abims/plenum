"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { motion } from "motion/react";
import type { Address as Addr } from "viem";
import { Gavel, House, LockKey, Robot, Scroll, UsersThree, type Icon } from "@phosphor-icons/react";
import { Address } from "@/components/Address";
import { NavBadge } from "@/components/NavBadge";
import { Seal } from "@/components/Seal";
import { Skeleton } from "@/components/Skeleton";
import { Chip } from "@/components/ui";
import { loadProposals } from "@/lib/plenum";
import { PlenumProvider, usePlenum } from "@/lib/usePlenum";

const TABS: readonly [string, "home" | "manager" | "approvals" | "data" | "members" | "rules", Icon][] = [
  ["", "home", House],
  ["/manager", "manager", Robot],
  ["/approvals", "approvals", Gavel],
  ["/data", "data", LockKey],
  ["/members", "members", UsersThree],
  ["/rules", "rules", Scroll],
];

export default function GroupLayout({ children }: { children: ReactNode }) {
  const { plenum } = useParams<{ plenum: Addr }>();
  return (
    <PlenumProvider address={plenum}>
      <Shell plenum={plenum}>{children}</Shell>
    </PlenumProvider>
  );
}

function Shell({ plenum, children }: { plenum: Addr; children: ReactNode }) {
  const path = usePathname();
  const t = useTranslations("nav");
  const { state: p } = usePlenum(plenum);
  const base = `/g/${plenum}`;
  const open = useOpenProposals(p);

  return (
    <div className="pt-6 lg:grid lg:grid-cols-[232px_minmax(0,1fr)] lg:gap-12 lg:pt-10">
      <aside className="hidden lg:block">
        <div className="sticky top-24 space-y-8">
          <div className="space-y-3">
            <Seal address={plenum} size={44} />
            {p ? <p className="font-display text-xl font-semibold leading-tight tracking-[-0.02em]">{p.name}</p> : <Skeleton className="h-6 w-40" />}
            <Address value={plenum} />
            {p ? (
              <div className="flex flex-col items-start gap-2">
                {p.paused ? <Chip tone="bad">Manager paused</Chip> : <Chip tone="accent">Manager active</Chip>}
                <NavBadge p={p} />
              </div>
            ) : null}
          </div>
          <nav aria-label="Group">
            <ul className="space-y-1">
              {TABS.map(([suffix, key, I]) => {
                const href = `${base}${suffix}`;
                const active = path === href;
                return (
                  <li key={key}>
                    <Link href={href} className={`relative flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm transition ${active ? "text-ink" : "text-muted hover:text-ink"}`}>
                      {active ? <motion.span layoutId="rail" className="absolute inset-0 rounded-xl border border-line bg-raised" transition={{ type: "spring", stiffness: 420, damping: 36 }} /> : null}
                      <I size={18} weight={active ? "fill" : "regular"} className={`relative ${active ? "text-accent" : ""}`} />
                      <span className="relative">{t(key)}</span>
                      {key === "approvals" && open > 0 ? <span className="relative ml-auto grid min-w-5 place-items-center rounded-full bg-accent px-1.5 font-mono text-[11px] text-accent-ink">{open}</span> : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>
      </aside>

      <div className="min-w-0">
        {/* Mobile group bar */}
        <div className="mb-6 flex items-center gap-3 lg:hidden">
          <Seal address={plenum} size={36} />
          <div className="min-w-0">
            {p ? <p className="truncate font-display text-lg font-semibold leading-tight">{p.name}</p> : <Skeleton className="h-5 w-36" />}
            {p ? <p className="text-xs text-muted">{p.paused ? "Manager paused" : "Manager active"}</p> : null}
          </div>
        </div>
        {children}
      </div>

      {/* Mobile tab bar */}
      <nav aria-label="Group" className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-page/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md lg:hidden">
        <ul className="mx-auto grid max-w-lg grid-cols-6">
          {TABS.map(([suffix, key, I]) => {
            const href = `${base}${suffix}`;
            const active = path === href;
            return (
              <li key={key}>
                <Link href={href} className={`relative flex min-h-15 flex-col items-center justify-center gap-1 text-[10.5px] ${active ? "text-accent" : "text-muted"}`}>
                  <I size={21} weight={active ? "fill" : "regular"} />
                  <span className="max-w-full truncate px-0.5">{t(key)}</span>
                  {key === "approvals" && open > 0 ? <span className="absolute right-[22%] top-2 size-2 rounded-full bg-accent" /> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

/** Open proposals for the rail badge; recomputed only when the group's state changes. */
function useOpenProposals(p: ReturnType<typeof usePlenum>["state"]) {
  const [open, setOpen] = useState(0);
  useEffect(() => {
    if (!p) return;
    let on = true;
    loadProposals(p)
      .then((xs) => on && setOpen(xs.filter((x) => !x.executed && x.deadline > Date.now() / 1000).length))
      .catch(() => {});
    return () => {
      on = false;
    };
  }, [p?.address, p?.total, p?.nav.timestamp]); // eslint-disable-line react-hooks/exhaustive-deps
  return open;
}
