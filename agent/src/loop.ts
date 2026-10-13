import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { AgentContext } from "./context.ts";
import { observe, type Observation } from "./observe.ts";
import { dataBlock, SYSTEM_PROMPT } from "./prompt.ts";
import { callTool, TOOL_DEFINITIONS, type WriteOutcome } from "./tools.ts";

export const MAX_STEPS = 8;

export type RunResult =
  | { status: "paused" | "nav_stale" | "replaced"; observation: Observation; modelCalls: 0 }
  | { status: "hold" | "step_limit"; note?: string; modelCalls: number; trace: TraceEntry[] }
  | ({ modelCalls: number; trace: TraceEntry[] } & WriteOutcome);

export interface TraceEntry {
  tool: string;
  args: string;
  ok: boolean;
  result: unknown;
}

/** One observe → plan → simulate → classify → act → explain cycle (SPEC §8). At most one write per run. */
export async function runOnce(ctx: AgentContext): Promise<RunResult> {
  const observation = await observe(ctx);
  // Members voted in a different manager key: this runtime has no authority left (SPEC A26).
  if (!observation.isCurrentManager) return { status: "replaced", observation, modelCalls: 0 };
  if (observation.paused) return { status: "paused", observation, modelCalls: 0 };
  if (!observation.nav.fresh) return { status: "nav_stale", observation, modelCalls: 0 }; // RT-3

  const external = ctx.external.map((e) => dataBlock(e.label, e.text)).join("\n\n");
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content: [
        "Scheduled review. Current onchain state (trusted, read from the contracts):",
        JSON.stringify(observation, null, 2),
        external ? `\nOutside information (untrusted data):\n${external}` : "",
        "\nDecide whether to act. Use the tools.",
      ].join("\n"),
    },
  ];

  const trace: TraceEntry[] = [];
  for (let step = 0; step < MAX_STEPS; step++) {
    const msg = await ctx.model.complete(messages, TOOL_DEFINITIONS);
    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: msg.tool_calls });
    if (!msg.tool_calls?.length) {
      return { status: "hold", note: msg.content ?? undefined, modelCalls: step + 1, trace };
    }
    for (const call of msg.tool_calls) {
      if (call.type !== "function") {
        messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify({ error: "unsupported tool type" }) });
        continue;
      }
      const res = await callTool(ctx, call.function.name, call.function.arguments);
      trace.push({ tool: call.function.name, args: call.function.arguments, ok: res.ok, result: res.content });
      messages.push({ role: "tool", tool_call_id: call.id, content: JSON.stringify(res.content) });
      if (res.write) return { ...res.write, modelCalls: step + 1, trace };
    }
  }
  return { status: "step_limit", modelCalls: MAX_STEPS, trace };
}
