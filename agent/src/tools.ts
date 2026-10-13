import { decodeEventLog, keccak256, stringToHex, toHex, type Address, type Hash } from "viem";
import type { ChatCompletionTool } from "openai/resources/chat/completions";
import { z } from "zod";
import { consentRegistryAbi, governanceAbi, managerGatewayAbi, mandateAbi, OPS, REASONS, type Reason } from "@plenum/abis";
import { canonicalJson } from "@plenum/crypto";
import { writeWithGas } from "./chain.ts";
import { classify } from "./classify.ts";
import type { AgentContext } from "./context.ts";
import { observe } from "./observe.ts";
import { dataBlock, PROMPT_VERSION } from "./prompt.ts";
import { ToolArgs, TOOL_NAMES, type Memo, type Plan, type PlanAction, type ToolName } from "./schema.ts";

export type WriteOutcome =
  | { status: "executed"; reason: Reason; txHash: Hash; memoHash: Hash }
  | { status: "refused_onchain"; reason: Reason; txHash: Hash; memoHash: Hash }
  | { status: "escalated"; proposalId: string; why: Reason; txHash: Hash; memoHash: Hash };

export interface ToolResult {
  ok: boolean;
  content: unknown;
  /** Set when a write happened; the loop stops after one write. */
  write?: WriteOutcome;
}

const json = (schema: z.ZodType) => z.toJSONSchema(schema, { target: "draft-7" }) as Record<string, unknown>;

/** Tool definitions shown to the model. There is deliberately no transfer, approve or arbitrary-call tool. */
export const TOOL_DEFINITIONS: ChatCompletionTool[] = [
  ["get_portfolio", "Holdings: cash, each sleeve's value, pending redemptions, weights vs targets and bands."],
  ["get_mandate", "The group's rules: allowed adapters, targets, bands, cash floor, size and turnover caps, investment period, breaking fee and any rule change waiting to apply."],
  ["get_nav", "Latest independent NAV report, its source (CRE or FALLBACK) and age."],
  [
    "get_member_context",
    "A member's risk summary. Only works with an active, unexpired consent grant from that member to you.",
  ],
  ["simulate", "Dry-run proposed actions through ManagerGateway.simulate and return the reason code."],
  ["execute_in_band", "Execute a plan that simulates OK. Commits a hash of the plan onchain with your model ID."],
  ["escalate", "Send a plan outside your authority to members for approval. Nothing moves until they approve."],
].map(([name, description]) => ({
  type: "function" as const,
  function: { name: name!, description: description!, parameters: json(ToolArgs[name as ToolName]) },
}));

export function toContractActions(actions: PlanAction[]) {
  // Lowercase: models often emit addresses with a wrong EIP-55 checksum, which viem would reject outright.
  return actions.map((a) => ({ adapter: a.adapter.toLowerCase() as Address, op: OPS.indexOf(a.op), assets: BigInt(a.assets) }));
}

export const canonical = canonicalJson;

export function memoHash(memo: Memo): Hash {
  return keccak256(toHex(canonical(memo)));
}

export async function simulateReason(ctx: AgentContext, actions: PlanAction[]): Promise<Reason> {
  const code = await ctx.clients.publicClient.readContract({
    address: ctx.gateway,
    abi: managerGatewayAbi,
    functionName: "simulate",
    args: [toContractActions(actions)],
  });
  return REASONS[code] ?? "ADAPTER_NOT_ALLOWED";
}

export async function callTool(ctx: AgentContext, name: string, rawArgs: string): Promise<ToolResult> {
  if (!(TOOL_NAMES as string[]).includes(name)) {
    return { ok: false, content: { error: `unknown tool "${name}"; only ${TOOL_NAMES.join(", ")} exist` } };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawArgs || "{}");
  } catch {
    return { ok: false, content: { error: "arguments were not valid JSON; discarded" } };
  }
  const args = ToolArgs[name as ToolName].safeParse(parsed);
  if (!args.success) {
    return { ok: false, content: { error: "arguments did not match the schema; discarded", issues: z.prettifyError(args.error) } };
  }

  switch (name as ToolName) {
    case "get_portfolio": {
      const o = await observe(ctx);
      return { ok: true, content: { holdings: o.holdings, pendingRedemptions: o.pendingRedemptions, paused: o.paused } };
    }
    case "get_mandate": {
      const o = await observe(ctx);
      const sleeves = o.holdings.sleeves.map(({ name, adapter, targetBps, bandBps }) => ({ name, adapter, targetBps, bandBps }));
      return { ok: true, content: { sleeves, minLiquidityBps: o.holdings.minLiquidityBps, ...o.limits, ...o.rules } };
    }
    case "get_nav": {
      const o = await observe(ctx);
      return { ok: true, content: o.nav };
    }
    case "get_member_context":
      return memberContext(ctx, args.data as z.infer<typeof ToolArgs.get_member_context>);
    case "simulate": {
      const { actions } = args.data as z.infer<typeof ToolArgs.simulate>;
      const reason = await simulateReason(ctx, actions);
      return { ok: true, content: { reason, disposition: classify(reason) } };
    }
    case "execute_in_band":
    case "escalate":
      return guardedWrite(ctx, name as "execute_in_band" | "escalate", (args.data as { plan: Plan }).plan);
  }
}

/** RT-7: decrypted member data is only released behind an active consent grant to this manager. */
async function memberContext(
  ctx: AgentContext,
  { member, grantId }: z.infer<typeof ToolArgs.get_member_context>,
): Promise<ToolResult> {
  const pc = ctx.clients.publicClient;
  const id = BigInt(grantId);
  const [active, grant] = await Promise.all([
    pc.readContract({ address: ctx.consentRegistry, abi: consentRegistryAbi, functionName: "isActive", args: [id] }),
    pc.readContract({ address: ctx.consentRegistry, abi: consentRegistryAbi, functionName: "grants", args: [id] }),
  ]);
  const [grantMember, grantee] = grant;
  const matches =
    grantMember.toLowerCase() === member.toLowerCase() &&
    grantee.toLowerCase() === ctx.clients.account.address.toLowerCase();
  if (!active || !matches) {
    return { ok: false, content: { error: "no active consent grant from this member to the manager" } };
  }
  const summary = await ctx.memberContext.get(member);
  if (!summary) return { ok: false, content: { error: "member has granted consent but shared no document" } };
  return { ok: true, content: dataBlock(`member_context_${member.slice(0, 10)}`, summary) };
}

/**
 * The only path to a write. Simulates onchain, applies the SPEC A6 disposition, then commits
 * keccak256(memo) + model ID with the transaction. The contracts re-run every check regardless.
 */
async function guardedWrite(ctx: AgentContext, tool: "execute_in_band" | "escalate", plan: Plan): Promise<ToolResult> {
  const reason = await simulateReason(ctx, plan.actions);
  const disposition = classify(reason);
  const allowed = tool === "execute_in_band" ? disposition === "inband" : disposition === "escalate";
  if (!allowed) {
    const advice =
      disposition === "escalate"
        ? "outside your authority: call escalate with this plan if you still recommend it"
        : disposition === "inband"
          ? "within your authority: use execute_in_band instead"
          : disposition === "wait"
            ? "wait for the cooldown or the next day's turnover budget; do nothing now"
            : "refused: do not retry this plan";
    return { ok: false, content: { refused: reason, advice } };
  }

  const nav = (await observe(ctx)).nav;
  const memo: Memo = {
    ...plan,
    plenum: ctx.plenum,
    navTimestamp: nav.timestamp,
    mandateCheck: reason,
    modelId: ctx.model.id,
    promptVersion: PROMPT_VERSION,
    tool,
    ...(ctx.agent ? { agent: ctx.agent } : {}),
  };
  const hash = memoHash(memo);
  await ctx.memoStore.save(hash, memo);
  const modelId = stringToHex(ctx.model.id.slice(0, 32), { size: 32 });
  const actions = toContractActions(plan.actions);

  if (tool === "execute_in_band") {
    const tx = await writeWithGas(ctx.clients, {
      address: ctx.gateway,
      abi: managerGatewayAbi,
      functionName: "executeInBand",
      args: [actions, hash, modelId],
    });
    const receipt = await ctx.clients.publicClient.getTransactionReceipt({ hash: tx.hash });
    let onchain: Reason = "OK";
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== ctx.gateway.toLowerCase()) continue;
      const ev = decodeEventLog({ abi: managerGatewayAbi, data: log.data, topics: log.topics, strict: false });
      if (ev.eventName === "ManagerAction") onchain = REASONS[(ev.args as { reason: number }).reason] ?? "OK";
    }
    const write: WriteOutcome =
      onchain === "OK"
        ? { status: "executed", reason: onchain, txHash: tx.hash, memoHash: hash }
        : { status: "refused_onchain", reason: onchain, txHash: tx.hash, memoHash: hash };
    ctx.log(`execute_in_band ${write.status}`, write);
    return { ok: onchain === "OK", content: write, write };
  }

  const tx = await writeWithGas(ctx.clients, {
    address: ctx.gateway,
    abi: managerGatewayAbi,
    functionName: "escalate",
    args: [actions, hash, modelId],
  });
  const receipt = await ctx.clients.publicClient.getTransactionReceipt({ hash: tx.hash });
  let proposalId = "?";
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== ctx.governance.toLowerCase()) continue;
    const ev = decodeEventLog({ abi: governanceAbi, data: log.data, topics: log.topics, strict: false });
    if (ev.eventName === "Escalated") proposalId = String((ev.args as { proposalId: bigint }).proposalId);
  }
  const write: WriteOutcome = { status: "escalated", proposalId, why: reason, txHash: tx.hash, memoHash: hash };
  ctx.log("escalated", write);
  return { ok: true, content: write, write };
}

export { mandateAbi };
