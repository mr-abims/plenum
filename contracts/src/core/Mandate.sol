// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {IMandate} from "../interfaces/IMandate.sol";
import {Action, MandateConfig, NotImplemented, Reason} from "../interfaces/Types.sol";

/// @title Mandate
/// @notice One plenum's investment policy and its pure pre-trade check. `check` never reverts on policy.
/// @dev Session 0 stub. check() reads adapter.valueOf/pendingOf(plenum), plenum cash and NavOracle.latest(plenum);
///      RequestRedeem moves value to "pending", which counts toward its sleeve but not the cash floor.
contract Mandate is IMandate, Initializable {
    address public plenum;
    address public navOracle;
    address public governance;
    MandateConfig internal _config;

    constructor() {
        _disableInitializers();
    }

    /// @inheritdoc IMandate
    function initialize(address plenum_, address navOracle_, address governance_, MandateConfig calldata config_)
        external
        initializer
    {
        plenum = plenum_;
        navOracle = navOracle_;
        governance = governance_;
        _config = config_;
    }

    /// @inheritdoc IMandate
    function config() external view returns (MandateConfig memory) {
        return _config;
    }

    /// @inheritdoc IMandate
    function isAllowed(address adapter) public view returns (bool) {
        address[] storage list = _config.adapters;
        for (uint256 i; i < list.length; ++i) {
            if (list[i] == adapter) return true;
        }
        return false;
    }

    /// @inheritdoc IMandate
    function check(Action[] calldata) external pure returns (Reason) {
        revert NotImplemented();
    }

    /// @inheritdoc IMandate
    function scheduleChange(MandateConfig calldata) external pure {
        revert NotImplemented();
    }

    /// @inheritdoc IMandate
    function applyChange() external pure {
        revert NotImplemented();
    }
}
