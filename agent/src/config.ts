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
  /** Any OpenAI-compatible endpoint serving the manager model (e.g. OpenRouter). Takes priority over QWEN_*. */
  LLM_API_KEY: z.string().min(1).optional(),
  LLM_BASE_URL: z.string().url().optional(),
  LLM_MODEL: z.string().max(32).optional(),
  /** Alibaba Cloud Model Studio (Singapore, workspace endpoint). */
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
  /** The manager's ERC-8004 identity (agent NFT id in the canonical IdentityRegistry), set by scripts/register-agent.ts. */
  managerAgentId: z.number().int().nonnegative().optional(),
});
export type Deployment = z.infer<typeof DeploymentSchema>;

export function loadDeployment(chainId: number, root = join(import.meta.dirname, "../../contracts")): Deployment {
  const raw = readFileSync(join(root, "deployments", `${chainId}.json`), "utf8");
  return DeploymentSchema.parse(JSON.parse(raw));
}

/** The model endpoint the manager uses: LLM_* (e.g. OpenRouter) if set, else Alibaba Model Studio (QWEN_*). */
export function modelEndpoint(env: Env): { apiKey: string; baseURL: string; model: string; provider: string } {
  if (env.LLM_API_KEY && env.LLM_BASE_URL && env.LLM_MODEL) {
    return { apiKey: env.LLM_API_KEY, baseURL: env.LLM_BASE_URL, model: env.LLM_MODEL, provider: new URL(env.LLM_BASE_URL).host };
  }
  if (env.QWEN_API_KEY && env.QWEN_BASE_URL) {
    return { apiKey: env.QWEN_API_KEY, baseURL: env.QWEN_BASE_URL, model: env.QWEN_MODEL, provider: "alibaba-model-studio" };
  }
  throw new Error("Set LLM_API_KEY, LLM_BASE_URL and LLM_MODEL (e.g. OpenRouter) or QWEN_API_KEY and QWEN_BASE_URL");
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  return EnvSchema.parse({
    ...source,
    RPC_URL: source.RPC_URL ?? source.MONAD_TESTNET_RPC,
    CHAIN_ID: source.CHAIN_ID ?? source.MONAD_CHAIN_ID,
  });
}
