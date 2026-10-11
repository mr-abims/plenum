import type { LocalAccount } from "viem";

/**
 * Testnet onboarding (MOCK, Monad testnet only): one request, signed by the passkey account's signing session (no
 * extra prompt), gives a new account MOCK test dollars and a little MON for gas.
 */
export const onboardMessage = (address: string, at: number) => `Plenum testnet access\naccount ${address.toLowerCase()}\nat ${at}`;

export interface OnboardResult {
  steps: { step: "mint" | "gas"; hash?: string; skipped?: string }[];
}

export async function requestTestnetAccess(account: LocalAccount): Promise<OnboardResult> {
  const at = Math.floor(Date.now() / 1000);
  const signature = await account.signMessage({ message: onboardMessage(account.address, at) });
  const res = await fetch("/api/testnet/onboard", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ address: account.address, at, signature }),
  });
  if (!res.ok) throw new Error((await res.text()) || `Onboarding failed (${res.status})`);
  return res.json();
}
