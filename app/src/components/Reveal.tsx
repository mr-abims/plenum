"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";

/** Fades content up as it enters the viewport once. Instant under reduced motion; same initial state on server and client to avoid a hydration mismatch. */
export function Reveal({ children, delay = 0, className = "", y = 18 }: { children: ReactNode; delay?: number; className?: string; y?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={reduce ? { duration: 0 } : { duration: 0.7, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}
