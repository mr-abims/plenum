"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Fingerprint, X } from "@phosphor-icons/react";
import type { StepState } from "@/lib/useTx";
import { Notice, Spinner, TxLink } from "./ui";

/** Visible progress for a member action: passkey, sent to Monad, confirmed, with explorer links. */
export function TxSteps({ steps, error }: { steps: StepState[]; error?: string | null }) {
  const reduce = useReducedMotion();
  if (!steps.length && !error) return null;
  return (
    <div className="space-y-3">
      <ol className="space-y-2.5">
        <AnimatePresence initial={false}>
          {steps.map((s, i) => (
            <motion.li
              key={`${i}-${s.label}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduce ? 0 : i * 0.05 }}
              className="flex items-center gap-3 text-sm"
            >
              <StepIcon s={s} />
              <span className={s.status === "idle" ? "text-faint" : s.status === "error" ? "text-bad" : "text-ink"}>{s.label}</span>
              <span className="ml-auto flex items-center gap-3 font-mono text-[11px] text-muted tabular">
                {s.status === "sent" ? <span>sent to Monad</span> : null}
                {s.status === "done" && s.kind === "tx" && s.ms !== undefined ? <span>confirmed in {(s.ms / 1000).toFixed(1)} s</span> : null}
                {s.hash ? <TxLink hash={s.hash}>tx</TxLink> : null}
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
      {error ? <Notice tone="bad">{error}</Notice> : null}
    </div>
  );
}

function StepIcon({ s }: { s: StepState }) {
  const base = "grid size-6 shrink-0 place-items-center rounded-full border";
  if (s.status === "done") return <span className={`${base} border-accent bg-accent text-accent-ink`}><Check size={13} weight="bold" /></span>;
  if (s.status === "error") return <span className={`${base} border-bad bg-bad/15 text-bad`}><X size={13} weight="bold" /></span>;
  if (s.status === "active" || s.status === "sent")
    return (
      <span className={`${base} border-accent/50 text-accent`}>
        {s.kind === "passkey" ? <Fingerprint size={14} /> : <Spinner className="size-3 border-[1.5px]" />}
      </span>
    );
  return <span className={`${base} border-line-strong`} />;
}
