// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Action, MandateConfig, Reason} from "./Types.sol";

/// @title IMandate
/// @notice Policy storage and pure pre-trade checks for one plenum. Never reverts on policy.
interface IMandate {
    event MandateChangeScheduled(bytes32 configHash, uint256 eta);
    event MandateChangeApplied(bytes32 configHash);

    /// @notice One-time setup by the factory for a freshly cloned bundle.
    function initialize(address plenum, address navOracle, address governance, MandateConfig calldata initialConfig)
        external;

    /// @notice Current configuration.
    function config() external view returns (MandateConfig memory);

    /// @notice Seconds before a NAV report counts as stale.
    function navMaxAge() external view returns (uint32);

    /// @notice Maximum number of members (≤ 99).
    function maxMembers() external view returns (uint16);

    /// @notice Cash plus every adapter's value and pending value, read onchain (settlement-asset units).
    function holdingsTotal() external view returns (uint256);

    /// @notice True when `adapter` is on the allowlist.
    function isAllowed(address adapter) external view returns (bool);

    /// @notice Policy check against current holdings and NAV: allowlist, NAV freshness, bands, cash floor,
    ///         single-trade size. Returns OK or the first failing Reason. Cooldown and turnover are checked
    ///         by ManagerGateway (amendment A4).
    function check(Action[] calldata actions) external view returns (Reason);

    /// @notice Queue a new config behind the timelock. Governance only (stretch: MD-3).
    function scheduleChange(MandateConfig calldata newConfig) external;

    /// @notice Apply a queued config after its eta. Governance only (stretch: MD-3).
    function applyChange() external;
}
