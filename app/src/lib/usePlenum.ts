"use client";

import { createContext, createElement, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Address } from "viem";
import { loadPlenum, loadPosition, type MemberPosition, type PlenumState } from "./plenum";
import { useSession } from "./session";

type Live = { state: PlenumState | null; position: MemberPosition | null; error: string | null; refresh: () => Promise<void> };

const Ctx = createContext<(Live & { address: string }) | null>(null);

/** Live view of one plenum and the signed-in member's position; refreshes every 10 s and after actions. */
function useLive(address: Address, enabled: boolean): Live {
  const { session } = useSession();
  const [state, setState] = useState<PlenumState | null>(null);
  const [position, setPosition] = useState<MemberPosition | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const s = await loadPlenum(address);
      setState(s);
      setPosition(session ? await loadPosition(s, session.account.address) : null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [address, session, enabled]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const id = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(id);
  }, [refresh, enabled]);

  return { state, position, error, refresh };
}

/** Shares one live view between the group layout and its pages, so the chain is polled once per group. */
export function PlenumProvider({ address, children }: { address: Address; children: ReactNode }) {
  const live = useLive(address, true);
  return createElement(Ctx.Provider, { value: { ...live, address: address.toLowerCase() } }, children);
}

export function usePlenum(address: Address): Live {
  const shared = useContext(Ctx);
  const own = useLive(address, !shared || shared.address !== address.toLowerCase());
  return shared && shared.address === address.toLowerCase() ? shared : own;
}
