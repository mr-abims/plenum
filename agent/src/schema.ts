import { z } from "zod";
import { OPS } from "@plenum/abis";

/** One action as the model must express it. Assets are settlement-asset base units (6 decimals, MOCK test dollars) as a decimal string. */
export const ActionSchema = z
  .object({
    adapter: z.string().regex(/^0x[0-9a-fA-F]{40}$/, "adapter must be a 20-byte hex address"),
    op: z.enum(OPS),
    assets: z.string().regex(/^[0-9]{1,30}$/, "assets must be a base-unit integer string"),
  })
  .strict();
export type PlanAction = z.infer<typeof ActionSchema>;

/** The plan the model submits with execute_in_band or escalate. Off-schema output is discarded. */
export const PlanSchema = z
  .object({
    observations: z.array(z.string().max(400)).min(1).max(10),
    actions: z.array(ActionSchema).min(1).max(6),
    expectedWeightsBps: z.record(z.string().max(32), z.number().int().min(0).max(10_000)),
    risks: z.array(z.string().max(400)).max(10),
    language: z.string().min(2).max(5),
  })
  .strict();
export type Plan = z.infer<typeof PlanSchema>;

export const ToolArgs = {
  get_portfolio: z.object({}).strict(),
  get_mandate: z.object({}).strict(),
  get_nav: z.object({}).strict(),
  get_member_context: z
    .object({ member: z.string().regex(/^0x[0-9a-fA-F]{40}$/), grantId: z.string().regex(/^[0-9]{1,20}$/) })
    .strict(),
  simulate: z.object({ actions: z.array(ActionSchema).min(1).max(6) }).strict(),
  execute_in_band: z.object({ plan: PlanSchema }).strict(),
  escalate: z.object({ plan: PlanSchema }).strict(),
} as const;
export type ToolName = keyof typeof ToolArgs;
export const TOOL_NAMES = Object.keys(ToolArgs) as ToolName[];

/** The memo committed (as keccak256) with every action and stored encrypted for members. */
export interface Memo extends Plan {
  plenum: string;
  navTimestamp: number;
  mandateCheck: string;
  modelId: string;
  promptVersion: string;
  tool: "execute_in_band" | "escalate";
  /** The manager's ERC-8004 identity, when registered. */
  agent?: string;
}
