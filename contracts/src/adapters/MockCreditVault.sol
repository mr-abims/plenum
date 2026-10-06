// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAssetAdapter} from "../interfaces/IAssetAdapter.sol";

/// @title MockCreditVault — MOCK
/// @notice MOCK private-credit vault with ERC-7540-style async exits: requestRedeem → claimable after
///         `redeemDelay` seconds → claim. Pending value counts toward the credit sleeve, not the cash floor.
///         Gains are simulated by `accrue`. Hand-rolled (minimal) rather than a full ERC-7540 implementation.
contract MockCreditVault is IAssetAdapter, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Request {
        address owner;
        uint192 assets;
        uint64 claimableAt;
    }

    address public immutable override asset;
    uint32 public immutable redeemDelay;

    mapping(address => uint256) public balances;
    mapping(address => uint256) public pending;
    mapping(uint256 => Request) public requests;
    uint256 public nextRequestId = 1;

    event Deposited(address indexed holder, uint256 assets);
    event RedeemRequested(address indexed holder, uint256 indexed requestId, uint256 assets, uint64 claimableAt);
    event Claimed(address indexed holder, uint256 indexed requestId, uint256 assets);
    event Accrued(address indexed holder, uint256 assets);

    error SyncNotSupported();
    error InsufficientBalance(uint256 requested, uint256 available);
    error NotRequestOwner(uint256 requestId);
    error NotClaimableYet(uint256 requestId, uint64 claimableAt);

    constructor(address aToken, uint32 redeemDelay_) {
        asset = aToken;
        redeemDelay = redeemDelay_;
    }

    /// @notice MOCK: simulate a credit gain of `assets` for `holder`, funded by the caller.
    function accrue(address holder, uint256 assets) external nonReentrant {
        balances[holder] += assets;
        IERC20(asset).safeTransferFrom(msg.sender, address(this), assets);
        emit Accrued(holder, assets);
    }

    /// @inheritdoc IAssetAdapter
    function valueOf(address holder) external view returns (uint256) {
        return balances[holder];
    }

    /// @inheritdoc IAssetAdapter
    function pendingOf(address holder) external view returns (uint256) {
        return pending[holder];
    }

    /// @inheritdoc IAssetAdapter
    function claimable(uint256 requestId) external view returns (uint256) {
        Request memory r = requests[requestId];
        return block.timestamp >= r.claimableAt ? r.assets : 0;
    }

    /// @inheritdoc IAssetAdapter
    function isAsync() external pure returns (bool) {
        return true;
    }

    /// @inheritdoc IAssetAdapter
    function deposit(uint256 assets) external nonReentrant {
        balances[msg.sender] += assets;
        IERC20(asset).safeTransferFrom(msg.sender, address(this), assets);
        emit Deposited(msg.sender, assets);
    }

    /// @inheritdoc IAssetAdapter
    function withdraw(uint256) external pure {
        revert SyncNotSupported();
    }

    /// @inheritdoc IAssetAdapter
    function requestRedeem(uint256 assets) external returns (uint256 requestId) {
        uint256 bal = balances[msg.sender];
        if (assets > bal) revert InsufficientBalance(assets, bal);
        balances[msg.sender] = bal - assets;
        pending[msg.sender] += assets;
        requestId = nextRequestId++;
        uint64 at = SafeCast.toUint64(block.timestamp) + redeemDelay;
        requests[requestId] = Request({owner: msg.sender, assets: SafeCast.toUint192(assets), claimableAt: at});
        emit RedeemRequested(msg.sender, requestId, assets, at);
    }

    /// @inheritdoc IAssetAdapter
    function claim(uint256 requestId) external nonReentrant returns (uint256 assets) {
        Request memory r = requests[requestId];
        if (r.owner != msg.sender) revert NotRequestOwner(requestId);
        if (block.timestamp < r.claimableAt) revert NotClaimableYet(requestId, r.claimableAt);
        assets = r.assets;
        delete requests[requestId];
        pending[msg.sender] -= assets;
        IERC20(asset).safeTransfer(msg.sender, assets);
        emit Claimed(msg.sender, requestId, assets);
    }
}
