import type { PlenumState } from "@/lib/plenum";
import { money, pct } from "@/lib/format";

/** Each holding's weight against its target and allowed band (SPEC §11, Group home). Text twin of ChamberDial. */
export function Allocation({ p }: { p: PlenumState }) {
  const rows = [
    ...p.sleeves.map((s) => ({ name: s.name, value: s.value + s.pending, w: s.weightBps, lo: s.targetBps - s.bandBps, hi: s.targetBps + s.bandBps, target: s.targetBps, ok: s.inBand, pending: s.pending > 0n, mock: true })),
    { name: "Cash", value: p.cash, w: p.cashBps, lo: p.minLiquidityBps, hi: 10_000, target: p.minLiquidityBps, ok: p.cashBps >= p.minLiquidityBps, pending: false, mock: false },
  ];
  return (
    <ul className="space-y-5">
      {rows.map((r) => (
        <li key={r.name}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium">
              {r.name}
              {r.mock ? <span className="ml-2 font-mono text-[10px] text-mock">MOCK</span> : null}
            </span>
            <span className={`font-mono text-sm tabular ${r.ok ? "text-ink" : "text-warn"}`}>{pct(r.w)}</span>
          </div>
          <div className="relative mt-2 h-1.5 rounded-full bg-well">
            <div className="absolute inset-y-0 rounded-full bg-accent/25" style={{ left: `${r.lo / 100}%`, width: `${Math.max(0, Math.min(r.hi, 10_000) - r.lo) / 100}%` }} />
            <div
              className={`absolute -top-1 size-3.5 rounded-full border-2 border-raised ${r.ok ? "bg-accent" : "bg-warn"}`}
              style={{ left: `calc(${Math.min(r.w, 10_000) / 100}% - 7px)`, transition: "left 0.9s cubic-bezier(0.16,1,0.3,1)" }}
            />
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[11px] text-faint tabular">
            <span>{money(r.value)}</span>
            <span>
              {r.name === "Cash" ? `at least ${pct(r.lo, 0)}` : `allowed ${pct(r.lo, 0)} to ${pct(r.hi, 0)}`}
              {r.pending ? " · includes money on its way back" : ""}
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}
