// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {NavSource} from "./Types.sol";

/// @title INavOracle
/// @notice Shared NAV store keyed by plenum (amendment A10). Written only by the CRE forwarder or the
///         labelled FALLBACK writer. The manager never writes NAV.
interface INavOracle {
    struct NavReport {
        uint256 nav; // settlement-asset units (6 decimals)
        uint64 timestamp; // as computed by the workflow; strictly increasing per plenum
        NavSource source;
    }

    /// @notice Emitted for every accepted report. `plenum` is added to SPEC's signature because the oracle is shared.
    event NavReported(address indexed plenum, uint256 nav, uint256 timestamp, NavSource source);
    event FallbackWriterSet(address indexed writer);

    /// @notice Latest report for `plenum` (zero struct if none yet).
    function latest(address plenum) external view returns (NavReport memory);

    /// @notice FALLBACK: labelled demo-resilience write. Only the fallback writer key.
    function fallbackWrite(address plenum, uint256 nav) external;
}
