// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IConsentRegistry} from "../interfaces/IConsentRegistry.sol";
import {Unauthorized} from "../interfaces/Types.sol";

/// @title ConsentRegistry
/// @notice Shared record of time-limited data-access grants. The manager runtime checks `isActive` before every
///         decryption. Only hashes and expiries live onchain; consent controls future access only.
contract ConsentRegistry is IConsentRegistry {
    struct Grant {
        address member;
        address grantee;
        bytes32 scopeHash;
        uint64 expiry;
        bool revoked;
    }

    uint256 public nextId = 1;
    mapping(uint256 => Grant) public grants;

    error ExpiryInPast(uint64 expiry);
    error ZeroGrantee();
    error UnknownGrant(uint256 id);

    /// @inheritdoc IConsentRegistry
    function grant(address grantee, bytes32 scopeHash, uint64 expiry) external returns (uint256 id) {
        if (grantee == address(0)) revert ZeroGrantee();
        if (expiry <= block.timestamp) revert ExpiryInPast(expiry);
        id = nextId++;
        grants[id] = Grant({member: msg.sender, grantee: grantee, scopeHash: scopeHash, expiry: expiry, revoked: false});
        emit ConsentGranted(id, msg.sender, grantee, scopeHash, expiry);
    }

    /// @inheritdoc IConsentRegistry
    function revoke(uint256 id) external {
        Grant storage g = grants[id];
        if (g.member == address(0)) revert UnknownGrant(id);
        if (g.member != msg.sender) revert Unauthorized(msg.sender);
        if (g.revoked) return;
        g.revoked = true;
        emit ConsentRevoked(id);
    }

    /// @inheritdoc IConsentRegistry
    function isActive(uint256 id) external view returns (bool) {
        Grant storage g = grants[id];
        return g.member != address(0) && !g.revoked && block.timestamp < g.expiry;
    }
}
