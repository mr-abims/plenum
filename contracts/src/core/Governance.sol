// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {IGovernance} from "../interfaces/IGovernance.sol";
import {Action, NotImplemented} from "../interfaces/Types.sol";

/// @title Governance
/// @notice Members approve escalations (quorum from MandateConfig.escalateQuorumBps), pause the manager
///         (k-of-n, MandateConfig.pauseQuorum) and, as stretch, replace it or change the mandate.
/// @dev Session 0 stub.
contract Governance is IGovernance, Initializable {
    address public plenum;
    address public mandate;
    address public gateway;
    bool public override paused;

    constructor() {
        _disableInitializers();
    }

    /// @inheritdoc IGovernance
    function initialize(address plenum_, address mandate_, address gateway_) external initializer {
        plenum = plenum_;
        mandate = mandate_;
        gateway = gateway_;
    }

    /// @inheritdoc IGovernance
    function propose(Action[] calldata, bytes32) external pure returns (uint256) {
        revert NotImplemented();
    }

    /// @inheritdoc IGovernance
    function approve(uint256) external pure {
        revert NotImplemented();
    }

    /// @inheritdoc IGovernance
    function executeProposal(uint256) external pure {
        revert NotImplemented();
    }

    /// @inheritdoc IGovernance
    function pause() external pure {
        revert NotImplemented();
    }

    /// @inheritdoc IGovernance
    function unpause() external pure {
        revert NotImplemented();
    }

    /// @inheritdoc IGovernance
    function replaceManager(address) external pure {
        revert NotImplemented();
    }
}
