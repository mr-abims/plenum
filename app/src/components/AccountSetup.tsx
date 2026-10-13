"use client";

import { ArrowClockwise, Check } from "@phosphor-icons/react";
import { Button, MockTag, Notice, Spinner, TxLink } from "@/components/ui";
import type { useAccountSetup } from "@/lib/useAccountSetup";

const LABEL = { mint: "10,000 test dollars", gas: "1 MON for gas" } as const;

/** Inline status for useAccountSetup: quiet when the account was already set up. */
export function AccountSetup({ setup }: { setup: ReturnType<typeof useAccountSetup> }) {
  if (setup.status === "checking" || setup.status === "idle") return null;
  if (setup.status === "setting-up") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted" aria-live="polite">
        <Spinner /> Setting up your testnet account: test dollars and a little gas…
      </p>
    );
  }
  if (setup.status === "error") {
    return (
      <Notice tone="bad">
        <span className="flex flex-wrap items-center gap-3">
          Couldn't set up your testnet account: {setup.error}
          <Button size="sm" variant="secondary" onClick={setup.retry}>
            <ArrowClockwise size={14} /> Try again
          </Button>
        </span>
      </Notice>
    );
  }
  const done = setup.result?.steps.filter((s) => s.hash) ?? [];
  if (done.length === 0) return null;
  return (
    <div className="space-y-2 rounded-2xl border border-accent/25 bg-accent-soft p-4 text-sm" aria-live="polite">
      <p className="font-medium">Your testnet account is ready</p>
      <ul className="space-y-1">
        {done.map((s) => (
          <li key={s.step} className="flex flex-wrap items-center gap-2">
            <Check size={14} className="text-accent" /> {LABEL[s.step]} <TxLink hash={s.hash!}>tx</TxLink>
          </li>
        ))}
      </ul>
      <p className="flex items-center gap-2 text-xs text-muted">
        <MockTag>MOCK</MockTag> Testnet only. Test dollars have no value.
      </p>
    </div>
  );
}
