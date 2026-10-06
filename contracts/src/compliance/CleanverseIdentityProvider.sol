// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IIdentityProvider} from "../interfaces/IIdentityProvider.sol";
import {NotImplemented} from "../interfaces/Types.sol";

/// @title CleanverseIdentityProvider
/// @notice Reads A-Pass status and tier from Cleanverse's onchain validator. Country returns 0x0000 unless
///         A-Pass exposes it.
/// @dev Session 0 stub. Validator interface is UNCONFIRMED (community repos only); wired after the Cleanverse
///      go/no-go on Oct 7. Until then the deployment uses MockIdentityProvider.
contract CleanverseIdentityProvider is IIdentityProvider {
    address public immutable validator;

    constructor(address validator_) {
        validator = validator_;
    }

    /// @inheritdoc IIdentityProvider
    function isVerified(address) external pure returns (bool) {
        revert NotImplemented();
    }

    /// @inheritdoc IIdentityProvider
    function tier(address) external pure returns (uint8) {
        revert NotImplemented();
    }

    /// @inheritdoc IIdentityProvider
    function country(address) external pure returns (bytes2) {
        revert NotImplemented();
    }
}
