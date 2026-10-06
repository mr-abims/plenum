import {
  createPublicClient,
  createWalletClient,
  http,
  type Abi,
  type Address,
  type Chain,
  type Hash,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { foundry, monadTestnet } from "viem/chains";

export interface Clients {
  chain: Chain;
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: PrivateKeyAccount;
}

export function makeClients(rpcUrl: string, chainId: number, privateKey: Hex): Clients {
  const chain = chainId === monadTestnet.id ? monadTestnet : foundry;
  const transport = http(rpcUrl);
  const account = privateKeyToAccount(privateKey);
  return {
    chain,
    account,
    publicClient: createPublicClient({ chain, transport }),
    walletClient: createWalletClient({ chain, transport, account }),
  };
}

/**
 * Sends a contract write with an explicit gas limit (estimate + 20%). Monad bills the declared limit, not gas used,
 * so the buffer is kept small. Waits for the receipt and throws if the transaction reverted.
 */
export async function writeWithGas(
  c: Clients,
  req: { address: Address; abi: Abi; functionName: string; args: readonly unknown[] },
): Promise<{ hash: Hash; status: "success" | "reverted" }> {
  const estimate = await c.publicClient.estimateContractGas({ ...req, account: c.account } as never);
  const hash = await c.walletClient.writeContract({
    ...req,
    account: c.account,
    chain: c.chain,
    gas: (estimate * 12n) / 10n,
  } as never);
  const receipt = await c.publicClient.waitForTransactionReceipt({ hash });
  return { hash, status: receipt.status };
}
