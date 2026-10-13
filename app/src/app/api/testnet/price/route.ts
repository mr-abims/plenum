import { NextResponse } from "next/server";
import { createWalletClient, http, isAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";
import { z } from "zod";
import { mandateAbi, navOracleAbi, plenumAbi, plenumFactoryAbi } from "@plenum/abis";
import { publicClient } from "@/lib/chain";
import { DEPLOYMENT, RPC_URL } from "@/lib/config";

/**
 * FALLBACK pricing for testnet groups (labelled FALLBACK everywhere, SPEC A9/A26). The Chainlink CRE workflow is the
 * administrator; this route only keeps groups usable between CRE runs: when a group's price is missing or older than
 * half its allowed age, it writes the group's onchain holdings (cash plus every allowlisted asset at its adapter's
 * value) through the NavOracle's labelled FALLBACK writer. Only genuine Plenum groups (EIP-1167 clones of a factory's
 * Plenum implementation) are priced. Monad testnet only; the writer key never leaves the server.
 */
const Body = z.object({ plenum: z.string() }).strict();
const CLONE = /^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3$/i;
const fail = (msg: string, status: number) => new NextResponse(msg, { status });

let queue: Promise<unknown> = Promise.resolve();
function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

export async function POST(req: Request) {
  if (DEPLOYMENT.chainId !== monadTestnet.id) return fail("FALLBACK pricing runs on Monad testnet only", 404);
  const key = process.env.FALLBACK_NAV_WRITER_KEY as Hex | undefined;
  if (!key) return fail("FALLBACK pricing is not configured", 503);
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !isAddress(parsed.data.plenum)) return fail("bad request", 400);
  const plenum = parsed.data.plenum as Address;

  const factories = [DEPLOYMENT.factory, DEPLOYMENT.factoryV1].filter((f): f is Address => !!f);
  const [code, impls] = await Promise.all([
    publicClient.getCode({ address: plenum }),
    Promise.all(factories.map((f) => publicClient.readContract({ address: f, abi: plenumFactoryAbi, functionName: "plenumImpl" }))),
  ]);
  const impl = code?.match(CLONE)?.[1];
  if (!impl || !impls.some((i) => i.toLowerCase() === `0x${impl}`.toLowerCase())) return fail("not a Plenum group", 404);

  const mandate = await publicClient.readContract({ address: plenum, abi: plenumAbi, functionName: "mandate" });
  const [report, maxAge, block] = await Promise.all([
    publicClient.readContract({ address: DEPLOYMENT.navOracle, abi: navOracleAbi, functionName: "latest", args: [plenum] }),
    publicClient.readContract({ address: mandate, abi: mandateAbi, functionName: "navMaxAge" }),
    publicClient.getBlock(),
  ]);
  const age = Number(block.timestamp) - Number(report.timestamp);
  if (report.timestamp !== 0n && age < maxAge / 2) return NextResponse.json({ skipped: "price is fresh", ageSeconds: age });

  const writer = privateKeyToAccount(key);
  const wallet = createWalletClient({ chain: monadTestnet, transport: http(RPC_URL), account: writer });
  try {
    const hash = await serial(async () => {
      const nav = await publicClient.readContract({ address: mandate, abi: mandateAbi, functionName: "holdingsTotal" });
      const request = { address: DEPLOYMENT.navOracle, abi: navOracleAbi, functionName: "fallbackWrite", args: [plenum, nav] } as const;
      // Monad bills the declared gas limit: estimate, then add 20%; fee pinned near the base fee.
      const [gas, latest] = await Promise.all([publicClient.estimateContractGas({ ...request, account: writer }), publicClient.getBlock()]);
      const tip = 2_000_000_000n;
      for (let attempt = 0; ; attempt++) {
        try {
          const h = await wallet.writeContract({ ...request, gas: (gas * 12n) / 10n, maxFeePerGas: (latest.baseFeePerGas ?? 100_000_000_000n) + tip, maxPriorityFeePerGas: tip });
          const receipt = await publicClient.waitForTransactionReceipt({ hash: h });
          if (receipt.status !== "success") throw new Error(`FALLBACK price reverted: ${h}`);
          return h;
        } catch (e) {
          if (attempt >= 2) throw e;
          await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        }
      }
    });
    return NextResponse.json({ hash });
  } catch (e) {
    return fail(e instanceof Error ? e.message.split("\n")[0]! : String(e), 502);
  }
}
