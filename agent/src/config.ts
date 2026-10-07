import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const hex = z.string().regex(/^0x[0-9a-fA-F]+$/);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);

/** Environment for the manager runtime. Validated at startup; anything missing fails fast. */
export const EnvSchema = z.object({
  RPC_URL: z.string().url(),
  CHAIN_ID: z.coerce.number().refine((id) => id === 10143 || id === 31337, "Monad testnet (10143) or local only"),
  PLENUM_ADDRESS: address,
  MANAGER_OPERATOR_KEY: hex,
  QWEN_API_KEY: z.string().min(1).optional(),
  QWEN_BASE_URL: z.string().url().optional(),
  QWEN_MODEL: z.string().default("qwen3.8-max"),
  LOOP_INTERVAL_MS: z.coerce.number().int().positive().default(300_000),
  MEMO_DIR: z.string().default(".memos"),
  MEMBER_CONTEXT_DIR: z.string().default(".member-context"),
  /** Data-room blob API (the app's /api/blobs). When set with MANAGER_ENC_SEED, memos and member context use it. */
  BLOB_API_URL: z.string().url().optional(),
  /** 32-byte hex secret for the manager's data-room key (separate from the operator key). */
  MANAGER_ENC_SEED: hex.refine((s) => s.length === 66, "32 bytes").optional(),
});
export type Env = z.infer<typeof EnvSchema>;

/** Shared addresses written by contracts/script/Deploy.s.sol. */
export const DeploymentSchema = z.object({
  chainId: z.number(),
  startBlock: z.number(),
  aToken: address,
  navOracle: address,
  consentRegistry: address,
  tbillVault: address,
  creditVault: address,
  gold: address,
  factory: address,
});
export type Deployment = z.infer<typeof DeploymentSchema>;

export function loadDeployment(chainId: number, root = join(import.meta.dirname, "../../contracts")): Deployment {
  const raw = readFileSync(join(root, "deployments", `${chainId}.json`), "utf8");
  return DeploymentSchema.parse(JSON.parse(raw));
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return EnvSchema.parse({
    ...source,
    RPC_URL: source.RPC_URL ?? source.MONAD_TESTNET_RPC,
    CHAIN_ID: source.CHAIN_ID ?? source.MONAD_CHAIN_ID,
  });
}
