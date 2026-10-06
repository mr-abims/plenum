// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IAssetAdapter} from "../interfaces/IAssetAdapter.sol";

/// @title MockTBillVault — MOCK
/// @notice MOCK tokenised T-bill: ERC-4626 vault over the A-Token. Yield is simulated by `accrue`, which pulls
///         A-Token in without minting shares, so every holder's value rises. Sync exits.
contract MockTBillVault is ERC4626, IAssetAdapter {
    using SafeERC20 for IERC20;

    event Accrued(address indexed from, uint256 assets);

    error AsyncNotSupported();

    constructor(IERC20 aToken) ERC20("MOCK T-Bill Vault", "mTBILL") ERC4626(aToken) {}

    /// @notice MOCK: simulate yield by donating `assets` A-Token to the vault.
    function accrue(uint256 assets) external {
        IERC20(asset()).safeTransferFrom(msg.sender, address(this), assets);
        emit Accrued(msg.sender, assets);
    }

    /// @inheritdoc IAssetAdapter
    function asset() public view override(ERC4626, IAssetAdapter) returns (address) {
        return super.asset();
    }

    /// @inheritdoc IAssetAdapter
    function valueOf(address holder) external view returns (uint256) {
        return convertToAssets(balanceOf(holder));
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
    function deposit(uint256 assets) external {
        _deposit(msg.sender, msg.sender, assets, previewDeposit(assets));
    }

    /// @inheritdoc IAssetAdapter
    function withdraw(uint256 assets) external {
        uint256 maxAssets = maxWithdraw(msg.sender);
        if (assets > maxAssets) revert ERC4626ExceededMaxWithdraw(msg.sender, assets, maxAssets);
        _withdraw(msg.sender, msg.sender, msg.sender, assets, previewWithdraw(assets));
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
