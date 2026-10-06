// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IAssetAdapter} from "../interfaces/IAssetAdapter.sol";
import {NotImplemented} from "../interfaces/Types.sol";

/// @title MockCreditVault — MOCK
/// @notice MOCK private-credit vault with ERC-7540-style async exits: requestRedeem → claimable after
///         `redeemDelay` seconds → claim. Pending value counts toward the credit sleeve, not the cash floor.
/// @dev Session 0 stub. Session 1: try OpenZeppelin community-contracts ERC-7540, else hand-roll.
contract MockCreditVault is IAssetAdapter {
    address public immutable override asset;
    uint32 public immutable redeemDelay;

    constructor(address aToken, uint32 redeemDelay_) {
        asset = aToken;
        redeemDelay = redeemDelay_;
    }

    /// @inheritdoc IAssetAdapter
    function valueOf(address) external pure returns (uint256) {
        revert NotImplemented();
    }

    /// @inheritdoc IAssetAdapter
    function pendingOf(address) external pure returns (uint256) {
        revert NotImplemented();
    }

    /// @inheritdoc IAssetAdapter
    function isAsync() external pure returns (bool) {
        return true;
    }

    /// @inheritdoc IAssetAdapter
    function deposit(uint256) external pure {
        revert NotImplemented();
    }

    /// @inheritdoc IAssetAdapter
    function withdraw(uint256) external pure {
        revert NotImplemented();
    }

    /// @inheritdoc IAssetAdapter
    function requestRedeem(uint256) external pure returns (uint256) {
        revert NotImplemented();
    }

    /// @inheritdoc IAssetAdapter
    function claim(uint256) external pure returns (uint256) {
        revert NotImplemented();
    }
}
