// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ReceiverTemplate} from "../vendor/ReceiverTemplate.sol";
import {INavOracle} from "../interfaces/INavOracle.sol";
import {NotImplemented, Unauthorized} from "../interfaces/Types.sol";

/// @title NavOracle
/// @notice Shared NAV store for every plenum (amendment A10). Accepts CRE reports only via the configured
///         forwarder (mock forwarder for `cre workflow simulate --broadcast`, production forwarder otherwise).
///         Report = abi.encode(plenum, nav, driftBps[], timestamp); older-or-equal timestamps are rejected.
/// @dev Session 0 stub. FALLBACK: `fallbackWrite` is a labelled demo-resilience path on a separate key.
contract NavOracle is INavOracle, ReceiverTemplate {
    address public fallbackWriter;
    mapping(address => NavReport) internal _latest;

    constructor(address forwarder, address fallbackWriter_) ReceiverTemplate(forwarder) {
        fallbackWriter = fallbackWriter_;
        emit FallbackWriterSet(fallbackWriter_);
    }

    /// @inheritdoc INavOracle
    function latest(address plenum) external view returns (NavReport memory) {
        return _latest[plenum];
    }

    /// @inheritdoc INavOracle
    function fallbackWrite(address, uint256) external view {
        if (msg.sender != fallbackWriter) revert Unauthorized(msg.sender);
        revert NotImplemented();
    }

    /// @notice Set or remove (address(0)) the FALLBACK writer. Owner only.
    function setFallbackWriter(address writer) external onlyOwner {
        fallbackWriter = writer;
        emit FallbackWriterSet(writer);
    }

    function _processReport(bytes calldata) internal pure override {
        revert NotImplemented();
    }
}
