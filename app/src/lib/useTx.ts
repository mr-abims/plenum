"use client";

import { useCallback, useRef, useState } from "react";
import type { Hash } from "viem";

/** One stage of a member action: a passkey confirmation, an onchain transaction, or local work (encryption, upload). */
export interface TxStep {
  label: string;
  kind?: "passkey" | "tx" | "work";
  /** For `tx` steps pass `sent` through to `send()` so the UI can show "sent" before confirmation. */
  run: (sent: (hash: Hash) => void) => Promise<unknown>;
}

export type StepStatus = "idle" | "active" | "sent" | "done" | "error";
export interface StepState {
  label: string;
  kind: "passkey" | "tx" | "work";
  status: StepStatus;
  hash?: Hash;
  ms?: number;
}

/** Runs member actions as visible stages (see TxSteps). Returns true when every step succeeded. */
export function useTx() {
  const [steps, setSteps] = useState<StepState[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);

  const patch = (i: number, p: Partial<StepState>) => setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x)));

  const run = useCallback(async (list: TxStep[]) => {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    setError(null);
    setSteps(list.map((s) => ({ label: s.label, kind: s.kind ?? "tx", status: "idle" })));
    let i = 0;
    try {
      for (; i < list.length; i++) {
        const t0 = performance.now();
        patch(i, { status: "active" });
        await list[i]!.run((hash) => patch(i, { status: "sent", hash }));
        patch(i, { status: "done", ms: Math.round(performance.now() - t0) });
      }
      return true;
    } catch (err) {
      patch(i, { status: "error" });
      setError(err instanceof Error ? err.message.split("\n")[0]! : String(err));
      return false;
    } finally {
      running.current = false;
      setBusy(false);
    }
  }, []);

  const reset = useCallback(() => {
    setSteps([]);
    setError(null);
  }, []);

  const passkey = steps.some((s) => s.kind === "passkey" && s.status === "active");
  return { steps, error, busy, passkey, run, reset };
}
