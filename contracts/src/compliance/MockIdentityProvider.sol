// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IIdentityProvider} from "../interfaces/IIdentityProvider.sol";

/// @title MockIdentityProvider — MOCK
/// @notice MOCK identity provider standing in for Cleanverse A-Pass behind IIdentityProvider. The owner
///         (demo operator) marks accounts verified with a tier and an optional MOCK country attribute.
contract MockIdentityProvider is IIdentityProvider, Ownable {
    struct Identity {
        bool verified;
        uint8 tier;
        bytes2 country;
    }

    mapping(address => Identity) public identities;

    event IdentitySet(address indexed account, bool verified, uint8 tier, bytes2 country);

    constructor() Ownable(msg.sender) {}

    /// @notice MOCK: set an account's identity. Owner only.
    function setIdentity(address account, bool verified, uint8 tier_, bytes2 country_) external onlyOwner {
        identities[account] = Identity({verified: verified, tier: tier_, country: country_});
        emit IdentitySet(account, verified, tier_, country_);
    }

    /// @inheritdoc IIdentityProvider
    function isVerified(address account) external view returns (bool) {
        return identities[account].verified;
    }

    /// @inheritdoc IIdentityProvider
    function tier(address account) external view returns (uint8) {
        return identities[account].tier;
    }

    /// @inheritdoc IIdentityProvider
    function country(address account) external view returns (bytes2) {
        return identities[account].country;
    }
}
