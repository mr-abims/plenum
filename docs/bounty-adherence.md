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
| Cleanverse | Gate CVA asset movement behind onchain CVI identity verification | ✅ (MOCK signer) |
| Mera: One Passkey, Many Keys | Most creative non-wallet use of Mera's PRF-derived key material | 🟡 |
| Best Mera-Powered UX | Mera as the entire account layer: no seed phrase, no extension, no custody backend | 🟡 |
| Qwen 3.8 Max | Push Qwen 3.8 Max into genuinely agentic territory on Monad | 🟡 |

---

## Track 04: Trust, Identity & AI Infrastructure

**Requirement:** primitives for trust, provenance and user-owned data that make AI useful without one platform
capturing the value.

**How Plenum meets it:** an AI manages a group's money, but every duty the AI could abuse is held by someone else and
enforced onchain:

| Duty | Held by | Enforced by |
| --- | --- | --- |
| Manage | AI manager (scoped operator key) | `ManagerGateway` + `Mandate.check` on every action |
| Price | Chainlink CRE workflow | `NavOracle` accepts the CRE forwarder only |
| Police | Cleanverse attestations | `CleanverseAttestationRegistrar` → `ComplianceGate` |
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
  group's own Cleanverse-verified members, so outsiders can't game the score.
- **No platform capture:** members can pause the manager instantly; the manager is a replaceable key behind a
  gateway, and the data stays with the members.

**Evidence:**

| What | Where |
| --- | --- |
| A forced call with the manager's own key, moving 4,000 to an outside address, **reverts** `ADAPTER_NOT_ALLOWED` | [tx 0x42254307…](https://testnet.monadvision.com/tx/0x42254307eb4048176a04c67bf922b97168c8dfdd05775cdc5d1455758dbc3c3f) |
| Oversized trade refused in-band, escalated, approved by a member, executed | [escalate](https://testnet.monadvision.com/tx/0x693cd26ce14e04a3bb6eb2c1b9119ff536039641460bd69ee15ed11eaa011c91) · [approve](https://testnet.monadvision.com/tx/0x28c7f1fd423c9d303215f9a0e553e56ae42bd9f2fad8a5623a076911a113a615) · [execute](https://testnet.monadvision.com/tx/0x5dc4255f9a1dc9a0f17681ba5bb86d01bad534e446d57546e9c3a7ce9b3a1447) |
| Try it: the landing page's rule console asks the Showcase Club's `ManagerGateway.simulate` live; `/verify` checks any manager action and memo against the chain | https://plenumx.vercel.app, https://plenumx.vercel.app/verify |
| ERC-8004: manager registered as agent #2128; a member's rating, summarised over members only | [register 0xbb2a824b…](https://testnet.monadvision.com/tx/0xbb2a824bfa8aeb9e8d10b090aba87c205985aa580e9d3e835ea00c4778920503) · [feedback 0xf69991fb…](https://testnet.monadvision.com/tx/0xf69991fb4ffd4df27da9d90a7b469740dbc16141b15f2f44adcc0b0805a46113) |
| Invariant and red-team results | [`docs/threat-model.md`](threat-model.md), `contracts/test/invariant/`, `agent/redteam/` |
| Video | ⏳ |

---

## Chainlink CRE

**Requirement:** build, simulate or deploy a CRE workflow used as an orchestration layer.

**How Plenum meets it:** the CRE workflow is the fund's **independent administrator**. On a cron (and an HTTP
trigger) it reads every holding of each plenum at the last finalized block, computes NAV and per-sleeve drift, and
writes a report through the forwarder to `NavOracle`. The AI manager never writes the price, and it cannot act on a
price older than the mandate allows (`NAV_STALE`).

**Evidence:**

| What | Where |
| --- | --- |
| Workflow code (TypeScript SDK 1.23, `monad-testnet` selector) | [`cre/plenum-nav/main.ts`](../cre/plenum-nav/main.ts), NAV math tested in [`cre/test/nav.test.ts`](../cre/test/nav.test.ts) |
| Compiles to WASM with the CRE compiler; simulated with the CRE CLI v1.38 | [`cre/README.md`](../cre/README.md) |
| `cre workflow simulate --broadcast` wrote `NavReported(…, CRE)` onchain | [tx 0x3c0dcc7b…](https://testnet.monadvision.com/tx/0x3c0dcc7b2cd7b6ab02bade2bead41905440831511db57345ae32d6551f8e2ff8) |
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
| Hosted on Envio (development plan), synced to Monad testnet | `https://indexer.dev.hyperindex.xyz/6d9a443/v1/graphql` |
| Used by the app's feed (`NEXT_PUBLIC_INDEXER_URL`) | [`app/src/lib/feed.ts`](../app/src/lib/feed.ts) |
| Feed load time: ~21 ms via Envio vs ~13 s scanning the chain | measured against testnet |
| Video | ⏳ |

---

## Cleanverse

**Requirement:** gate CVA asset movement behind onchain CVI identity verification.

**How Plenum meets it:** identities change **only** through EIP-712 attestations signed by the registered Cleanverse
signer (`CleanverseAttestationRegistrar`, the identity store's only writer). Every movement of the settlement asset
is gated:

- Joining, contributing and redeeming go through `ComplianceGate` (`MEMBER_NOT_VERIFIED`, `PAYEE_NOT_VERIFIED`);
  refusals are logged onchain (`ComplianceRefused`).
- The A-Token itself only moves between verified identities or registered contracts.
- Attestations are single-use, monotonic per person and expiring; anyone can `expire` a lapsed one, after which money
  stops moving for that person.

**MOCK:** the signer is a labelled MOCK attester key and the A-Token is a MOCK, because no public Cleanverse contracts
or signer were available. Swapping in Cleanverse's signer is one `setSigner` call; no other change.

**Evidence:**

| What | Where |
| --- | --- |
| Registrar (source-verified) | [`0xD088…41cE`](https://testnet.monadvision.com/address/0xD08819268ACf957F479cdDdBa3b47B008c6041cE), [`contracts/src/compliance/CleanverseAttestationRegistrar.sol`](../contracts/src/compliance/CleanverseAttestationRegistrar.sol) |
| A signed attestation verifies a new person (`MEMBER_NOT_VERIFIED` → `OK`) | [tx 0xc9d9acad…](https://testnet.monadvision.com/tx/0xc9d9acad40b268366d2352b7457fef8e98e3f3013394372f38fd8a52c18251ba) |
| Expiry stops asset movement; forged, tampered, replayed and stale attestations rejected | `CleanverseAttestationRegistrar.t.sol` (11 tests) |
| Unverified contribution refused onchain | 🟡 to record in the demo |
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
`getPasskeyPrfOutput` → `toViemAccount`). No wallet connector, no seed phrase, no extension. Sensitive actions
(approve, pause, consent) ask for the passkey again. The manager's operator key holds no user funds and can only call
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
