// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {IManagerGateway} from "../interfaces/IManagerGateway.sol";
import {Action, NotImplemented, Reason, Unauthorized} from "../interfaces/Types.sol";

/// @title ManagerGateway
/// @notice The AI manager's only entry point. Owns cooldown and daily-turnover state; re-runs every check
///         onchain before Plenum.execute. There is no path from here that sends money outside the allowlist.
/// @dev Session 0 stub.
contract ManagerGateway is IManagerGateway, Initializable {
    address public plenum;
    address public mandate;
    address public governance;
    address public override manager;

    uint64 public lastExecution;
    uint64 public turnoverDay;
    uint256 public turnoverToday;

    constructor() {
        _disableInitializers();
    }

    /// @inheritdoc IManagerGateway
    function initialize(address plenum_, address mandate_, address governance_, address manager_) external initializer {
        plenum = plenum_;
        mandate = mandate_;
        governance = governance_;
        manager = manager_;
    }

    /// @inheritdoc IManagerGateway
    function simulate(Action[] calldata) external pure returns (Reason) {
        revert NotImplemented();
    }

    /// @inheritdoc IManagerGateway
    function executeInBand(Action[] calldata, bytes32, bytes32) external view returns (Reason) {
        if (msg.sender != manager) revert Unauthorized(msg.sender);
        revert NotImplemented();
    }

    /// @inheritdoc IManagerGateway
    function escalate(Action[] calldata, bytes32, bytes32) external view returns (uint256) {
        if (msg.sender != manager) revert Unauthorized(msg.sender);
        revert NotImplemented();
    }

    /// @inheritdoc IManagerGateway
    function setManager(address) external view {
        if (msg.sender != governance) revert Unauthorized(msg.sender);
        revert NotImplemented();
    }
}
