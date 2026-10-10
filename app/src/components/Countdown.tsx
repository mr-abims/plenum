"use client";

import { useEffect, useState } from "react";
import { inTimeZone } from "@/lib/format";
import { useSession } from "@/lib/session";

export function remaining(seconds: number): string {
  if (seconds <= 0) return "ended";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h >= 24) return `${Math.floor(h / 24)} d ${h % 24} h left`;
  if (h > 0) return `${h} h ${m} min left`;
  if (m > 0) return `${m} min ${s.toString().padStart(2, "0")} s left`;
  return `${s} s left`;
}

/** Live time remaining plus the absolute deadline in the member's own time zone (GV-3). */
export function Countdown({ deadline, className = "" }: { deadline: number; className?: string }) {
  const { profile } = useSession();
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), 1000);
    return () => clearInterval(id);
  }, []);
  const left = deadline - now;
  return (
    <span className={`inline-flex flex-col ${className}`}>
      <span className={`font-mono text-sm tabular ${left <= 0 ? "text-faint" : left < 600 ? "text-warn" : "text-ink"}`}>{remaining(left)}</span>
      <span className="text-xs text-muted">
        {inTimeZone(deadline, profile.timeZone)} · {profile.timeZone.replace(/_/g, " ")}
      </span>
    </span>
  );
}

/** A thin ring that empties as time runs out; used for consent grants. */
export function TimeRing({ start, end, size = 44 }: { start: number; end: number; size?: number }) {
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() / 1000), 5000);
    return () => clearInterval(id);
  }, []);
  const frac = Math.min(Math.max((end - now) / Math.max(end - start, 1), 0), 1);
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" aria-hidden className="-rotate-90">
      <circle cx="22" cy="22" r={r} fill="none" stroke="var(--line)" strokeWidth="3" />
      <circle cx="22" cy="22" r={r} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} style={{ transition: "stroke-dashoffset 1s linear" }} />
    </svg>
  );
}
