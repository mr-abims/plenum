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

## Known residual risks

| Risk | Status |
| --- | --- |
| NAV race: flows between the CRE read and the report write are dropped when a newer report resets net flows | Accepted (SPEC A8); bounded by flows within one CRE interval; documented here |
| Mock price feeds (MockGold) and MOCK identity/A-Token | Hackathon build only; labelled MOCK everywhere |
| Fallback NAV key misuse | Demo-only, labelled `FALLBACK`, removable by the owner (`setFallbackWriter(0)`) |
| Bad but in-band allocation by a compromised manager | Bounded by turnover cap per day until members pause |
| Cleanverse validator interface unconfirmed | `CleanverseIdentityProvider` stays a stub until confirmed |

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

Aderyn: to run in the hardening pass.
