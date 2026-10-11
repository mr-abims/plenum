import { describe, expect, it } from "vitest";
import { encodeAbiParameters, keccak256, toHex } from "viem";
import { actionsHash, checkMemo, disposition, memoHash, modelIdBytes, REASONS, toContractActions, type Action } from "../src/index.ts";

const TBILL = "0x6B075EA481d5aCD181103EAf0E8A7FD66C9cAF5C" as const;
const plan: Action[] = [{ adapter: TBILL, op: "Withdraw", assets: 300_000_000n }];

describe("@plenum/sdk", () => {
  it("encodes actions the way ManagerGateway hashes them", () => {
    const expected = keccak256(
      encodeAbiParameters(
        [{ type: "tuple[]", components: [{ name: "adapter", type: "address" }, { name: "op", type: "uint8" }, { name: "assets", type: "uint256" }] }],
        [[{ adapter: TBILL.toLowerCase() as `0x${string}`, op: 1, assets: 300_000_000n }]],
      ),
    );
    expect(actionsHash(plan)).toBe(expected);
    expect(toContractActions(plan)[0]!.op).toBe(1);
  });

  it("hashes memos over canonical JSON, so key order doesn't matter", () => {
    expect(memoHash({ b: 1, a: [2, { d: 3, c: 4 }] })).toBe(memoHash({ a: [2, { c: 4, d: 3 }], b: 1 }));
    expect(memoHash({ a: 1 })).toBe(keccak256(toHex('{"a":1}')));
  });

  it("checks a memo's reasoning and actions against the onchain hashes", () => {
    const memo = { observations: ["T-bill above band"], actions: [{ adapter: TBILL, op: "Withdraw", assets: "300000000" }] };
    const onchain = { rationaleHash: memoHash(memo), actionsHash: actionsHash(plan) };
    expect(checkMemo(memo, onchain)).toEqual({ reasoning: true, actions: true });
    const edited = { ...memo, actions: [{ adapter: TBILL, op: "Withdraw", assets: "900000000" }] };
    expect(checkMemo(edited, onchain)).toEqual({ reasoning: false, actions: false });
  });

  it("maps every reason code to what the agent should do", () => {
    expect(REASONS).toHaveLength(10);
    expect(REASONS.map(disposition)).toEqual(["inband", "drop", "escalate", "escalate", "escalate", "wait", "drop", "wait", "drop", "drop"]);
  });

  it("pads the model id to 32 bytes", () => {
    expect(modelIdBytes("qwen3.8-max")).toHaveLength(66);
  });
});
