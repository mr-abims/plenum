# Integrate: put any AI agent behind a member-written mandate

Plenum is the **mandate layer for AI money managers** on Monad. Any app that lets an AI agent manage money for people
(an agent wallet, a club or DAO treasury tool, a robo-adviser, an AI fund) can give the agent a Plenum group
instead of a raw key. The agent then works through one narrow door, and the people it works for keep control:

| The agent can | The agent can never |
| --- | --- |
| Buy and sell assets the members approved, inside each holding's range | Send money anywhere else (no transfer path exists) |
| Ask members to approve bigger moves (`escalate`) | Change the rules, write prices or approve its own proposals |
| Prove what it did and why (hash of its reasoning + model id, ERC-8004 identity) | Act on a stale price or after members pause it |

The group app at https://plenumx.vercel.app is the reference client. Contract addresses are in
[`deployments.md`](deployments.md); everything runs on Monad testnet.

## Why not roll your own

- **Bounds proven, not promised.** 7 handler-based invariants (16,384 random calls each) and an 8-scenario red team
  show the worst a stolen agent key can do is move money between approved assets within caps. It can never withdraw.
- **Separation of duties built in.** Prices come from a Chainlink CRE workflow (real market data, node consensus), not
  from the agent. Members, not the agent, decide who joins (signed invites) and what's outside the rules.
- **Provenance for free.** Every agent action commits `keccak256(memo)` and the model id; anyone can check an action
  at `/verify` or with `verifyAction` below, from chain state alone.
- **Agent identity.** The manager is an ERC-8004 agent (Monad's canonical registries) and members rate its actions.
- **Cheap enough to check every action on Monad.** Mandate, size, turnover, cooldown and price checks run onchain on
  every move.

## 1. Create a group for your users

```ts
import { createWalletClient, http } from "viem";
import { monadTestnet } from "viem/chains";
import { plenumFactoryAbi } from "@plenum/abis";

// config: allowlisted adapters, target weights and bands, cash floor, max trade, max daily turnover,
// NAV max age, cooldown, member cap, quorums, pause quorum, voting period (see app/src/lib/templates.ts).
await wallet.writeContract({
  address: FACTORY,
  abi: plenumFactoryAbi,
  functionName: "createPlenum",
  args: ["My club", 1 /* Balanced */, config, agentOperatorAddress],
});
```

The caller becomes the organizer. `PlenumCreated` gives the group's `Plenum`, `Mandate`, `Governance` and
`ManagerGateway` (each group gets its own minimal-proxy clones). Members join with an EIP-712 invite signed by the
organizer or any member (`app/src/lib/invite.ts`).

## 2. Run your agent through the gateway

```ts
import { simulate, disposition, executeInBandRequest, escalateRequest } from "@plenum/sdk";

const actions = [{ adapter: TBILL, op: "Withdraw", assets: 300_000_000n }];
const memo = { observations, actions, risks, modelId, promptVersion }; // whatever your agent wrote

const reason = await simulate(publicClient, gateway, actions);   // eth_call, no key, no gas
switch (disposition(reason)) {
  case "inband":   await agentWallet.writeContract({ ...executeInBandRequest(gateway, actions, memo, modelId), gas }); break;
  case "escalate": await agentWallet.writeContract({ ...escalateRequest(gateway, actions, memo, modelId), gas }); break;
  case "wait":     /* cooldown or daily turnover: try later */ break;
  case "drop":     /* outside the mandate entirely: don't retry */ break;
}
```

Set an explicit gas limit (estimate × 1.2): Monad bills the declared limit. Publish the memo wherever your members
can read it (Plenum encrypts it to each member's passkey-derived key in its data room) so they can check it against
the onchain hash.

A complete runtime (observe → plan → simulate → act → explain, seven tools, no transfer tool, prompt-injection
fencing) is in [`agent/`](../agent); its red-team suite is in [`agent/redteam/`](../agent/redteam).

## 3. Let anyone verify the agent

```ts
import { verifyAction, checkMemo } from "@plenum/sdk";

const action = await verifyAction(publicClient, FACTORY, txHash);
// action.factoryClone && action.linked → the gateway is a genuine Plenum gateway for action.plenum
// action.reason, action.modelId, action.rationaleHash, action.actionsHash, action.timestamp
checkMemo(publishedMemo, action); // { reasoning: true, actions: true } if the memo is exactly what was committed
```

## What's pluggable

| Module | Today | Swap in |
| --- | --- | --- |
| Assets | MOCK T-bill (ERC-4626), MOCK private credit (async, ERC-7540 shape), MOCK gold priced at the real spot price | Real tokenised funds with the same adapter interface (`IAssetAdapter`) |
| Pricing | Chainlink CRE workflow (NAV + gold spot price) | More CRE data sources per asset |
| Admission | Member-signed invites | A KYC check at `join`/`contribute` for regulated deployments |
| Accounts | Mera passkeys (members), any key for the agent | Smart accounts, session keys |
| Model | Any OpenAI-compatible model (Qwen 3.8 Max by default) | Any model; the model id is committed with each action |

## Status

Hackathon build on Monad testnet. Assets and the settlement dollar are MOCK and labelled; the price feeds and every
check are real. Integrations welcome: open an issue on the repository.
