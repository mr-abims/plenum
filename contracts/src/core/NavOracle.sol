// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {ReceiverTemplate} from "../vendor/ReceiverTemplate.sol";
import {INavOracle} from "../interfaces/INavOracle.sol";
import {NavSource, Unauthorized} from "../interfaces/Types.sol";

/// @title NavOracle
/// @notice Shared NAV store for every plenum (SPEC A10). Accepts CRE reports only via the configured
///         forwarder (mock forwarder for `cre workflow simulate --broadcast`, production forwarder otherwise).
///         Report = abi.encode(address plenum, uint256 nav, int256[] driftBps, uint64 timestamp).
///         Timestamps strictly increase per plenum and may not be in the future.
/// @dev FALLBACK: `fallbackWrite` is a labelled demo-resilience path on a separate key, removable by the owner.
contract NavOracle is INavOracle, ReceiverTemplate {
    address public fallbackWriter;
    mapping(address => NavReport) internal _latest;

    error StaleReport(address plenum, uint64 timestamp, uint64 latestTimestamp);
    error FutureReport(address plenum, uint64 timestamp);

    constructor(address forwarder, address fallbackWriter_) ReceiverTemplate(forwarder) {
        fallbackWriter = fallbackWriter_;
        emit FallbackWriterSet(fallbackWriter_);
    }

    /// @inheritdoc INavOracle
    function latest(address plenum) external view returns (NavReport memory) {
        return _latest[plenum];
    }

    /// @inheritdoc INavOracle
    function fallbackWrite(address plenum, uint256 nav) external {
        if (msg.sender != fallbackWriter || msg.sender == address(0)) revert Unauthorized(msg.sender);
        _store(plenum, nav, SafeCast.toUint64(block.timestamp), NavSource.FALLBACK);
    }

    /// @notice Set or remove (address(0)) the FALLBACK writer. Owner only.
    function setFallbackWriter(address writer) external onlyOwner {
        fallbackWriter = writer;
        emit FallbackWriterSet(writer);
    }

    function _processReport(bytes calldata report) internal override {
        (address plenum, uint256 nav,, uint64 timestamp) = abi.decode(report, (address, uint256, int256[], uint64));
        _store(plenum, nav, timestamp, NavSource.CRE);
    }

    function _store(address plenum, uint256 nav, uint64 timestamp, NavSource source) internal {
        uint64 last = _latest[plenum].timestamp;
        if (timestamp <= last) revert StaleReport(plenum, timestamp, last);
        if (timestamp > block.timestamp) revert FutureReport(plenum, timestamp);
        _latest[plenum] = NavReport({nav: nav, timestamp: timestamp, source: source});
        emit NavReported(plenum, nav, timestamp, source);
    }
}
