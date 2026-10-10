# Plenum — threat model and test results

Security claim: **the worst a fully compromised manager can do is move money between assets the group already
approved, within the size, turnover and cooldown caps. It can never withdraw.** The tests below are the proof.

## Bounds on the manager

| Path | Bound | Enforced by | Test |
| --- | --- | --- | --- |
| Call an unknown address | Reverts `ADAPTER_NOT_ALLOWED` | `ManagerGateway._requireAllowlisted`, `Plenum.execute` | `test_RT1_RT8_unknownAdapterReverts`, `test_execute_rejectsNonAllowlistedAdapter` |
| Act on stale NAV | Refused `NAV_STALE`, nothing moves | `Mandate.check` | `test_RT3_staleNavRefused` |
| One large trade | Refused `TRADE_TOO_LARGE`; only moves after member approval | `Mandate.check`, `Governance` | `test_RT4_oversizedTradeEscalatedThenApproved` |
| Many small trades | Refused `TURNOVER_CAP` beyond 25% of holdings per day (Balanced) | `ManagerGateway` | `test_RT5_turnoverCap` |
| Rapid-fire trades | Refused `COOLDOWN` | `ManagerGateway` | `test_cooldown_refusedWithoutStateChange` |
| Stolen key | k-of-n members pause instantly; every gateway write reverts | `Governance.pause`, `ManagerGateway` | `test_RT6_pauseStopsTheManager`, invariant 6 |
| Withdraw to itself / anyone | No such function; `Plenum.execute` is only callable by gateway/governance and only touches allowlisted adapters | Architecture | invariants 3, 4 |
| Write NAV | Only the CRE forwarder or the labelled FALLBACK key | `NavOracle` | `test_onReport_rejectsOtherSenders`, `test_fallbackWrite_onlyWriter` |
| Verify itself or others | No path: identities change only through Cleanverse-signed attestations | `CleanverseAttestationRegistrar` | `CleanverseAttestationRegistrar.t.sol` (11 tests) |

Personal portfolios (a plenum of one, SPEC A23) use the same contracts and bounds: `Personal.t.sol` shows the owner
alone approves escalations and pauses the manager, and nobody else can join.

## Invariants (SPEC §13, amended by A2/A18)

Handler-based Foundry invariant suite: `contracts/test/invariant/PlenumInvariants.t.sol`, 256 runs × depth 64
(16,384 random calls per invariant) over contributions, redemptions (including to unverified payees), manager
in-band actions (including unknown adapters and oversized trades), escalations with random approvals, pause/unpause
votes, credit and T-bill drift, time jumps and honest NAV reports. `HandlerProbe` guards against vacuous passes.

| # | Invariant | Result |
| --- | --- | --- |
| 1 | Sum of member units equals total units | PASS |
| 2 | After a successful in-band execution every holding is in band or no worse; cash at/above floor or no lower | PASS |
| 3 | No call from the manager reduces any member's units | PASS |
| 4 | A-Token never reaches an unknown adapter, an unverified payee or the manager | PASS |
| 5 | NAV report timestamps strictly increase | PASS |
| 6 | While paused, every ManagerGateway write reverts | PASS |
| 7 | Contribute then immediately redeem never returns more than was contributed | PASS |

Fuzz: unit-math round trip (invariant 7), first-depositor inflation (attacker never profits; victim loss
≤ donation / 10^6), `Mandate.check` never reverts on allowlisted input.

## Test totals

- Contracts: **111 Foundry tests** (unit, fuzz, 7 invariants) across 13 suites.
- Manager runtime: 9 unit tests and the **RT-1..RT-8 red-team suite** (10 cases) against a local chain with a
  deliberately misbehaving model.
- Data-room crypto: 9 tests, key derivation cross-checked against Node's HKDF/X25519.
- Live checks on Monad testnet: see `docs/deployments.md` (forced-call revert, escalation, CRE pricing, attestations)
  and the data-room API on the hosted app (owner-only writes, ciphertext only, deletion).

## Off-chain surfaces

| Surface | Threat | Mitigation |
| --- | --- | --- |
| Data-room API (`/api/blobs`) | Someone overwrites or deletes another member's documents | Blob ids end with the owner's address; every write/delete is an EIP-191 signature over method, id, body hash and time (5-minute window); only encrypted envelopes are accepted |
| Blob storage (Vercel Blob, private) | Storage provider or a leaked URL exposes data | Ciphertext only, AES-256-GCM with per-reader HPKE-wrapped keys; reads go through the API, never public URLs |
| Manager memos | Tampered or swapped reasoning | keccak256 of the canonical memo is committed onchain; members check the decrypted memo against it |
| Prompt injection | Outside text steers the model | Nonce-fenced DATA blocks, schema-validated plans, no transfer tool, onchain re-checks (RT-1, RT-2) |
| Public RPC limits (~15 req/s, 100-block `eth_getLogs`) | Missed or slow reads during the demo | Multicall batching with retries; membership and consent read from contract state; history from the Envio indexer |

## Known residual risks

| Risk | Status |
| --- | --- |
| NAV race: flows between the CRE read and the report write are dropped when a newer report resets net flows | Accepted (SPEC A8); bounded by flows within one CRE interval; documented here |
| MOCK assets (T-bill, credit, gold), MOCK A-Token and a MOCK Cleanverse attestation signer | Hackathon build only; labelled MOCK everywhere; the attestation path itself is real (SPEC A22) |
| Fallback NAV key misuse | Demo-only, labelled `FALLBACK`, removable by the owner (`setFallbackWriter(0)`) |
| Bad but in-band allocation by a compromised manager | Bounded by turnover cap per day until members pause |
| Cleanverse signer not yet issued | Attestations are signed by a labelled MOCK attester key; `setSigner` swaps in Cleanverse's key with one owner call (SPEC A22) |
| Attester key compromise | Attacker could verify arbitrary accounts until the owner calls `setSigner`; it still cannot move money outside allowlisted adapters or bypass mandate checks |
| Replayed or stale attestation | Rejected: single-use nonces, `issuedAt` must strictly increase per subject, expired attestations refused (`CleanverseAttestationRegistrar` tests) |
| Lapsed verification | Anyone can call `expire(subject)` after expiry; contributions and payouts are then refused onchain (`test_expiryGatesAssetMovement`) |

## Static analysis (Slither 0.11.5)

Run: `slither . --filter-paths "node_modules|lib/|test/|src/vendor"` from `contracts/`.

| Detector | Finding | Disposition |
| --- | --- | --- |
| uninitialized-state | `Governance._actions` "never initialized" | False positive: filled with `push` in `propose` |
| incorrect-equality | `turnoverDay == block.timestamp / 1 days` | Intended: UTC-day bucket for the turnover counter |
| unused-return | `requestRedeem` / `claim` results in `Plenum.execute` | Fixed: emitted in `ActionExecuted(adapter, op, assets, result)` |
| shadowing-local | Interface parameter names shadowed getters | Fixed: renamed |
| missing-zero-check | Initializer and constructor addresses | Accepted: set by the factory/deploy script; `setFallbackWriter(0)` is the intended removal path |
| calls-loop | Allowlist lookups per action | Accepted: bounded by the action list and a ≤ handful-adapter allowlist |
| reentrancy-events / timestamp | Event after external call; timestamp comparisons | Accepted: all token-moving functions are `nonReentrant`; timestamps are the intended NAV/cooldown clock |

Rerun after the attestation registrar and personal portfolios: new `uninitialized-local` on `Plenum.execute`'s
`result` (fixed: explicit `= 0`); registrar `reentrancy-events` / `timestamp` (accepted: the only external call is to
the identity store it owns, state is updated first, and timestamps are the intended validity clock).

## Static analysis (Aderyn 0.1.9)

Run on a copy with dereferenced `node_modules` (Aderyn 0.1.9 cannot follow pnpm symlinks): `aderyn . --src src --path-excludes src/vendor`.

| Finding | Disposition |
| --- | --- |
| H-1 Unprotected initializer | False positive: flags the interface declarations. Implementations use OpenZeppelin `initializer`, implementations are locked with `_disableInitializers()`, and the factory clones and initializes in one transaction (`test_clonesCannotBeReinitialized`, `test_implementationsAreLocked`) |
| H-2 Uninitialized state variables | False positive: counters (`proposalCount`, `pauseRound`, `memberCount`) intentionally start at 0 |
| L-1 Centralization risk (owner roles) | Accepted for the testnet build: owners control MOCK contracts, the CRE forwarder switch and the attestation signer; all documented and labelled |
| L-2 Wide pragma | Accepted: compiled with a pinned solc 0.8.28 in `foundry.toml` |
| L-3 Missing zero-address checks | Accepted: same as Slither's missing-zero-check |
| L-4 `public` could be `external`; L-8 large literals | Style only |
| L-5 Events missing `indexed` fields | Accepted: key fields are indexed; the indexer reads all fields |
| L-6 `nonReentrant` should be the first modifier | Fixed in source (`ManagerGateway.executeInBand` / `escalate`). The testnet deployment predates the reorder; behaviour is identical because `onlyManager` only reads storage |
| L-7 PUSH0 not supported on all chains | Accepted: Monad testnet accepted the bytecode (Shanghai+) |
