// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {IPlenum} from "../interfaces/IPlenum.sol";
import {Action, NotImplemented, Unauthorized} from "../interfaces/Types.sol";

/// @title Plenum
/// @notice One group's members, non-transferable units and A-Token custody. Executes actions only when called
///         by its ManagerGateway or Governance, after their checks pass. Deployed as a minimal-proxy clone.
/// @dev Session 0 stub. Pricing (SPEC §7, amendments A4/A8): units = assets × (U + 10^6) / (V + 1), where
///      V = latest NAV + net flows since that report; V = 0 while U = 0 (bootstrap, decision 5).
contract Plenum is IPlenum, Initializable {
    string public name;
    address public aToken;
    address public mandate;
    address public governance;
    address public gateway;
    address public navOracle;
    address public complianceGate;
    address public organizer;

    uint256 public override totalUnits;
    uint256 public override memberCount;
    mapping(address => uint256) public override unitsOf;
    mapping(address => bool) public override isMember;

    /// @dev NAV race handling (decision 6): flows since the last NAV report the plenum has seen.
    uint64 public lastNavTimestamp;
    int256 public netFlowSince;

    constructor() {
        _disableInitializers();
    }

    /// @inheritdoc IPlenum
    function initialize(InitParams calldata p) external initializer {
        name = p.name;
        aToken = p.aToken;
        mandate = p.mandate;
        governance = p.governance;
        gateway = p.gateway;
        navOracle = p.navOracle;
        complianceGate = p.complianceGate;
        organizer = p.organizer;
    }

    /// @inheritdoc IPlenum
    function join(bytes calldata, bytes32) external pure {
        revert NotImplemented();
    }

    /// @inheritdoc IPlenum
    function contribute(uint256) external pure returns (uint256) {
        revert NotImplemented();
    }

    /// @inheritdoc IPlenum
    function redeem(uint256, address) external pure returns (uint256) {
        revert NotImplemented();
    }

    /// @inheritdoc IPlenum
    function execute(Action[] calldata) external view {
        if (msg.sender != gateway && msg.sender != governance) revert Unauthorized(msg.sender);
        revert NotImplemented();
    }

    /// @inheritdoc IPlenum
    function cash() external pure returns (uint256) {
        revert NotImplemented();
    }
}
