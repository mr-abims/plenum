"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * Seats filling toward a quorum: filled = voted, ring = still needed, faint = members beyond the quorum.
 * Used for proposal approvals and the k-of-n pause.
 */
export function QuorumSeats({ votes, needed, members, tone = "accent" }: { votes: number; needed: number; members: number; tone?: "accent" | "bad" }) {
  const reduce = useReducedMotion();
  const total = Math.max(members, needed, votes);
  const color = tone === "bad" ? "var(--bad)" : "var(--accent)";
  return (
    <div className="flex flex-wrap items-center gap-1.5" role="img" aria-label={`${votes} of ${needed} needed`}>
      {Array.from({ length: total }, (_, i) => {
        const filled = i < votes;
        const required = i < needed;
        return (
          <motion.span
            key={i}
            className="size-3.5 rounded-full border-[1.5px]"
            style={{ borderColor: required || filled ? color : "var(--line-strong)", background: filled ? color : "transparent", opacity: required || filled ? 1 : 0.5 }}
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: required || filled ? 1 : 0.5 }}
            transition={{ delay: reduce ? 0 : i * 0.04, type: "spring", stiffness: 400, damping: 22 }}
          />
        );
      })}
    </div>
  );
}
