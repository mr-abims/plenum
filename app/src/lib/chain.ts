import { createPublicClient, http, type Abi, type Address, type Hash, type LocalAccount } from "viem";
import { createWalletClient } from "viem";
import { CHAIN, RPC_URL } from "./config";

export const publicClient = createPublicClient({ chain: CHAIN, transport: http(RPC_URL) });

/**
 * Sends a contract write with an explicit gas limit (estimate + 20%): Monad bills the declared limit, not gas used.
 * Throws if the transaction reverts.
 */
export async function send(
  account: LocalAccount,
  req: { address: Address; abi: Abi; functionName: string; args?: readonly unknown[] },
): Promise<Hash> {
  const wallet = createWalletClient({ chain: CHAIN, transport: http(RPC_URL), account });
  const estimate = await publicClient.estimateContractGas({ ...req, account } as never);
  const hash = await wallet.writeContract({ ...req, account, chain: CHAIN, gas: (estimate * 12n) / 10n } as never);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`Transaction reverted: ${hash}`);
  return hash;
}
