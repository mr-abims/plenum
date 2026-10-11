import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createTestClient,
  createWalletClient,
  encodeAbiParameters,
  http,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { foundry } from "viem/chains";
import type { ChatCompletionMessage, ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { governanceAbi, mandateAbi, navOracleAbi, plenumAbi } from "@plenum/abis";
import { makeClients } from "../src/chain.ts";
import { loadDeployment, type Deployment } from "../src/config.ts";
import { buildContext, type AgentContext } from "../src/context.ts";
import type { ChatModel } from "../src/model.ts";
import { FileMemoStore, InMemoryMemberContext } from "../src/stores.ts";

export const RPC_PORT = 8547;
export const RPC_URL = `http://127.0.0.1:${RPC_PORT}`;

/** Anvil default keys: 0 deployer/organizer, 1 FALLBACK NAV writer, 2 manager operator, 3 second member. */
export const KEYS = {
  deployer: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
  fallback: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  manager: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  member2: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
} as const satisfies Record<string, Hex>;

export const USD = 1_000_000n;

export function walletFor(key: Hex) {
  return createWalletClient({ chain: foundry, transport: http(RPC_URL), account: privateKeyToAccount(key) });
}

export interface Harness {
  deployment: Deployment;
  plenum: Address;
  clients: ReturnType<typeof makeClients>;
  test: ReturnType<typeof createTestClient>;
  wallet: typeof walletFor;
  ctx: (model: ChatModel, opts?: { external?: AgentContext["external"]; memberDocs?: Record<string, string> }) => Promise<AgentContext>;
  postNav: () => Promise<void>;
  advance: (seconds: number) => Promise<void>;
  cash: () => Promise<bigint>;
  joinMember: (key: Hex, nonce: bigint) => Promise<Address>;
  logs: string[];
}

export function harness(): Harness {
  const deployment = loadDeployment(31337);
  const raw = JSON.parse(readFileSync(join(import.meta.dirname, "../../contracts/deployments/31337.json"), "utf8"));
  const plenum = raw.rehearsalPlenum as Address;
  const clients = makeClients(RPC_URL, 31337, KEYS.manager);
  const transport = http(RPC_URL);
  const test = createTestClient({ chain: foundry, mode: "anvil", transport });
  const wallet = walletFor;
  const pc = clients.publicClient;
  const logs: string[] = [];

  const h: Harness = {
    deployment,
    plenum,
    clients,
    test,
    wallet,
    logs,
    ctx: (model, opts = {}) =>
      buildContext(
        {
          clients,
          model,
          memoStore: new FileMemoStore(mkdtempSync(join(tmpdir(), "plenum-memos-"))),
          memberContext: new InMemoryMemberContext(opts.memberDocs ?? {}),
          plenum,
          external: opts.external ?? [],
          log: (m) => logs.push(m),
        },
        deployment,
      ),
    async postNav() {
      const mandate = (await pc.readContract({ address: plenum, abi: plenumAbi, functionName: "mandate" })) as Address;
      const total = await pc.readContract({ address: mandate, abi: mandateAbi, functionName: "holdingsTotal" });
      await test.increaseTime({ seconds: 1 }); // reports must have strictly increasing timestamps
      await test.mine({ blocks: 1 });
      const hash = await wallet(KEYS.fallback).writeContract({
        address: deployment.navOracle as Address,
        abi: navOracleAbi,
        functionName: "fallbackWrite",
        args: [plenum, total],
      });
      await pc.waitForTransactionReceipt({ hash });
    },
    async advance(seconds) {
      await test.increaseTime({ seconds });
      await test.mine({ blocks: 1 });
    },
    cash: () => pc.readContract({ address: plenum, abi: plenumAbi, functionName: "cash" }),
    async joinMember(key, nonce) {
      const member = privateKeyToAccount(key).address;
      const deployer = wallet(KEYS.deployer);
      const block = await pc.getBlock();
      const expiry = block.timestamp + 86_400n;
      const signature = await deployer.signTypedData({
        domain: { name: "Plenum", version: "1", chainId: 31337, verifyingContract: plenum },
        types: { Invite: [{ name: "invitee", type: "address" }, { name: "nonce", type: "uint256" }, { name: "expiry", type: "uint64" }] },
        primaryType: "Invite",
        message: { invitee: member, nonce, expiry },
      });
      const invite = encodeAbiParameters(
        [{ type: "address" }, { type: "uint256" }, { type: "uint64" }, { type: "bytes" }],
        [member, nonce, expiry, signature],
      );
      await pc.waitForTransactionReceipt({
        hash: await wallet(key).writeContract({ address: plenum, abi: plenumAbi, functionName: "join", args: [invite, `0x${"00".repeat(32)}`] }),
      });
      return member;
    },
  };
  return h;
}

/** Stand-in for Qwen: replays scripted turns and records every prompt it was shown. */
export class ScriptedModel implements ChatModel {
  /** Recorded onchain as the model id, so it must never claim to be a real model. */
  readonly id = "scripted-plan";
  readonly seen: ChatCompletionMessageParam[][] = [];
  private i = 0;

  constructor(private readonly turns: ((seen: ChatCompletionMessageParam[]) => ChatCompletionMessage)[]) {}

  async complete(messages: ChatCompletionMessageParam[]): Promise<ChatCompletionMessage> {
    this.seen.push(structuredClone(messages));
    const turn = this.turns[this.i++];
    return turn ? turn(messages) : say("Nothing further.");
  }

  get calls() {
    return this.seen.length;
  }
}

let callId = 0;
export function call(name: string, args: unknown): () => ChatCompletionMessage {
  return () => ({
    role: "assistant",
    content: null,
    refusal: null,
    tool_calls: [{ id: `call_${++callId}`, type: "function", function: { name, arguments: JSON.stringify(args) } }],
  });
}

export function say(text: string): ChatCompletionMessage {
  return { role: "assistant", content: text, refusal: null };
}

export function plan(actions: { adapter: string; op: string; assets: bigint }[]) {
  return {
    observations: ["Scripted red-team plan"],
    actions: actions.map((a) => ({ ...a, assets: a.assets.toString() })),
    expectedWeightsBps: { tbill: 4500, credit: 2000, gold: 1500, cash: 2000 },
    risks: ["none"],
    language: "en",
  };
}

/** The last tool result the model was shown, parsed. */
export function lastToolResult(model: ScriptedModel): any {
  const last = model.seen.at(-1) ?? [];
  const tool = [...last].reverse().find((m) => m.role === "tool");
  return tool ? JSON.parse(tool.content as string) : undefined;
}

export { governanceAbi };
