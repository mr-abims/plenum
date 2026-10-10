"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { PlenumState } from "@/lib/plenum";
import { adapterName } from "@/lib/config";
import type { Template } from "@/lib/templates";

/**
 * The Chamber: one ring per holding, each sweeping 270 degrees from 0% to 100% of the group's value.
 * The shaded arc is what the group's rules allow, the tick is the target, and the bright point is where
 * the money sits now. The manager can only move a point inside its shaded arc without asking members.
 * Optional outer dots are the members' seats.
 */
export interface DialRow {
  key: string;
  name: string;
  /** Current weight; null for a template preview with no money yet. */
  weightBps: number | null;
  targetBps: number;
  loBps: number;
  hiBps: number;
  ok: boolean;
  /** Weight after a proposed move (the "try to break the rules" console). */
  ghostBps?: number;
}

const C = 200;
const SWEEP = 270;
const START = 135;

const polar = (r: number, frac: number) => {
  const a = ((START + SWEEP * Math.min(Math.max(frac, 0), 1)) * Math.PI) / 180;
  return { x: Math.round((C + r * Math.cos(a)) * 100) / 100, y: Math.round((C + r * Math.sin(a)) * 100) / 100 };
};
function arc(r: number, from: number, to: number) {
  const a = polar(r, from);
  const b = polar(r, to);
  const large = (to - from) * SWEEP > 180 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`;
}

export function rowsFromPlenum(p: PlenumState): DialRow[] {
  return [
    ...p.sleeves.map((s) => ({
      key: s.adapter,
      name: s.name,
      weightBps: p.total === 0n ? null : s.weightBps,
      targetBps: s.targetBps,
      loBps: s.targetBps - s.bandBps,
      hiBps: s.targetBps + s.bandBps,
      ok: s.inBand,
    })),
    {
      key: "cash",
      name: "Cash",
      weightBps: p.total === 0n ? null : p.cashBps,
      targetBps: p.minLiquidityBps,
      loBps: p.minLiquidityBps,
      hiBps: 10_000,
      ok: p.cashBps >= p.minLiquidityBps,
    },
  ];
}

export function rowsFromTemplate(t: Template): DialRow[] {
  return [
    ...t.sleeves.map((s) => ({ key: s.adapter, name: adapterName(s.adapter), weightBps: null, targetBps: s.target, loBps: s.target - s.band, hiBps: s.target + s.band, ok: true })),
    { key: "cash", name: "Cash", weightBps: null, targetBps: t.cashFloor, loBps: t.cashFloor, hiBps: 10_000, ok: true },
  ];
}

export function ChamberDial({
  rows,
  seats = 0,
  labels = true,
  className = "",
  children,
}: {
  rows: DialRow[];
  seats?: number;
  labels?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const reduce = useReducedMotion();
  const outer = 172;
  const gap = rows.length > 4 ? 24 : 30;
  const draw = (delay: number) => (reduce ? { duration: 0 } : { duration: 1.4, delay, ease: [0.16, 1, 0.3, 1] as const });

  return (
    <div className={`relative aspect-square w-full ${className}`}>
      <svg viewBox="0 0 400 400" className="absolute inset-0 size-full overflow-visible" role="img" aria-label="Holdings against the ranges the group's rules allow">
        {seats > 0
          ? Array.from({ length: seats }, (_, i) => {
              const pt = polar(194, seats === 1 ? 0.5 : i / (seats - 1));
              return (
                <motion.circle
                  key={`seat-${i}`}
                  cx={pt.x}
                  cy={pt.y}
                  r={3.2}
                  fill="var(--ink)"
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: 0.85, scale: 1 }}
                  transition={reduce ? { duration: 0 } : { delay: 0.6 + i * 0.05, type: "spring", stiffness: 260, damping: 18 }}
                />
              );
            })
          : null}

        {rows.map((row, i) => {
          const r = outer - i * gap;
          const lo = row.loBps / 10_000;
          const hi = Math.min(row.hiBps, 10_000) / 10_000;
          const w = row.weightBps === null ? null : row.weightBps / 10_000;
          const tone = row.ok ? "var(--accent)" : "var(--warn)";
          const tick = [polar(r - 9, row.targetBps / 10_000), polar(r + 9, row.targetBps / 10_000)];
          const label = polar(r, 0);
          const pos = w === null ? null : polar(r, w);
          const ghost = row.ghostBps === undefined ? null : polar(r, row.ghostBps / 10_000);
          const ghostOk = row.ghostBps !== undefined && row.ghostBps >= row.loBps && row.ghostBps <= row.hiBps;
          return (
            <g key={row.key}>
              <path d={arc(r, 0, 1)} fill="none" stroke="var(--line)" strokeWidth={1.25} strokeLinecap="round" />
              <motion.path
                d={arc(r, lo, hi)}
                fill="none"
                stroke="var(--accent)"
                strokeOpacity={0.2}
                strokeWidth={14}
                strokeLinecap="butt"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={draw(0.15 + i * 0.08)}
              />
              <line x1={tick[0]!.x} y1={tick[0]!.y} x2={tick[1]!.x} y2={tick[1]!.y} stroke="var(--ink)" strokeOpacity={0.55} strokeWidth={1.25} />
              {w !== null ? (
                <motion.path
                  d={arc(r, 0, 1)}
                  fill="none"
                  stroke={tone}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: Math.max(w, 0.001) }}
                  transition={draw(0.3 + i * 0.08)}
                />
              ) : null}
              {ghost ? (
                <g>
                  <circle cx={ghost.x} cy={ghost.y} r={7} fill="none" stroke={ghostOk ? "var(--accent)" : "var(--bad)"} strokeWidth={1.5} strokeDasharray="2 2.5" />
                  <circle cx={ghost.x} cy={ghost.y} r={2.5} fill={ghostOk ? "var(--accent)" : "var(--bad)"} />
                </g>
              ) : null}
              {pos ? (
                <g>
                  <circle cx={pos.x} cy={pos.y} r={9} fill={tone} fillOpacity={0.18} />
                  <circle cx={pos.x} cy={pos.y} r={5} fill={tone} stroke="var(--page)" strokeWidth={2} />
                </g>
              ) : null}
              {labels ? (
                <text x={label.x + 12} y={label.y + 16} className="fill-muted font-mono" fontSize={10.5} letterSpacing="0.04em">
                  {row.name}
                  <tspan className="fill-ink" dx={6}>
                    {row.weightBps === null ? `${(row.targetBps / 100).toFixed(0)}%` : `${(row.weightBps / 100).toFixed(1)}%`}
                  </tspan>
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {children ? <div className="absolute inset-[30%] flex flex-col items-center justify-center text-center">{children}</div> : null}
    </div>
  );
}
