"use client";

import { useState } from "react";
import { ArrowUpRight, Check, Copy } from "@phosphor-icons/react";
import { EXPLORER } from "@/lib/config";
import { short } from "@/lib/format";

/** Mono account address with copy and explorer link. */
export function Address({ value, full, link = true, className = "" }: { value: string; full?: boolean; link?: boolean; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 font-mono text-xs text-muted ${className}`}>
      <span className="truncate">{full ? value : short(value)}</span>
      <button
        type="button"
        aria-label="Copy address"
        className="rounded p-0.5 transition hover:text-ink"
        onClick={() => {
          void navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        }}
      >
        {copied ? <Check size={13} className="text-accent" /> : <Copy size={13} />}
      </button>
      {link && EXPLORER ? (
        <a aria-label="Open in explorer" href={`${EXPLORER}/address/${value}`} target="_blank" rel="noreferrer" className="rounded p-0.5 transition hover:text-ink">
          <ArrowUpRight size={13} />
        </a>
      ) : null}
    </span>
  );
}
