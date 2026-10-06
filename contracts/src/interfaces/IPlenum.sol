// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Action, Op, Reason} from "./Types.sol";

/// @title IPlenum
/// @notice One group: members, non-transferable units, A-Token custody. Only Plenum moves money into adapters.
interface IPlenum {
    struct InitParams {
        string name;
        address aToken;
        address mandate;
        address governance;
        address gateway;
        address navOracle;
        address complianceGate;
        address organizer;
    }

    /// @notice Amendment A3. `encPubKey` is the member's X25519 data-room public key (not personal data).
    event MemberJoined(address indexed member, bytes32 encPubKey);
    /// @notice `navPerUnit` = A-Token units (6 decimals) per whole unit (1e12 base units, amendment A8).
    event Contributed(address indexed member, uint256 assets, uint256 units, uint256 navPerUnit);
    event Redeemed(address indexed member, uint256 units, uint256 assets, address to);
    /// @notice One executed action. `result` = requestId for RequestRedeem, assets received for Claim, else 0.
    event ActionExecuted(address indexed adapter, Op op, uint256 assets, uint256 result);
    /// @notice Logged instead of reverting when an unverified party is refused (amendment A1).
    event ComplianceRefused(address indexed account, Reason reason);

    /// @notice One-time setup by the factory.
    function initialize(InitParams calldata params) external;

    /// @notice Join with an invite. Verified identities only; capped at `maxMembers`.
    ///         Invite format is decided in Session 1.
    function join(bytes calldata invite, bytes32 encPubKey) external;

    /// @notice Contribute `assets` A-Token; mints units at the current NAV per unit (virtual offset, δ = 6).
    function contribute(uint256 assets) external returns (uint256 units);

    /// @notice Burn `units` and pay A-Token from the cash sleeve to verified address `to`.
    function redeem(uint256 units, address to) external returns (uint256 assets);

    /// @notice Run actions against allowlisted adapters. Only ManagerGateway or Governance.
    function execute(Action[] calldata actions) external;

    function unitsOf(address member) external view returns (uint256);
    function totalUnits() external view returns (uint256);
    function isMember(address account) external view returns (bool);
    function memberCount() external view returns (uint256);
    /// @notice A-Token held as cash by this plenum.
    function cash() external view returns (uint256);
}
