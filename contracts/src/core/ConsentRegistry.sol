// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IConsentRegistry} from "../interfaces/IConsentRegistry.sol";
import {NotImplemented} from "../interfaces/Types.sol";

/// @title ConsentRegistry
/// @notice Shared record of time-limited data-access grants. The manager runtime checks `isActive` before
///         every decryption. Consent controls future access only.
/// @dev Session 0 stub.
contract ConsentRegistry is IConsentRegistry {
    struct Grant {
        address member;
        address grantee;
        bytes32 scopeHash;
        uint64 expiry;
        bool revoked;
    }

    uint256 public nextId;
    mapping(uint256 => Grant) public grants;

    /// @inheritdoc IConsentRegistry
    function grant(address, bytes32, uint64) external pure returns (uint256) {
        revert NotImplemented();
    }

    /// @inheritdoc IConsentRegistry
    function revoke(uint256) external pure {
        revert NotImplemented();
    }

    /// @inheritdoc IConsentRegistry
    function isActive(uint256) external pure returns (bool) {
        revert NotImplemented();
    }
}
