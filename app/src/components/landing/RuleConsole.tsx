"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Cube, Skull } from "@phosphor-icons/react";
import type { Address as Addr } from "viem";
import { ChamberDial, rowsFromPlenum } from "@/components/ChamberDial";
import { ReasonChip } from "@/components/ReasonChip";
import { EXAMPLE_GROUP as p, isAsyncAdapter } from "@/lib/exampleGroup";
import { money } from "@/lib/format";
import { reasonInfo } from "@/lib/reasons";
import { after, previewReason } from "@/lib/rulePreview";

/**
 * "Try to break the rules": the visitor composes one move for the EXAMPLE group's manager and sees the
 * answer instantly. The checks mirror Mandate.check (allowlist, size, cash floor, ranges under the
 * no-worse rule); onchain, the contract makes the same call before every trade.
 */
export function RuleConsole() {
  const [target, setTarget] = useState<Addr | "outside">(p.sleeves[0]!.adapter);
  const [side, setSide] = useState<"buy" | "sell">("sell");
  const [pctOfValue, setPct] = useState(3);

  const outside = target === "outside";
  const assets = (p.total * BigInt(Math.round(pctOfValue * 100))) / 10_000n;
  const async = !outside && isAsyncAdapter(target);
  const move = outside ? null : { adapter: target, side, assets, async };
  const reason = move ? previewReason(p, move) : "ADAPTER_NOT_ALLOWED";

  const rows = useMemo(() => {
    const base = rowsFromPlenum(p);
    if (!move) return base;
    const a = after(p, move);
    return base.map((r) => ({ ...r, ghostBps: r.key === "cash" ? a.cashBps : a.weights[r.key.toLowerCase()] }));
  }, [target, side, assets]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
      <div className="space-y-6 rounded-[24px] border border-line bg-raised p-5 shadow-panel sm:p-7">
        <p className="text-xs text-muted">Example group, previewed in your browser. Onchain, the contract makes this same call before every trade.</p>
        <fieldset>
          <legend className="text-sm font-medium">What should the manager touch?</legend>
          <div className="mt-3 flex flex-wrap gap-2">
            {p.sleeves.map((s) => (
              <Pill key={s.adapter} on={target === s.adapter} onClick={() => setTarget(s.adapter)} icon={<Cube size={15} />}>
                {s.name}
              </Pill>
            ))}
            <Pill on={outside} danger onClick={() => setTarget("outside")} icon={<Skull size={15} />}>
              An outside address
            </Pill>
          </div>
        </fieldset>

        {!outside ? (
          <fieldset>
            <legend className="text-sm font-medium">Buy or sell?</legend>
            <div className="mt-3 inline-flex rounded-full border border-line-strong bg-sunk p-1">
              {(["buy", "sell"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setSide(s)}
                  className={`relative inline-flex min-h-9 items-center gap-1.5 rounded-full px-4 text-sm transition ${side === s ? "text-accent-ink" : "text-muted hover:text-ink"}`}
                >
                  {side === s ? <motion.span layoutId="side" className="absolute inset-0 rounded-full bg-accent" transition={{ type: "spring", stiffness: 400, damping: 32 }} /> : null}
                  <span className="relative inline-flex items-center gap-1.5">
                    {s === "buy" ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                    {s === "buy" ? "Buy with cash" : "Sell for cash"}
                  </span>
                </button>
              ))}
            </div>
          </fieldset>
        ) : (
          <p className="text-sm leading-relaxed text-muted">The manager tries to send group money to an address the group never approved. This is what a stolen manager key would attempt.</p>
        )}

        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="size" className="text-sm font-medium">
              How much
            </label>
            <span className="font-mono text-sm tabular">
              {pctOfValue}% · {money(assets)}
            </span>
          </div>
          <input id="size" type="range" min={1} max={40} value={pctOfValue} onChange={(e) => setPct(Number(e.target.value))} className="mt-3 w-full accent-[var(--accent)]" />
          <p className="mt-1 font-mono text-[11px] text-faint">One trade may move at most {(p.maxTradeBps / 100).toFixed(0)}% of the group's value.</p>
        </div>

        <div className="rounded-2xl border border-line bg-sunk p-4 sm:p-5" aria-live="polite">
          <p className="text-[13px] text-muted">The rules say</p>
          <AnimatePresence mode="wait">
            <motion.div
              key={reason}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.25 }}
              className="mt-3 space-y-2"
            >
              <ReasonChip reason={reason} />
              <p className="text-sm leading-relaxed text-ink">{reasonInfo(reason).why}</p>
              {outside ? <p className="text-sm text-muted">There is no transfer tool to try instead. Even signed with the manager's own key, this call reverts.</p> : null}
            </motion.div>
          </AnimatePresence>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line pt-3 text-[11px] text-faint">
            <span className="font-mono">same checks as Mandate.check, in the same order</span>
            <a href="#evidence" className="inline-flex items-center gap-1 text-muted transition hover:text-accent">
              See it refuse on Monad <ArrowRight size={12} />
            </a>
          </div>
        </div>
      </div>

      <div className="flex flex-col items-center justify-center">
        <div className="w-full max-w-[460px]">
          <ChamberDial rows={rows}>
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">{outside ? "Destination" : "After this move"}</p>
            <p className={`mt-1 font-display text-xl font-semibold tracking-tight ${reason === "OK" ? "text-accent" : outside ? "text-bad" : "text-warn"}`}>
              {outside ? "Not on the list" : reason === "OK" ? "Allowed" : reasonInfo(reason).kind === "escalate" ? "Goes to a vote" : "Refused"}
            </p>
          </ChamberDial>
        </div>
        <p className="mt-2 max-w-sm text-center text-xs leading-relaxed text-muted">
          Dashed rings show where each holding would land. Inside the shaded arc, the manager may act alone. Outside it, members decide.
        </p>
      </div>
    </div>
  );
}

function Pill({ on, danger, onClick, icon, children }: { on: boolean; danger?: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  const active = danger ? "border-bad bg-bad/12 text-bad" : "border-accent bg-accent-soft text-accent";
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm transition active:scale-[0.98] ${on ? active : "border-line-strong text-muted hover:border-faint hover:text-ink"}`}
    >
      {icon}
      {children}
    </button>
  );
}
