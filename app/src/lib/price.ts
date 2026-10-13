import type { Hash } from "viem";
import type { PlenumState } from "./plenum";

/** True when money can't move until the group has a fresh price (the contracts refuse stale ones). */
export const needsPrice = (p: PlenumState) => !p.nav.fresh || p.nav.ageSeconds > p.navMaxAge - 90;

/**
 * Testnet only: asks the server to write a labelled FALLBACK price for the group (its onchain holdings) when the
 * Chainlink CRE price is missing or stale, so contributions and exits don't fail. Returns the transaction, if any.
 */
export async function ensureFreshPrice(p: PlenumState, sent: (hash: Hash) => void): Promise<Hash | undefined> {
  const res = await fetch("/api/testnet/price", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ plenum: p.address }) });
  if (!res.ok) throw new Error((await res.text()) || `Pricing failed (${res.status})`);
  const body = (await res.json()) as { hash?: Hash };
  if (body.hash) sent(body.hash);
  return body.hash;
}
