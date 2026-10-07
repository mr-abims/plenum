import type { PlenumState } from "@/lib/plenum";
import { pct } from "@/lib/format";

/** Each holding's weight against its target and allowed band (SPEC §11, Group home). */
export function Allocation({ p }: { p: PlenumState }) {
  const rows = [
    ...p.sleeves.map((s) => ({ name: s.name, w: s.weightBps, lo: s.targetBps - s.bandBps, hi: s.targetBps + s.bandBps, target: s.targetBps, ok: s.inBand, pending: s.pending > 0n })),
    { name: "Cash", w: p.cashBps, lo: p.minLiquidityBps, hi: 10_000, target: p.minLiquidityBps, ok: p.cashBps >= p.minLiquidityBps, pending: false },
  ];
  return (
    <ul className="space-y-4">
      {rows.map((r) => (
        <li key={r.name}>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">
              {r.name} {r.pending ? <span className="text-xs font-normal text-muted">(includes money on its way back)</span> : null}
            </span>
            <span className={`tabular ${r.ok ? "text-muted" : "text-warn"}`}>
              {pct(r.w)} <span className="text-xs">{r.name === "Cash" ? `min ${pct(r.lo, 0)}` : `target ${pct(r.target, 0)}`}</span>
            </span>
          </div>
          <div className="relative mt-1.5 h-2 rounded-full bg-paper">
            <div className="absolute inset-y-0 rounded-full bg-accent/15" style={{ left: `${r.lo / 100}%`, width: `${Math.max(0, Math.min(r.hi, 10_000) - r.lo) / 100}%` }} />
            <div className={`absolute inset-y-0 w-1.5 rounded-full ${r.ok ? "bg-accent" : "bg-warn"}`} style={{ left: `calc(${Math.min(r.w, 10_000) / 100}% - 3px)` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
