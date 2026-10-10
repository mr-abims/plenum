"use client";

import { CheckCircle, Clock, Gavel, Prohibit, Pulse } from "@phosphor-icons/react";
import { reasonInfo } from "@/lib/reasons";
import { Chip } from "./ui";

const ICONS = { act: CheckCircle, escalate: Gavel, wait: Clock, drop: Prohibit } as const;

/** A contract reason code with its plain-language label; the raw code is kept visible in mono for judges and auditors. */
export function ReasonChip({ reason, showCode = true }: { reason: string; showCode?: boolean }) {
  const info = reasonInfo(reason);
  const Icon = reason === "NAV_STALE" ? Pulse : ICONS[info.kind];
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <Chip tone={info.tone} icon={<Icon size={13} weight="bold" />}>
        {info.label}
      </Chip>
      {showCode ? <code className="font-mono text-[11px] text-faint">{reason}</code> : null}
    </span>
  );
}
