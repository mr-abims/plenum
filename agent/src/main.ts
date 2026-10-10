import type { Address, Hex } from "viem";
import { navOracleAbi } from "@plenum/abis";
import { makeClients } from "./chain.ts";
import { loadDeployment, loadEnv, modelEndpoint } from "./config.ts";
import { buildContext } from "./context.ts";
import { runOnce } from "./loop.ts";
import { QwenModel } from "./model.ts";
import { deriveEncryptionKey } from "@plenum/crypto";
import { hexToBytes } from "viem";
import { BlobMemberContext, BlobMemoStore, FileMemberContext, FileMemoStore } from "./stores.ts";

const log = (msg: string, data?: unknown) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), msg, ...(data ? { data } : {}) }, (_, v) =>
    typeof v === "bigint" ? v.toString() : v,
  ));

async function main() {
  const env = loadEnv();
  const llm = modelEndpoint(env);
  const deployment = loadDeployment(env.CHAIN_ID);
  const clients = makeClients(env.RPC_URL, env.CHAIN_ID, env.MANAGER_OPERATOR_KEY as Hex);
  const plenum = env.PLENUM_ADDRESS as Address;
  // Data room: encrypted memos and consented member context via the blob API, else local files (dev only).
  const enc = env.MANAGER_ENC_SEED ? deriveEncryptionKey(hexToBytes(env.MANAGER_ENC_SEED as Hex)) : undefined;
  const dataRoom = env.BLOB_API_URL && enc;
  const ctx = await buildContext(
    {
      clients,
      model: new QwenModel(llm.apiKey, llm.baseURL, llm.model),
      memoStore: dataRoom ? new BlobMemoStore(clients, plenum, env.BLOB_API_URL!, enc!) : new FileMemoStore(env.MEMO_DIR),
      memberContext: dataRoom ? new BlobMemberContext(plenum, env.BLOB_API_URL!, enc!) : new FileMemberContext(env.MEMBER_CONTEXT_DIR),
      plenum,
      external: [],
      log,
    },
    deployment,
  );
  log("manager started", { plenum: ctx.plenum, manager: clients.account.address, model: llm.model, provider: llm.provider, dataRoom: Boolean(dataRoom) });

  let running = false;
  const tick = async (why: string) => {
    if (running) return;
    running = true;
    try {
      const result = await runOnce(ctx);
      log(`run (${why})`, result);
    } catch (err) {
      log("run failed", { why, error: String(err) });
    } finally {
      running = false;
    }
  };

  await tick("startup");
  if (process.argv.includes("--once")) return;
  setInterval(() => void tick("schedule"), env.LOOP_INTERVAL_MS);
  // Also run immediately on each new NAV report for this plenum (SPEC §8).
  clients.publicClient.watchContractEvent({
    address: ctx.navOracle,
    abi: navOracleAbi,
    eventName: "NavReported",
    args: { plenum: ctx.plenum },
    onLogs: () => void tick("NavReported"),
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
