"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowDownLeft, ArrowRight, ArrowUpRight, Cube, Skull } from "@phosphor-icons/react";
import type { Address as Addr } from "viem";
import { managerGatewayAbi, REASONS } from "@plenum/abis";
import { ChamberDial, rowsFromPlenum } from "@/components/ChamberDial";
import { ReasonChip } from "@/components/ReasonChip";
import { publicClient } from "@/lib/chain";
import { DEPLOYMENT } from "@/lib/config";
import { EVIDENCE, EVIDENCE_EXPLORER } from "@/lib/evidence";
import { EXAMPLE_GROUP, isAsyncAdapter } from "@/lib/exampleGroup";
import { money } from "@/lib/format";
import { reasonInfo } from "@/lib/reasons";
import { loadPlenum, type PlenumState } from "@/lib/plenum";
import { after, previewReason } from "@/lib/rulePreview";

/** Stand-in for "an outside address": any address the group never approved. */
const OUTSIDE: Addr = "0x000000000000000000000000000000000000dEaD";
const OP = { buy: 0, sell: 1, requestRedeem: 2 } as const;
const forcedCall = EVIDENCE.find((e) => e.tone === "bad");

type Verdict = { key: string; reason: string; block: bigint };

/**
 * "Try to break the rules": the visitor composes one move for the Showcase Club's manager (Showcase.s.sol)
 * and the verdict comes from ManagerGateway.simulate on Monad testnet, the same call the contract makes before
 * every trade. If the group can't be read, it falls back to the EXAMPLE group with the browser-side mirror.
 */
export function RuleConsole() {
  const [live, setLive] = useState<PlenumState | null>(null);
  const p = live ?? EXAMPLE_GROUP;
  const [target, setTarget] = useState<Addr | "outside">(p.sleeves[0]!.adapter);
  const [side, setSide] = useState<"buy" | "sell">("sell");
  const [pctOfValue, setPct] = useState(3);

  const outside = target === "outside";
  const assets = (p.total * BigInt(Math.round(pctOfValue * 100))) / 10_000n;
  const async = !outside && isAsyncAdapter(target);
  const move = outside ? null : { adapter: target, side, assets, async };
  const preview = move ? previewReason(p, move) : "ADAPTER_NOT_ALLOWED";
  const moveKey = `${target}:${side}:${assets}`;
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const answered = live && verdict?.key === moveKey ? verdict : null;
  const reason = answered?.reason ?? preview;

  useEffect(() => {
    const showcase = DEPLOYMENT.showcasePlenum;
    if (!showcase) return;
    loadPlenum(showcase)
      .then((s) => {
        if (s.total === 0n || s.sleeves.length === 0) return;
        setLive(s);
        setTarget(s.sleeves[0]!.adapter);
      })
      .catch(() => undefined); // keep the EXAMPLE group
  }, []);

  // Ask the contract, debounced for the public RPC's rate limit.
  useEffect(() => {
    if (!live) return;
    const t = setTimeout(async () => {
      try {
        const op = side === "buy" ? OP.buy : async ? OP.requestRedeem : OP.sell;
        const block = await publicClient.getBlockNumber();
        const code = await publicClient.readContract({
          address: live.gateway,
          abi: managerGatewayAbi,
          functionName: "simulate",
          args: [[{ adapter: outside ? OUTSIDE : (target as Addr), op, assets }]],
          blockNumber: block,
        });
        setVerdict({ key: moveKey, reason: REASONS[Number(code)] ?? "ADAPTER_NOT_ALLOWED", block });
      } catch {
        // leave the browser-side preview in place
      }
    }, 350);
    return () => clearTimeout(t);
  }, [live, moveKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => {
    const base = rowsFromPlenum(p);
    if (!move) return base;
    const a = after(p, move);
    return base.map((r) => ({ ...r, ghostBps: r.key === "cash" ? a.cashBps : a.weights[r.key.toLowerCase()] }));
  }, [p, target, side, assets]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="grid gap-6 lg:grid-cols-[1.05fr_1fr] lg:gap-10">
      <div className="space-y-6 rounded-[24px] border border-line bg-raised p-5 shadow-panel sm:p-7">
        <p className="text-xs text-muted">
          {live
            ? `${live.name}, a real group on Monad testnet. Every answer below comes from its contract. No wallet or gas needed.`
            : "Example group, previewed in your browser. Onchain, the contract makes this same call before every trade."}
        </p>
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
              {outside ? (
                <p className="text-sm text-muted">
                  There is no transfer tool to try instead. Even signed with the manager&apos;s own key, this call reverts
                  {forcedCall ? (
                    <>
                      {" "}
                      (
                      <a href={`${EVIDENCE_EXPLORER}/tx/${forcedCall.hash}`} target="_blank" rel="noreferrer" className="underline decoration-line-strong underline-offset-2 hover:text-accent">
                        see the reverted transaction
                      </a>
                      )
                    </>
                  ) : null}
                  .
                </p>
              ) : null}
            </motion.div>
          </AnimatePresence>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line pt-3 text-[11px] text-faint">
            <span className="font-mono">
              {answered
                ? `answered by ManagerGateway.simulate · Monad testnet block ${answered.block}`
                : live
                  ? "asking the contract…"
                  : "same checks as Mandate.check, in the same order"}
            </span>
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
