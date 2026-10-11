/**
 * Plenum NAV workflow — the fund administrator (SPEC §9, A25).
 *
 * On a cron schedule (and on an HTTP trigger for on-demand runs) it:
 *   1. fetches the real gold spot price from an external market-data API on every node and agrees on the median;
 *   2. reports that price through the CRE forwarder to the gold adapter, so the gold sleeve is valued at market;
 *   3. reads every holding of each configured plenum on Monad testnet at the last finalized block, values gold at
 *      the agreed price, computes NAV and per-sleeve drift, and writes a signed report to the shared NavOracle.
 * The AI manager never writes prices or NAV.
 */
import {
  bytesToHex,
  consensusMedianAggregation,
  cre,
  encodeCallMsg,
  json,
  ok,
  getNetwork,
  LAST_FINALIZED_BLOCK_NUMBER,
  prepareReportRequest,
  Runner,
  type HTTPSendRequester,
  type Runtime,
} from "@chainlink/cre-sdk";
import { decodeFunctionResult, encodeFunctionData, parseAbi, zeroAddress, type Abi, type Address, type Hex } from "viem";
import { z } from "zod";
import { iAssetAdapterAbi, mandateAbi, mockGoldAbi, plenumAbi } from "./abis";
import { computeNav, encodeNavReport, encodePriceReport, goldValue, toUsd6, type SleeveRead } from "./nav";

/** Multicall3 (same address on every EVM chain, deployed on Monad testnet): one CallContract for many reads. */
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as Address;
const multicallAbi = parseAbi([
  "struct Call3 { address target; bool allowFailure; bytes callData; }",
  "struct Result { bool success; bytes returnData; }",
  "function aggregate3(Call3[] calls) payable returns (Result[] returnData)",
]);
type Read = { to: Address; abi: Abi; functionName: string; args?: readonly unknown[] };

const TX_STATUS = ["TX_STATUS_FATAL", "TX_STATUS_REVERTED", "TX_STATUS_SUCCESS"] as const;

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

const configSchema = z.object({
  schedule: z.string(),
  chainSelectorName: z.literal("monad-testnet"),
  navOracle: address,
  /** MOCK gold adapter that accepts CRE price reports. */
  gold: address,
  /** Keyless spot-price endpoint returning JSON with a numeric `price` in USD per troy ounce. */
  goldPriceUrl: z.string().regex(/^https:\/\/[^\s]+$/), // z.url() needs the URL global, absent in the CRE WASM runtime
  plenums: z.array(address).min(1),
  gasLimit: z.string().regex(/^[0-9]+$/),
});
type Config = z.infer<typeof configSchema>;

function evm(runtime: Runtime<Config>) {
  const network = getNetwork({ chainFamily: "evm", chainSelectorName: runtime.config.chainSelectorName, isTestnet: true });
  if (!network) throw new Error(`network ${runtime.config.chainSelectorName} not found`);
  return new cre.capabilities.EVMClient(network.chainSelector.selector);
}

function read<T>(runtime: Runtime<Config>, client: ReturnType<typeof evm>, to: Address, abi: Abi, functionName: string, args: readonly unknown[] = []): T {
  const data = encodeFunctionData({ abi, functionName, args } as never);
  const reply = client
    .callContract(runtime, {
      call: encodeCallMsg({ from: zeroAddress, to, data }),
      blockNumber: LAST_FINALIZED_BLOCK_NUMBER,
    })
    .result();
  return decodeFunctionResult({ abi, functionName, data: bytesToHex(reply.data) } as never) as T;
}

/** Runs on every node; the DON agrees on the median. */
function fetchGoldPrice(sendRequester: HTTPSendRequester, url: string): number {
  const res = sendRequester.sendRequest({ url, method: "GET" }).result();
  if (!ok(res)) throw new Error(`gold price request failed: ${res.statusCode}`);
  const price = (json(res) as { price?: unknown }).price;
  if (typeof price !== "number") throw new Error("gold price missing from response");
  return price;
}

function write(runtime: Runtime<Config>, client: ReturnType<typeof evm>, receiver: string, payload: `0x${string}`): string {
  const report = runtime.report(prepareReportRequest(payload)).result();
  const reply = client
    .writeReport(runtime, {
      receiver,
      report,
      gasConfig: { gasLimit: runtime.config.gasLimit }, // Monad bills the declared limit; keep it tight
    })
    .result();
  return TX_STATUS[reply.txStatus] ?? String(reply.txStatus);
}

/** Batches reads into one Multicall3 call: CRE limits each workflow run to 15 contract reads. */
function readMany(runtime: Runtime<Config>, client: ReturnType<typeof evm>, reads: Read[]): unknown[] {
  const calls = reads.map((r) => ({
    target: r.to,
    allowFailure: false,
    callData: encodeFunctionData({ abi: r.abi, functionName: r.functionName, args: r.args ?? [] } as never),
  }));
  const results = read<readonly { success: boolean; returnData: Hex }[]>(runtime, client, MULTICALL3, multicallAbi as Abi, "aggregate3", [calls]);
  return results.map((res, i) =>
    decodeFunctionResult({ abi: reads[i]!.abi, functionName: reads[i]!.functionName, data: res.returnData } as never),
  );
}

function reportNav(runtime: Runtime<Config>): string {
  const client = evm(runtime);
  const http = new cre.capabilities.HTTPClient();
  const header = client.headerByNumber(runtime, { blockNumber: LAST_FINALIZED_BLOCK_NUMBER }).result().header;
  if (!header) throw new Error("no finalized header");
  const timestamp = header.timestamp; // chain time of the block the holdings were read at (never in the future)

  const spot = http
    .sendRequest(runtime, fetchGoldPrice, consensusMedianAggregation<number>())(runtime.config.goldPriceUrl)
    .result();
  const goldPrice = toUsd6(spot);
  runtime.log(`gold spot ${spot} USD/oz (median across nodes)`);
  const results: string[] = [`gold:${write(runtime, client, runtime.config.gold, encodePriceReport(goldPrice, timestamp))}`];

  for (const plenum of runtime.config.plenums as Address[]) {
    const mandate = read<Address>(runtime, client, plenum, plenumAbi as Abi, "mandate");
    const cash = read<bigint>(runtime, client, plenum, plenumAbi as Abi, "cash");
    const config = read<{ adapters: readonly Address[]; targetBps: readonly number[] }>(
      runtime, client, mandate, mandateAbi as Abi, "config",
    );
    const isGold = (a: Address) => a.toLowerCase() === runtime.config.gold.toLowerCase();
    // Gold is valued at the agreed spot price (ounces × price); other sleeves at their own onchain value.
    const values = readMany(
      runtime,
      client,
      config.adapters.flatMap((adapter): Read[] => [
        isGold(adapter)
          ? { to: adapter, abi: mockGoldAbi as Abi, functionName: "ounces", args: [plenum] }
          : { to: adapter, abi: iAssetAdapterAbi as Abi, functionName: "valueOf", args: [plenum] },
        { to: adapter, abi: iAssetAdapterAbi as Abi, functionName: "pendingOf", args: [plenum] },
      ]),
    ) as bigint[];
    const sleeves: SleeveRead[] = config.adapters.map((adapter, i) => ({
      adapter,
      value: isGold(adapter) ? goldValue(values[2 * i]!, goldPrice) : values[2 * i]!,
      pending: values[2 * i + 1]!,
      targetBps: config.targetBps[i] ?? 0,
    }));
    const nav = computeNav(cash, sleeves);
    runtime.log(`plenum ${plenum}: NAV ${nav.nav} drift ${nav.driftBps.join(",")} @ ${timestamp}`);

    results.push(`${plenum}:${write(runtime, client, runtime.config.navOracle, encodeNavReport(plenum, nav, timestamp))}`);
  }
  return results.join(" ");
}

function initWorkflow(config: Config) {
  return [
    cre.handler(new cre.capabilities.CronCapability().trigger({ schedule: config.schedule }), reportNav),
    // On-demand run (e.g. on camera). Authorized keys are configured at deploy time.
    cre.handler(new cre.capabilities.HTTPCapability().trigger({}), reportNav),
  ];
}

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}
