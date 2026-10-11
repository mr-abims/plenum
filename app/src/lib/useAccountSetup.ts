"use client";

import { useCallback, useEffect, useState } from "react";
import { erc20Abi } from "viem";
import { monadTestnet } from "viem/chains";
import type { MemberSession } from "./account";
import { publicClient } from "./chain";
import { CHAIN, DEPLOYMENT } from "./config";
import { requestTestnetAccess, type OnboardResult } from "./onboard";

export type SetupStatus = "idle" | "checking" | "setting-up" | "ready" | "error";

/**
 * Makes a signed-in account ready to transact. On Monad testnet, an account with no gas or no test dollars is set
 * up automatically through /api/testnet/onboard (MOCK), signed by the Mera signing session, so no extra prompt.
 */
export function useAccountSetup(session: MemberSession | null) {
  const [status, setStatus] = useState<SetupStatus>("idle");
  const [result, setResult] = useState<OnboardResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const address = session?.account.address;

  useEffect(() => {
    if (!session || !address) return setStatus("idle");
    let live = true;
    void (async () => {
      setStatus("checking");
      setError(null);
      try {
        const [gas, dollars] = await Promise.all([
          publicClient.getBalance({ address }),
          publicClient.readContract({ address: DEPLOYMENT.asset, abi: erc20Abi, functionName: "balanceOf", args: [address] }),
        ]);
        if ((gas > 0n && dollars > 0n) || CHAIN.id !== monadTestnet.id) {
          if (live) setStatus("ready");
          return;
        }
        if (live) setStatus("setting-up");
        const r = await requestTestnetAccess(session.account);
        if (!live) return;
        setResult(r);
        setStatus("ready");
      } catch (e) {
        if (!live) return;
        setError(e instanceof Error ? e.message.split("\n")[0]! : String(e));
        setStatus("error");
      }
    })();
    return () => {
      live = false;
    };
  }, [address, attempt]); // eslint-disable-line react-hooks/exhaustive-deps

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { status, result, error, retry, ready: status === "ready" };
}
