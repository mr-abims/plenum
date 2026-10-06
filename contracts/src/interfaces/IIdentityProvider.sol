// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IIdentityProvider
/// @notice Pluggable identity source. Cleanverse A-Pass first; a labelled MOCK until Cleanverse is confirmed.
interface IIdentityProvider {
    /// @notice True when `account` holds a valid verified identity.
    function isVerified(address account) external view returns (bool);

    /// @notice Verification tier of `account` (0 = none).
    function tier(address account) external view returns (uint8);

    /// @notice ISO 3166-1 alpha-2 country of `account`; 0x0000 if the provider does not supply it.
    function country(address account) external view returns (bytes2);
}
