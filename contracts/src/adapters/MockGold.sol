// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAssetAdapter} from "../interfaces/IAssetAdapter.sol";

/// @title MockGold — MOCK
/// @notice MOCK gold position priced by an owner-set MOCK price (A-Token units per ounce, 6 decimals).
///         Holdings are tracked in ounces with 18 decimals. Sync exits are paid from the A-Token reserve;
///         when the MOCK price rises, the owner tops up the reserve with `fund`.
contract MockGold is IAssetAdapter, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant OZ = 1e18;

    address public immutable override asset;
    uint256 public price;
    mapping(address => uint256) public ounces;

    event PriceSet(uint256 price);
    event Bought(address indexed holder, uint256 assets, uint256 ounces);
    event Sold(address indexed holder, uint256 assets, uint256 ounces);
    event Funded(address indexed from, uint256 assets);

    error ZeroPrice();
    error AsyncNotSupported();
    error InsufficientOunces(uint256 needed, uint256 held);

    constructor(address aToken, uint256 initialPrice) Ownable(msg.sender) {
        if (initialPrice == 0) revert ZeroPrice();
        asset = aToken;
        price = initialPrice;
        emit PriceSet(initialPrice);
    }

    /// @notice MOCK: set the gold price. Owner only.
    function setPrice(uint256 newPrice) external onlyOwner {
        if (newPrice == 0) revert ZeroPrice();
        price = newPrice;
        emit PriceSet(newPrice);
    }

    /// @notice MOCK: add A-Token to the reserve that pays sales.
    function fund(uint256 assets) external {
        IERC20(asset).safeTransferFrom(msg.sender, address(this), assets);
        emit Funded(msg.sender, assets);
    }

    /// @inheritdoc IAssetAdapter
    function valueOf(address holder) external view returns (uint256) {
        return Math.mulDiv(ounces[holder], price, OZ);
    }

    /// @inheritdoc IAssetAdapter
    function pendingOf(address) external pure returns (uint256) {
        return 0;
    }

    /// @inheritdoc IAssetAdapter
    function claimable(uint256) external pure returns (uint256) {
        return 0;
    }

    /// @inheritdoc IAssetAdapter
    function isAsync() external pure returns (bool) {
        return false;
    }

    /// @inheritdoc IAssetAdapter
    function deposit(uint256 assets) external nonReentrant {
        uint256 oz = Math.mulDiv(assets, OZ, price);
        ounces[msg.sender] += oz;
        IERC20(asset).safeTransferFrom(msg.sender, address(this), assets);
        emit Bought(msg.sender, assets, oz);
    }

    /// @inheritdoc IAssetAdapter
    function withdraw(uint256 assets) external nonReentrant {
        uint256 oz = Math.mulDiv(assets, OZ, price, Math.Rounding.Ceil);
        uint256 held = ounces[msg.sender];
        if (oz > held) revert InsufficientOunces(oz, held);
        ounces[msg.sender] = held - oz;
        IERC20(asset).safeTransfer(msg.sender, assets);
        emit Sold(msg.sender, assets, oz);
    }

    /// @inheritdoc IAssetAdapter
    function requestRedeem(uint256) external pure returns (uint256) {
        revert AsyncNotSupported();
    }

    /// @inheritdoc IAssetAdapter
    function claim(uint256) external pure returns (uint256) {
        revert AsyncNotSupported();
    }
}
