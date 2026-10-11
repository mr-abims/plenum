// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @notice Operation an action performs on an allowlisted asset adapter.
/// @dev For `Claim`, `Action.assets` carries the adapter's requestId (see IAssetAdapter.claim).
enum Op {
    Deposit,
    Withdraw,
    RequestRedeem,
    Claim
}

/// @notice One step of a rebalance. Only allowlisted adapters are ever called.
struct Action {
    address adapter; // must be on the mandate allowlist
    Op op;
    uint256 assets; // settlement-asset units (6 decimals); requestId for Op.Claim
}

/// @notice Why a check refused an action. Order is part of the ABI (Envio, agent, UI depend on it).
enum Reason {
    OK,
    ADAPTER_NOT_ALLOWED,
    WEIGHT_OUT_OF_BAND,
    LIQUIDITY_FLOOR,
    TRADE_TOO_LARGE,
    TURNOVER_CAP,
    NAV_STALE,
    COOLDOWN,
    PAUSED,
    MEMBER_CAP
}

/// @notice Who wrote a NAV report. FALLBACK is a labelled demo-resilience writer, never the manager.
enum NavSource {
    CRE,
    FALLBACK
}

/// @notice Investment policy as code (SPEC §7; amendments A5 and A19 add `pauseQuorum`, `votingPeriod`).
struct MandateConfig {
    address[] adapters; // allowlist; index i matches targetBps[i]
    uint16[] targetBps; // target weight per adapter, basis points of NAV
    uint16[] bandBps; // allowed drift either side of target
    uint16 minLiquidityBps; // floor held as settlement-asset cash
    uint16 maxTradeBps; // largest single action, % of NAV
    uint16 maxDailyTurnoverBps;
    uint32 navMaxAge; // seconds before NAV counts as stale
    uint32 cooldown; // seconds between manager executions
    uint16 maxMembers; // default 99
    uint16 escalateQuorumBps; // approvals needed for escalations
    uint16 mandateChangeBps; // supermajority for mandate changes
    uint32 timelock; // delay before a mandate change applies
    uint16 pauseQuorum; // k in k-of-n: member pause votes needed to pause the manager
    uint32 votingPeriod; // seconds an escalation stays open (SPEC A19)
}

/// @notice Execution paths revert with the policy reason that blocked them.
error PolicyViolation(Reason reason);
/// @notice Caller lacks the role this function requires.
error Unauthorized(address caller);
/// @notice Session 0 stub marker; every occurrence is replaced by Session 2.
error NotImplemented();
