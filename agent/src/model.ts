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

/** Qwen 3.8 Max through Alibaba Cloud Model Studio's OpenAI-compatible endpoint, with function calling. */
export class QwenModel implements ChatModel {
  private readonly client: OpenAI;

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
    const message = res.choices[0]?.message;
    if (!message) throw new Error("model returned no choices");
    return message;
  }
}
