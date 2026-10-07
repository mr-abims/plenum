// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IConsentRegistry
/// @notice Time-limited data-access grants from members. Only hashes and expiries live onchain.
interface IConsentRegistry {
    event ConsentGranted(
        uint256 indexed id, address indexed member, address indexed grantee, bytes32 scopeHash, uint64 expiry
    );
    event ConsentRevoked(uint256 indexed id);

    /// @notice Grant `grantee` access to the data described by `scopeHash` until `expiry`. Caller is the member.
    function grant(address grantee, bytes32 scopeHash, uint64 expiry) external returns (uint256 id);

    /// @notice Revoke a grant. Only the member who made it.
    function revoke(uint256 id) external;

    /// @notice Every grant a member has made, oldest first (lets clients avoid log scans).
    function grantIdsOf(address member) external view returns (uint256[] memory);

    /// @notice True while the grant exists, is not revoked and has not expired.
    function isActive(uint256 id) external view returns (bool);
}
