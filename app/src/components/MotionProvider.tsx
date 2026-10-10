"use client";

import type { ReactNode } from "react";
import { MotionConfig } from "motion/react";

/**
 * Honours the visitor's reduced-motion setting app-wide: Motion skips movement and keeps fades.
 * Components keep one `initial` state for server and client, so hydration always matches.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
