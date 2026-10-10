"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Fingerprint } from "@phosphor-icons/react";

/** Shown while the browser's passkey prompt is open, so the member knows why their device is asking. */
export function PasskeySheet({ open, action }: { open: boolean; action?: string }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center bg-page/70 p-4 backdrop-blur-sm sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          role="dialog"
          aria-live="polite"
          aria-label="Confirm with your passkey"
        >
          <motion.div
            className="w-full max-w-sm rounded-[24px] border border-line-strong bg-raised p-7 text-center shadow-panel"
            initial={{ y: 40, scale: 0.96 }}
            animate={{ y: 0, scale: 1 }}
            exit={reduce ? undefined : { y: 30, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
          >
            <div className="relative mx-auto grid size-20 place-items-center text-accent">
              <span className="pulse absolute inset-2 rounded-full opacity-30" />
              <span className="absolute inset-0 rounded-full border border-accent/30 bg-accent-soft" />
              <Fingerprint size={40} weight="light" className="relative" />
            </div>
            <p className="mt-5 font-display text-xl font-semibold tracking-tight">Confirm it's you</p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              {action ? `${action}. ` : ""}Use Face ID, Touch ID or your security key in the prompt your device shows.
            </p>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
