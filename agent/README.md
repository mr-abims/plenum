# agent — AI manager runtime

Implements SPEC §8 (and amendments A4, A6). Session 4 (Oct 10).

TypeScript on Node 22 + viem + OpenAI SDK pointed at Model Studio (`qwen3.8-max`, Singapore,
workspace-specific base URL). Loop: observe → plan (zod-validated JSON) → simulate
(`ManagerGateway.simulate`) → classify → act (`executeInBand` / `escalate`) → explain
(memo encrypted for members, keccak256(memo) + model ID onchain).

Tools: `get_portfolio`, `get_mandate`, `get_nav`, `get_member_context`, `simulate`,
`execute_in_band`, `escalate`. There is no transfer, approve or arbitrary-call tool.

Layout (planned): `src/{loop.ts, tools/, prompts/, schema/, crypto/}`, `redteam/` (RT-1..RT-8).
Every transaction sets an explicit gas limit (Monad bills the declared limit).

Run (once built): `pnpm --filter @plenum/agent start`, `pnpm --filter @plenum/agent redteam`.
