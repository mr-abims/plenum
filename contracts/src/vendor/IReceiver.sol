// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

// Vendored from Chainlink CRE docs ("Building consumer contracts"), Oct 6 2026.
// Change: IERC165 imported from OpenZeppelin instead of a local copy.
// TODO(Session 3): re-diff against the docs page before deploying.
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/// @title IReceiver - receives keystone reports
/// @notice Implementations must support the IReceiver interface through ERC165.
interface IReceiver is IERC165 {
    /// @notice Handles incoming keystone reports.
    /// @dev If this function call reverts, it can be retried with a higher gas
    /// limit. The receiver is responsible for discarding stale reports.
    /// @param metadata Report's metadata.
    /// @param report Workflow report.
    function onReport(bytes calldata metadata, bytes calldata report) external;
}
