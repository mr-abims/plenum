// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IAssetAdapter} from "../interfaces/IAssetAdapter.sol";
import {NotImplemented} from "../interfaces/Types.sol";

/// @title MockGold — MOCK
/// @notice MOCK gold position priced by an owner-set MOCK price (A-Token units per gold unit). Sync exits.
/// @dev Session 0 stub.
contract MockGold is IAssetAdapter, Ownable {
    address public immutable override asset;
    uint256 public price;

    event PriceSet(uint256 price);

    constructor(address aToken, uint256 initialPrice) Ownable(msg.sender) {
        asset = aToken;
        price = initialPrice;
        emit PriceSet(initialPrice);
    }

    /// @notice MOCK: set the gold price. Owner only.
    function setPrice(uint256 newPrice) external onlyOwner {
        price = newPrice;
        emit PriceSet(newPrice);
    }

    /// @inheritdoc IAssetAdapter
    function valueOf(address) external pure returns (uint256) {
        revert NotImplemented();
    }

    /// @inheritdoc IAssetAdapter
    function pendingOf(address) external pure returns (uint256) {
        return 0;
    }

    /// @inheritdoc IAssetAdapter
    function isAsync() external pure returns (bool) {
        return false;
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
