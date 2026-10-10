// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IManagerGateway} from "../interfaces/IManagerGateway.sol";
import {IMandate} from "../interfaces/IMandate.sol";
import {IGovernance} from "../interfaces/IGovernance.sol";
import {IPlenum} from "../interfaces/IPlenum.sol";
import {Action, MandateConfig, Op, PolicyViolation, Reason, Unauthorized} from "../interfaces/Types.sol";

/// @title ManagerGateway
/// @notice The AI manager's only entry point. Owns cooldown and daily-turnover state (SPEC A4) and re-runs every
///         check onchain before Plenum.execute. No path from here sends money outside the mandate's adapters.
/// @dev Refusals are hybrid (SPEC A1): unauthorised caller, PAUSED and ADAPTER_NOT_ALLOWED revert; other policy
///      reasons emit ManagerAction with the reason and change nothing.
contract ManagerGateway is IManagerGateway, Initializable, ReentrancyGuard {
    uint256 internal constant BPS = 10_000;

    address public plenum;
    address public mandate;
    address public governance;
    address public override manager;

    uint64 public lastExecution;
    uint64 public turnoverDay;
    uint256 public turnoverToday;

    event ManagerSet(address indexed manager);

    constructor() {
        _disableInitializers();
    }

    modifier onlyManager() {
        _onlyManager();
        _;
    }

    function _onlyManager() internal view {
        if (msg.sender != manager) revert Unauthorized(msg.sender);
    }

    /// @inheritdoc IManagerGateway
    function initialize(address plenum_, address mandate_, address governance_, address manager_) external initializer {
        plenum = plenum_;
        mandate = mandate_;
        governance = governance_;
        manager = manager_;
        emit ManagerSet(manager_);
    }

    /// @inheritdoc IManagerGateway
    function simulate(Action[] calldata actions) public view returns (Reason) {
        if (IGovernance(governance).paused()) return Reason.PAUSED;
        // Policy first, so an out-of-authority trade always surfaces as an escalation reason (SPEC A4).
        Reason r = IMandate(mandate).check(actions);
        if (r != Reason.OK) return r;
        MandateConfig memory c = IMandate(mandate).config();
        if (lastExecution != 0 && block.timestamp < uint256(lastExecution) + c.cooldown) return Reason.COOLDOWN;
        uint256 total = IMandate(mandate).holdingsTotal();
        if ((_turnoverUsed() + _volume(actions)) * BPS > uint256(c.maxDailyTurnoverBps) * total) {
            return Reason.TURNOVER_CAP;
        }
        return Reason.OK;
    }

    /// @inheritdoc IManagerGateway
    function executeInBand(Action[] calldata actions, bytes32 rationaleHash, bytes32 modelId)
        external
        nonReentrant
        onlyManager
        returns (Reason r)
    {
        _requireAllowlisted(actions);
        r = simulate(actions);
        if (r == Reason.PAUSED || r == Reason.ADAPTER_NOT_ALLOWED) revert PolicyViolation(r);
        bytes32 actionsHash = keccak256(abi.encode(actions));
        if (r != Reason.OK) {
            emit ManagerAction(actionsHash, rationaleHash, modelId, r);
            return r;
        }

        uint64 day = SafeCast.toUint64(block.timestamp / 1 days);
        turnoverToday = _turnoverUsed() + _volume(actions);
        turnoverDay = day;
        lastExecution = SafeCast.toUint64(block.timestamp);

        IPlenum(plenum).execute(actions);
        emit ManagerAction(actionsHash, rationaleHash, modelId, Reason.OK);
    }

    /// @inheritdoc IManagerGateway
    /// @dev Emits ManagerAction with the reason the actions are out of the manager's authority, and Governance
    ///      emits Escalated in the same transaction.
    function escalate(Action[] calldata actions, bytes32 rationaleHash, bytes32 modelId)
        external
        nonReentrant
        onlyManager
        returns (uint256 proposalId)
    {
        if (IGovernance(governance).paused()) revert PolicyViolation(Reason.PAUSED);
        _requireAllowlisted(actions);
        Reason why = IMandate(mandate).check(actions);
        proposalId = IGovernance(governance).propose(actions, rationaleHash);
        emit ManagerAction(keccak256(abi.encode(actions)), rationaleHash, modelId, why);
    }

    /// @inheritdoc IManagerGateway
    function setManager(address newManager) external {
        if (msg.sender != governance) revert Unauthorized(msg.sender);
        manager = newManager;
        emit ManagerSet(newManager);
    }

    function _requireAllowlisted(Action[] calldata actions) internal view {
        IMandate m = IMandate(mandate);
        for (uint256 k; k < actions.length; ++k) {
            if (!m.isAllowed(actions[k].adapter)) revert PolicyViolation(Reason.ADAPTER_NOT_ALLOWED);
        }
    }

    function _turnoverUsed() internal view returns (uint256) {
        return turnoverDay == block.timestamp / 1 days ? turnoverToday : 0;
    }

    /// @dev Claims only convert pending value to cash, so they do not count toward turnover.
    function _volume(Action[] calldata actions) internal pure returns (uint256 v) {
        for (uint256 k; k < actions.length; ++k) {
            if (actions[k].op != Op.Claim) v += actions[k].assets;
        }
    }
}
