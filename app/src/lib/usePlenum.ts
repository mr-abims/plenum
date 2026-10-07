"use client";

import { useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { loadPlenum, loadPosition, type MemberPosition, type PlenumState } from "./plenum";
import { useSession } from "./session";

/** Live view of one plenum and the signed-in member's position; refreshes every 10 s and after actions. */
export function usePlenum(address: Address) {
  const { session } = useSession();
  const [state, setState] = useState<PlenumState | null>(null);
  const [position, setPosition] = useState<MemberPosition | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await loadPlenum(address);
      setState(s);
      setPosition(session ? await loadPosition(s, session.account.address) : null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [address, session]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(id);
  }, [refresh]);

  return { state, position, error, refresh };
}
