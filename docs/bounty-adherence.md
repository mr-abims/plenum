# Bounty adherence

How Plenum meets each sponsor requirement, with evidence a reviewer can check. All transactions are on **Monad
testnet (chain 10143)**; explorer: MonadVision. Contract addresses: [`docs/deployments.md`](deployments.md).
Live app: https://plenumx.vercel.app. Anything simulated is labelled **MOCK** or **FALLBACK** in code, UI and docs.

Status key: ✅ shown with evidence · 🟡 built, evidence pending · ⏳ video timestamp to add after recording.

| Target | Requirement | Status |
| --- | --- | --- |
| Track 04 main prize | Primitives for trust, provenance and user-owned data that make AI useful without one platform capturing the value | ✅ |
| Chainlink CRE | Build, simulate or deploy a CRE workflow used as an orchestration layer | ✅ |
| Envio | HyperIndex / HyperSync powering real onchain data in a core feature | ✅ |
| Mera: One Passkey, Many Keys | Most creative non-wallet use of Mera's PRF-derived key material | 🟡 |
| Best Mera-Powered UX | Mera as the entire account layer: no seed phrase, no extension, no custody backend | 🟡 |
| Qwen 3.8 Max | Push Qwen 3.8 Max into genuinely agentic territory on Monad | 🟡 |

---

## Track 04: Trust, Identity & AI Infrastructure

**Requirement:** primitives for trust, provenance and user-owned data that make AI useful without one platform
capturing the value.

**How Plenum meets it:** Plenum is the **mandate layer for AI money managers**: any app that lets an AI agent manage
money for people can put the agent behind a member-written mandate instead of handing it a key
([`docs/INTEGRATE.md`](INTEGRATE.md), [`packages/sdk`](../packages/sdk)). The group app is the reference client. Every
duty the AI could abuse is held by someone else and enforced onchain:

| Duty | Held by | Enforced by |
| --- | --- | --- |
| Manage | AI manager (scoped operator key) | `ManagerGateway` + `Mandate.check` on every action |
| Price | Chainlink CRE workflow | `NavOracle` accepts the CRE forwarder only |
| Admit | Members, by signed invite | `Plenum.join` (EIP-712 invite: member-signed, single-use, expiring, capped) |
| Own and decide | Members (Mera passkeys) | `Governance`: approve, pause, (roadmap) replace |

- **Trust:** the worst a fully compromised manager can do is move money between assets the group approved, within
  caps; it can never withdraw. Proven by 7 invariants over ~16k random calls each and the RT-1..RT-8 red-team suite
  ([`docs/threat-model.md`](threat-model.md)).
- **Provenance:** every manager action commits `keccak256(memo)` and the model id onchain; members decrypt the memo
  and check it against that hash. The public `/verify` page decodes any manager transaction, proves its gateway is a
  factory-made Plenum clone, and checks a memo (and its actions) against the onchain hashes.
- **User-owned data:** member documents are encrypted with keys derived from each member's passkey; the manager reads
  them only under an onchain, expiring consent grant.
- **Agent identity and reputation (ERC-8004):** the manager is agent #2128 in Monad testnet's canonical
  IdentityRegistry, and every memo names that identity. Members rate its actions in the canonical
  ReputationRegistry, each rating pointing at the action's rationale hash. The app counts only ratings from the
  group's own members (each admitted by a member's invite), so outsiders can't game the score.
- **No platform capture:** members can pause the manager instantly; the manager is a replaceable key behind a
  gateway, and the data stays with the members.

**Evidence:**

| What | Where |
| --- | --- |
| A forced call with the manager's own key, moving 4,000 to an outside address, **reverts** `ADAPTER_NOT_ALLOWED` | [tx 0x732ef7c0…](https://testnet.monadvision.com/tx/0x732ef7c035971c5c249132b444ba05403c84f6c0f0a3d36915ad5ffb7ceec97d) |
| Oversized trade refused in-band, escalated, approved by a member, executed | [escalate](https://testnet.monadvision.com/tx/0x7026de791cb4f2da09ba21dc1f051ffefda3b9e914683d8c3221bf40d651722a) · [approve](https://testnet.monadvision.com/tx/0xeeb42e59597e335fc5510de7c454bfab08c742205a7f369a884ce6e178877961) · [execute](https://testnet.monadvision.com/tx/0x1e249b939612de9df9ba8019df7033fbe0427314c044863b4de2df24a9f7ce91) |
| Try it: the landing page's rule console asks the Showcase Club's `ManagerGateway.simulate` live; `/verify` checks any manager action and memo against the chain | https://plenumx.vercel.app, https://plenumx.vercel.app/verify |
| ERC-8004: manager registered as agent #2128; a member's rating, summarised over members only | [register 0xbb2a824b…](https://testnet.monadvision.com/tx/0xbb2a824bfa8aeb9e8d10b090aba87c205985aa580e9d3e835ea00c4778920503) · [feedback 0x29cffa75…](https://testnet.monadvision.com/tx/0x29cffa7500ed38f7c9d421c35d28262853f695b278dfb0923f84b1b814ba97ac) |
| Invariant and red-team results | [`docs/threat-model.md`](threat-model.md), `contracts/test/invariant/`, `agent/redteam/` |
| Video | ⏳ |

---

## Chainlink CRE

**Requirement:** build, simulate or deploy a CRE workflow used as an orchestration layer.

**How Plenum meets it:** the CRE workflow is the fund's **independent administrator** and connects Monad to
real-world market data. On a cron (and an HTTP trigger) it:

1. fetches the **gold spot price from an external API** (gold-api.com) on every node and agrees on the median
   (`consensusMedianAggregation`);
2. reports that price through the forwarder to the gold adapter (`MockGold`), which rejects stale, future-dated
   and >20% moves, so the gold sleeve is valued at market;
3. reads every holding of each plenum at the last finalized block, computes NAV and per-sleeve drift, and writes
   a report through the forwarder to `NavOracle`.

The AI manager never writes a price, and it cannot act on a price older than the mandate allows (`NAV_STALE`).
Because gold is valued at the real price, real market moves create drift the manager then has to handle.

**Evidence:**

| What | Where |
| --- | --- |
| Workflow code (TypeScript SDK 1.23, `monad-testnet` selector) | [`cre/plenum-nav/main.ts`](../cre/plenum-nav/main.ts), NAV math tested in [`cre/test/nav.test.ts`](../cre/test/nav.test.ts) |
| Compiles to WASM with the CRE compiler; simulated with the CRE CLI v1.38 | [`cre/README.md`](../cre/README.md) |
| `cre workflow simulate --broadcast`: gold spot price fetched from an external API (median across nodes) and reported to `MockGold` | [tx 0x9136ba2d…](https://testnet.monadvision.com/tx/0x9136ba2db32ff7cbfcc9df6bcf360f696594f2bc4becdb8fd8bebb80fc07cb66) |
| Same run: holdings read at the finalized block, gold valued at market, `NavReported(…, CRE)` written | [tx 0xfc925a89…](https://testnet.monadvision.com/tx/0xfc925a89ea1abc2c85317633289a867dceba2bdcb99356a94d0a3b10b9f50f98) |
| Receiver accepts the forwarder only; timestamps strictly increase; no future reports | [`contracts/src/core/NavOracle.sol`](../contracts/src/core/NavOracle.sol), `NavOracle.t.sol` |
| Video | ⏳ |

---

## Envio

**Requirement:** HyperIndex / HyperSync / HyperRPC powering real onchain data in a core feature.

**How Plenum meets it:** an Envio HyperIndex indexer (HyperSync source) indexes every Plenum event, discovering each
group's contracts dynamically from `PlenumCreated`. It powers the **manager feed** (what the AI did and why, with
refusals), the approvals history and the activity timeline in the live app.

**Evidence:**

| What | Where |
| --- | --- |
| Indexer (config, schema, handlers) | [`indexer/`](../indexer) |
| Hosted on Envio (development plan), synced to Monad testnet | `https://indexer.dev.hyperindex.xyz/04d330b/v1/graphql` |
| Used by the app's feed (`NEXT_PUBLIC_INDEXER_URL`) | [`app/src/lib/feed.ts`](../app/src/lib/feed.ts) |
| Feed load time: ~21 ms via Envio vs ~13 s scanning the chain | measured against testnet |
| Video | ⏳ |

---


## Mera: One Passkey, Many Keys

**Requirement:** the most creative non-wallet use of Mera's PRF-derived key material.

**How Plenum meets it:** one passkey yields two independent keys. Mera's standard derivation gives the member's EVM
account; separately, `HKDF-SHA256(PRF, "plenum", "plenum/x25519/v1")` gives an **X25519 data-room key**. It powers:

- the member's encrypted profile and risk questionnaire (AES-256-GCM per document);
- **consent**: the member wraps a document key to the manager with HPKE for 24 hours and records the grant onchain;
  revoking rotates the key;
- **verifiable AI memos**: the manager encrypts its reasoning to every member's published key, and members decrypt it
  and check it against the onchain hash.

**Evidence:**

| What | Where |
| --- | --- |
| Derivation and envelope crypto, cross-checked against Node's HKDF/X25519 | [`packages/crypto/src/index.ts`](../packages/crypto/src/index.ts), 9 tests |
| App key path (PRF → EVM key and data-room key) | [`app/src/lib/account.ts`](../app/src/lib/account.ts) |
| End to end: consent grant → manager reads → encrypted memo matches onchain hash | `agent/scripts/e2e-dataroom.ts` (7/7) and the live data-room API |
| Real passkey on the live app | 🟡 pending browser test |
| Video | ⏳ |

---

## Best Mera-Powered UX

**Requirement:** Mera as the entire account layer: no seed phrase, no extension, no custody backend.

**How Plenum meets it:** every member account is a Mera passkey account (`createPasskeyWithPrfOutput` /
`getPasskeyPrfOutput` → `toViemAccount`). No wallet connector, no seed phrase, no extension.

- **One-prompt onboarding:** one passkey ceremony creates the account; the app then sets it up with MOCK test dollars
  and gas automatically (signed by the Mera signing session, no second prompt), so the first Monad transaction
  (create a group or contribute) follows straight away.
- **Session scope:** contribute, join and saving preferences sign prompt-free with the in-memory signing session;
  approve, pause and consent ask for the passkey again. The session ends on reload, sign-out or 30 minutes without
  activity, with a banner explaining why and a one-tap sign-in that returns to the same page.
- **Stateless test:** nothing but a credential-id hint is stored on the device. On a fresh browser, signing in with
  the same passkey rebuilds the account, decrypts the profile from the data room and lists the member's groups from
  the Envio indexer. The manager's operator key holds no user funds and can only call
`ManagerGateway`. The PRF output is never stored.

**Evidence:**

| What | Where |
| --- | --- |
| Account layer | [`app/src/lib/account.ts`](../app/src/lib/account.ts), [`app/src/lib/session.tsx`](../app/src/lib/session.tsx) |
| Onboarding, create/join with signed invite links, approvals with passkey | live app |
| Real passkey on the live app | 🟡 pending browser test |
| Video | ⏳ |

---

## Qwen 3.8 Max

**Requirement:** push Qwen 3.8 Max into genuinely agentic territory on Monad.

**How Plenum meets it:** the manager runs a full **observe → plan → simulate → act → explain** loop with seven tools
(no transfer tool exists). It decides on its own when to rebalance in-band, when to escalate to members and when to
wait. Every write is simulated against `ManagerGateway` first and re-checked onchain, and every action records the
model id and a hash of its reasoning.

**Evidence:**

| What | Where |
| --- | --- |
| Runtime and tools | [`agent/src/`](../agent/src) |
| Red-team suite RT-1..RT-8 (prompt injection, invented adapters, stale prices, stolen key) | [`agent/redteam/`](../agent/redteam), 10/10 |
| Full cycle on testnet (in-band, escalation, approval, execution) | `agent/scripts/testnet-rehearsal.ts`; transactions in [`docs/deployments.md`](deployments.md). **These rehearsal runs used a scripted plan, not the model** (disclosed there) |
| Live Qwen 3.8 Max transactions (model id onchain) | 🟡 pending model access |
| Video | ⏳ |
