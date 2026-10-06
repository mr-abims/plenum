// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/// @title IAssetAdapter
/// @notice Wraps one investable asset. Only `Plenum` calls the write functions.
interface IAssetAdapter {
    /// @notice The settlement asset (A-Token) this adapter takes and returns.
    function asset() external view returns (address);

    /// @notice Current value of `holder`'s position, in A-Token units (6 decimals).
    function valueOf(address holder) external view returns (uint256);

    /// @notice Pending (requested, unclaimed) value of `holder`, in A-Token units.
    function pendingOf(address holder) external view returns (uint256);

    /// @notice A-Token `requestId` would pay if claimed now (0 if unknown, not yet claimable or sync adapter).
    function claimable(uint256 requestId) external view returns (uint256);

    /// @notice True when exits are request/claim (ERC-7540 style) rather than immediate.
    function isAsync() external view returns (bool);

    /// @notice Pull `assets` A-Token from the caller and credit a position.
    function deposit(uint256 assets) external;

    /// @notice Return `assets` A-Token to the caller immediately. Sync adapters only.
    function withdraw(uint256 assets) external;

    /// @notice Start an async exit of `assets`. Async adapters only.
    function requestRedeem(uint256 assets) external returns (uint256 requestId);

    /// @notice Complete a matured async exit and send the A-Token to the caller.
    function claim(uint256 requestId) external returns (uint256 assets);
}
