import OpenAI from "openai";
import type {
  ChatCompletionMessage,
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";

/** The planning model. Production uses Qwen 3.8 Max; tests use a scripted stand-in with the same interface. */
export interface ChatModel {
  readonly id: string;
  complete(messages: ChatCompletionMessageParam[], tools: ChatCompletionTool[]): Promise<ChatCompletionMessage>;
}

/**
 * Qwen 3.8 Max over any OpenAI-compatible endpoint with function calling: Alibaba Cloud Model Studio, or OpenRouter
 * (`qwen/qwen3.8-max-0902`). The model id is committed onchain with every action, so it always names the real model.
 */
export class QwenModel implements ChatModel {
  private readonly client: OpenAI;
  /** Running token totals for this process (reported in run logs). */
  readonly usage = { calls: 0, promptTokens: 0, completionTokens: 0 };

  constructor(
    apiKey: string,
    baseURL: string,
    readonly id: string,
  ) {
    this.client = new OpenAI({ apiKey, baseURL });
  }

  async complete(messages: ChatCompletionMessageParam[], tools: ChatCompletionTool[]): Promise<ChatCompletionMessage> {
    const res = await this.client.chat.completions.create({
      model: this.id,
      messages,
      tools,
      tool_choice: "auto",
      parallel_tool_calls: false,
      temperature: 0.2,
    });
    this.usage.calls += 1;
    this.usage.promptTokens += res.usage?.prompt_tokens ?? 0;
    this.usage.completionTokens += res.usage?.completion_tokens ?? 0;
    const message = res.choices[0]?.message;
    if (!message) throw new Error("model returned no choices");
    return message;
  }
}
