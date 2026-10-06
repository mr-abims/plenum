// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC4626} from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";
import {IAssetAdapter} from "../interfaces/IAssetAdapter.sol";
import {NotImplemented} from "../interfaces/Types.sol";

/// @title MockTBillVault — MOCK
/// @notice MOCK tokenised T-bill: ERC-4626 vault over the A-Token with simulated yield accrual. Sync exits.
/// @dev Session 0 stub: accrual and IAssetAdapter wrappers implemented in Session 1.
contract MockTBillVault is ERC4626, IAssetAdapter {
    constructor(IERC20 aToken) ERC20("MOCK T-Bill Vault", "mTBILL") ERC4626(aToken) {}

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
