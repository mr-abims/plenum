// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IIdentityProvider} from "../interfaces/IIdentityProvider.sol";
import {NotImplemented} from "../interfaces/Types.sol";

/// @title MockIdentityProvider — MOCK
/// @notice MOCK identity provider standing in for Cleanverse A-Pass behind IIdentityProvider. The owner
///         (demo operator) marks accounts verified with a tier and an optional MOCK country attribute.
/// @dev Session 0 stub; setters implemented in Session 1.
contract MockIdentityProvider is IIdentityProvider, Ownable {
    struct Identity {
        bool verified;
        uint8 tier;
        bytes2 country;
    }

    mapping(address => Identity) public identities;

    constructor() Ownable(msg.sender) {}

    /// @notice MOCK: set an account's identity. Owner only.
    function setIdentity(address, bool, uint8, bytes2) external view onlyOwner {
        revert NotImplemented();
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
