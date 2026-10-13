import { NextResponse } from "next/server";
import { createWalletClient, http, isAddress, parseEther, verifyMessage, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { z } from "zod";
import { mockUSDAbi } from "@plenum/abis";
import { publicClient } from "@/lib/chain";
import { DEPLOYMENT, RPC_URL } from "@/lib/config";
import { onboardMessage, type OnboardResult } from "@/lib/onboard";

/**
 * MOCK testnet onboarding (SPEC A25): gives a new passkey account 10,000 MOCK test dollars and 1 MON for gas, so
 * anyone can try Plenum straight after the passkey prompt. Idempotent: test dollars only below 1,000, gas only to
 * accounts that have never sent a transaction. Monad testnet only; the faucet key never leaves the server.
 */
const MAX_SKEW_SECONDS = 300;
const MINT = 10_000n * 1_000_000n;
const MIN_BALANCE = 1_000n * 1_000_000n;
const GAS_DRIP = parseEther("1"); // a full journey (create ~0.29 MON on Monad, which bills the declared limit, plus contribute and votes) with room to spare
const FAUCET_FLOOR = parseEther("1.1");

const Body = z.object({ address: z.string(), at: z.number().int(), signature: z.string().regex(/^0x[0-9a-fA-F]+$/) }).strict();
const fail = (msg: string, status: number) => new NextResponse(msg, { status });

// One faucet key sends everything, so its transactions are serialised: concurrent requests on the same instance
// queue here, and a send that still collides on the nonce (another instance) is retried with a fresh nonce.
let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}
async function withRetry<T>(send: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await send();
    } catch (e) {
      if (attempt >= 3) throw e;
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
    }
  }
}

export async function POST(req: Request) {
  if (DEPLOYMENT.chainId !== monadTestnet.id) return fail("testnet onboarding runs on Monad testnet only", 404);
  const faucetKey = process.env.FAUCET_PRIVATE_KEY as Hex | undefined;
  if (!faucetKey) return fail("testnet onboarding is not configured", 503);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isAddress(parsed.data.address)) return fail("bad request", 400);
  const { address, at, signature } = parsed.data as { address: Address; at: number; signature: Hex };
  if (Math.abs(Date.now() / 1000 - at) > MAX_SKEW_SECONDS) return fail("signature expired", 403);
  const signed = await verifyMessage({ address, message: onboardMessage(address, at), signature }).catch(() => false);
  if (!signed) return fail("bad signature", 403);

  const faucet = privateKeyToAccount(faucetKey);
  const wallet = createWalletClient({ chain: monadTestnet, transport: http(RPC_URL), account: faucet });
  const confirm = async (hash: Hex) => {
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`transaction reverted: ${hash}`);
    return hash;
  };

  const drip = async (to: Address): Promise<Hex> => {
    for (let attempt = 0; ; attempt++) {
      const hash = await withRetry(() => wallet.sendTransaction({ to, value: GAS_DRIP, gas: 21_000n }));
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status === "success") return hash;
      if (attempt >= 1) throw new Error(`gas drip reverted: ${hash}`);
      await new Promise((r) => setTimeout(r, 3_000)); // let a few blocks pass, then retry once
    }
  };

  const [dollars, mon, sent, faucetMon] = await Promise.all([
    publicClient.readContract({ address: DEPLOYMENT.asset, abi: mockUSDAbi, functionName: "balanceOf", args: [address] }),
    publicClient.getBalance({ address }),
    publicClient.getTransactionCount({ address }),
    publicClient.getBalance({ address: faucet.address }),
  ]);
  const result: OnboardResult = { steps: [] };

  try {
    await serial(async () => {
      // Gas first. Monad's reserve-balance rule reverts a value transfer from an account below its reserve if that
      // account sent another transaction in the last few blocks, so the drip goes before the mint, with one retry.
      if (sent > 0 || mon >= GAS_DRIP / 2n) {
        result.steps.push({ step: "gas", skipped: "account already has gas or has transacted" });
      } else if (faucetMon < FAUCET_FLOOR) {
        result.steps.push({ step: "gas", skipped: "faucet is low; use faucet.monad.xyz" });
      } else {
        result.steps.push({ step: "gas", hash: await drip(address) });
      }

      if (dollars >= MIN_BALANCE) {
        result.steps.push({ step: "mint", skipped: "already has test dollars" });
      } else {
        // Monad bills the declared gas limit: estimate, then add 20%.
        const request = { address: DEPLOYMENT.asset, abi: mockUSDAbi, functionName: "mint", args: [address, MINT] } as const;
        const gas = await publicClient.estimateContractGas({ ...request, account: faucet });
        result.steps.push({ step: "mint", hash: await confirm(await withRetry(() => wallet.writeContract({ ...request, gas: (gas * 12n) / 10n }))) });
      }
    });
  } catch (e) {
    return fail(e instanceof Error ? e.message.split("\n")[0]! : String(e), 502);
  }
  return NextResponse.json(result);
}
