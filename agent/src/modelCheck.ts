// One live tool-calling request against the configured model endpoint. Usage: pnpm model-check
import { loadEnv, modelEndpoint } from "./config.ts";
import { QwenModel } from "./model.ts";

const env = loadEnv();
const llm = modelEndpoint(env);
const model = new QwenModel(llm.apiKey, llm.baseURL, llm.model);
const t0 = Date.now();
const msg = await model.complete(
  [{ role: "user", content: "Check the current NAV using the tool, then stop." }],
  [{ type: "function", function: { name: "get_nav", description: "Latest NAV", parameters: { type: "object", properties: {}, additionalProperties: false } } }],
);
const calls = msg.tool_calls?.map((c) => (c.type === "function" ? c.function.name : c.type)) ?? [];
console.log(JSON.stringify({ provider: llm.provider, model: llm.model, ms: Date.now() - t0, toolCalls: calls }));
if (!calls.includes("get_nav")) process.exitCode = 1;
