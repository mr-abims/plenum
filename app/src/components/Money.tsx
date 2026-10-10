"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useReducedMotion } from "motion/react";
import { money } from "@/lib/format";
import { USD } from "@/lib/plenum";
import { useSession } from "@/lib/session";

/**
 * An amount that rolls to its new value when it changes. Server and first client render show the real
 * value (no hydration mismatch, correct with reduced motion); later changes count from the old value.
 */
export function AnimatedMoney({ amount, currency = "USD", rate = 1 }: { amount: bigint; currency?: string; rate?: number }) {
  const reduce = useReducedMotion();
  const usd = Number(amount) / Number(USD);
  const [shown, setShown] = useState(usd);
  const from = useRef(usd);
  useEffect(() => {
    if (reduce || from.current === usd) {
      from.current = usd;
      setShown(usd);
      return;
    }
    const c = animate(from.current, usd, { duration: 1.1, ease: [0.16, 1, 0.3, 1], onUpdate: setShown });
    from.current = usd;
    return () => c.stop();
  }, [usd, reduce]);
  return <span className="tabular">{money(BigInt(Math.round(shown * Number(USD))), currency, rate)}</span>;
}

/** Big amount in the member's currency, with the USD figure underneath when they differ (SPEC §11 copy rule). */
export function Money({ amount, size = "xl", sub }: { amount: bigint; size?: "md" | "xl"; sub?: string }) {
  const { profile, rate } = useSession();
  const local = profile.currency !== "USD";
  return (
    <div>
      <div className={size === "xl" ? "font-display text-5xl font-semibold tracking-[-0.035em] sm:text-6xl" : "font-display text-2xl font-semibold tracking-[-0.02em]"}>
        <AnimatedMoney amount={amount} currency={profile.currency} rate={local ? rate : 1} />
      </div>
      <p className="mt-1.5 font-mono text-xs text-muted tabular">
        {local ? `${money(amount, "USD")} · ${profile.currency} at an indicative rate` : sub ?? "US dollars, the group's settlement currency"}
      </p>
    </div>
  );
}
