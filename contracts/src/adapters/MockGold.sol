// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAssetAdapter} from "../interfaces/IAssetAdapter.sol";
import {ReceiverTemplate} from "../vendor/ReceiverTemplate.sol";

/// @title MockGold — MOCK
/// @notice MOCK gold position priced at the **real** gold spot price: the Chainlink CRE workflow fetches it from
///         an external market-data API with node consensus and reports it here through the CRE forwarder
///         (report = abi.encode(uint256 price, uint64 timestamp), settlement-asset units per troy ounce, 6 decimals).
///         Holdings are tracked in ounces with 18 decimals. Sync exits are paid from the settlement-asset reserve
///         (topped up with `fund`). The asset itself is MOCK; only its price is real.
/// @dev A report may move the price at most MAX_MOVE_BPS from the last one (circuit breaker against a bad feed).
///      FALLBACK: the owner can still `setPrice` for local chains and demo resilience.
contract MockGold is IAssetAdapter, ReceiverTemplate, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant OZ = 1e18;
    uint256 public constant MAX_MOVE_BPS = 2_000;

    address public immutable override asset;
    uint256 public price;
    uint64 public priceTimestamp;
    mapping(address => uint256) public ounces;

    event PriceSet(uint256 price);
    event PriceReported(uint256 price, uint64 timestamp);
    event Bought(address indexed holder, uint256 assets, uint256 ounces);
    event Sold(address indexed holder, uint256 assets, uint256 ounces);
    event Funded(address indexed from, uint256 assets);

    error ZeroPrice();
    error StalePrice(uint64 timestamp, uint64 latest);
    error FuturePrice(uint64 timestamp);
    error PriceJump(uint256 from, uint256 to);
    error AsyncNotSupported();
    error InsufficientOunces(uint256 needed, uint256 held);

    constructor(address asset_, uint256 initialPrice, address forwarder) ReceiverTemplate(forwarder) {
        if (initialPrice == 0) revert ZeroPrice();
        asset = asset_;
        price = initialPrice;
        emit PriceSet(initialPrice);
    }

    /// @notice FALLBACK: set the gold price directly. Owner only (local chains, demo resilience).
    function setPrice(uint256 newPrice) external onlyOwner {
        if (newPrice == 0) revert ZeroPrice();
        price = newPrice;
        emit PriceSet(newPrice);
    }

    /// @notice CRE price report: the real spot price, fetched off-chain with node consensus.
    function _processReport(bytes calldata report) internal override {
        (uint256 newPrice, uint64 timestamp) = abi.decode(report, (uint256, uint64));
        if (newPrice == 0) revert ZeroPrice();
        if (timestamp <= priceTimestamp) revert StalePrice(timestamp, priceTimestamp);
        if (timestamp > block.timestamp) revert FuturePrice(timestamp);
        uint256 old = price;
        uint256 move = newPrice > old ? newPrice - old : old - newPrice;
        if (move * 10_000 > old * MAX_MOVE_BPS) revert PriceJump(old, newPrice);
        price = newPrice;
        priceTimestamp = timestamp;
        emit PriceReported(newPrice, timestamp);
    }

    /// @notice MOCK: add settlement asset to the reserve that pays sales.
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
