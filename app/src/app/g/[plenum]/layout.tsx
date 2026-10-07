"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

const TABS = [
  ["", "home"],
  ["/manager", "manager"],
  ["/approvals", "approvals"],
  ["/data", "data"],
  ["/members", "members"],
  ["/rules", "rules"],
] as const;

export default function GroupLayout({ children }: { children: ReactNode }) {
  const { plenum } = useParams<{ plenum: string }>();
  const path = usePathname();
  const t = useTranslations("nav");
  const base = `/g/${plenum}`;
  return (
    <div>
      <nav className="-mx-4 mb-8 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
        <ul className="flex min-w-max gap-6 text-sm">
          {TABS.map(([suffix, key]) => {
            const href = `${base}${suffix}`;
            const active = path === href;
            return (
              <li key={key}>
                <Link
                  href={href}
                  className={`inline-block border-b-2 pb-3 pt-1 ${active ? "border-accent font-medium text-ink" : "border-transparent text-muted hover:text-ink"}`}
                >
                  {t(key)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      {children}
    </div>
  );
}
