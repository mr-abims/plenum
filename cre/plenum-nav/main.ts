/**
 * Plenum NAV workflow — the fund administrator (SPEC §9).
 *
 * On a cron schedule (and on an HTTP trigger for on-demand runs) it reads every holding of each configured plenum
 * on Monad testnet at the last finalized block, computes NAV and per-sleeve drift, and writes a signed report
 * through the CRE forwarder to the shared NavOracle. The AI manager never writes NAV.
 */
import {
  bytesToHex,
  cre,
  encodeCallMsg,
  getNetwork,
  LAST_FINALIZED_BLOCK_NUMBER,
  prepareReportRequest,
  Runner,
  type Runtime,
} from "@chainlink/cre-sdk";
import { decodeFunctionResult, encodeFunctionData, zeroAddress, type Abi, type Address } from "viem";
import { z } from "zod";
import { iAssetAdapterAbi, mandateAbi, plenumAbi } from "./abis";
import { computeNav, encodeNavReport, type SleeveRead } from "./nav";

const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

const configSchema = z.object({
  schedule: z.string(),
  chainSelectorName: z.literal("monad-testnet"),
  navOracle: address,
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

function reportNav(runtime: Runtime<Config>): string {
  const client = evm(runtime);
  const header = client.headerByNumber(runtime, { blockNumber: LAST_FINALIZED_BLOCK_NUMBER }).result().header;
  if (!header) throw new Error("no finalized header");
  const timestamp = header.timestamp; // chain time of the block the holdings were read at (never in the future)

  const results: string[] = [];
  for (const plenum of runtime.config.plenums as Address[]) {
    const mandate = read<Address>(runtime, client, plenum, plenumAbi as Abi, "mandate");
    const cash = read<bigint>(runtime, client, plenum, plenumAbi as Abi, "cash");
    const config = read<{ adapters: readonly Address[]; targetBps: readonly number[] }>(
      runtime, client, mandate, mandateAbi as Abi, "config",
    );
    const sleeves: SleeveRead[] = config.adapters.map((adapter, i) => ({
      adapter,
      value: read<bigint>(runtime, client, adapter, iAssetAdapterAbi as Abi, "valueOf", [plenum]),
      pending: read<bigint>(runtime, client, adapter, iAssetAdapterAbi as Abi, "pendingOf", [plenum]),
      targetBps: config.targetBps[i] ?? 0,
    }));
    const nav = computeNav(cash, sleeves);
    runtime.log(`plenum ${plenum}: NAV ${nav.nav} drift ${nav.driftBps.join(",")} @ ${timestamp}`);

    const report = runtime.report(prepareReportRequest(encodeNavReport(plenum, nav, timestamp))).result();
    const reply = client
      .writeReport(runtime, {
        receiver: runtime.config.navOracle,
        report,
        gasConfig: { gasLimit: runtime.config.gasLimit }, // Monad bills the declared limit; keep it tight
      })
      .result();
    results.push(`${plenum}:${reply.txStatus}`);
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
