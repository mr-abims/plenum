// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {IGovernance} from "../interfaces/IGovernance.sol";
import {IMandate} from "../interfaces/IMandate.sol";
import {IPlenum} from "../interfaces/IPlenum.sol";
import {Action, MandateConfig, NotImplemented, PolicyViolation, Reason, Unauthorized} from "../interfaces/Types.sol";

/// @title Governance
/// @notice Members approve escalations (quorum from MandateConfig.escalateQuorumBps), pause and unpause the
///         manager (k-of-n, MandateConfig.pauseQuorum) and, as stretch, replace it or change the mandate.
///         One onchain transaction per member vote; no relayer.
contract Governance is IGovernance, Initializable, ReentrancyGuard {
    uint256 internal constant BPS = 10_000;

    struct Proposal {
        bytes32 actionsHash;
        bytes32 rationaleHash;
        address proposer;
        uint64 deadline;
        uint32 approvals;
        bool executed;
    }

    address public plenum;
    address public mandate;
    address public gateway;
    bool public override paused;

    uint256 public proposalCount;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => Action[]) internal _actions;
    mapping(uint256 => mapping(address => bool)) public hasApproved;

    /// @dev Pause and unpause votes are counted per round; a round ends when the state flips.
    uint256 public pauseRound;
    uint256 public pauseVotes;
    mapping(uint256 => mapping(address => bool)) public votedInRound;

    error UnknownProposal(uint256 proposalId);
    error ProposalClosed(uint256 proposalId);
    error AlreadyApproved(uint256 proposalId, address member);
    error QuorumNotReached(uint256 proposalId);
    error AlreadyVoted(address member);

    constructor() {
        _disableInitializers();
    }

    modifier onlyMember() {
        _onlyMember();
        _;
    }

    function _onlyMember() internal view {
        if (!IPlenum(plenum).isMember(msg.sender)) revert Unauthorized(msg.sender);
    }

    /// @inheritdoc IGovernance
    function initialize(address plenum_, address mandate_, address gateway_) external initializer {
        plenum = plenum_;
        mandate = mandate_;
        gateway = gateway_;
    }

    /// @inheritdoc IGovernance
    function propose(Action[] calldata actions, bytes32 rationaleHash) external returns (uint256 proposalId) {
        if (msg.sender != gateway && !IPlenum(plenum).isMember(msg.sender)) revert Unauthorized(msg.sender);
        IMandate m = IMandate(mandate);
        for (uint256 k; k < actions.length; ++k) {
            if (!m.isAllowed(actions[k].adapter)) revert PolicyViolation(Reason.ADAPTER_NOT_ALLOWED);
        }
        MandateConfig memory c = m.config();
        proposalId = ++proposalCount;
        bytes32 actionsHash = keccak256(abi.encode(actions));
        proposals[proposalId] = Proposal({
            actionsHash: actionsHash,
            rationaleHash: rationaleHash,
            proposer: msg.sender,
            deadline: SafeCast.toUint64(block.timestamp + c.votingPeriod),
            approvals: 0,
            executed: false
        });
        Action[] storage stored = _actions[proposalId];
        for (uint256 k; k < actions.length; ++k) {
            stored.push(actions[k]);
        }
        emit Escalated(proposalId, actionsHash, rationaleHash);
    }

    /// @inheritdoc IGovernance
    function approve(uint256 proposalId) external onlyMember {
        Proposal storage p = _open(proposalId);
        if (hasApproved[proposalId][msg.sender]) revert AlreadyApproved(proposalId, msg.sender);
        hasApproved[proposalId][msg.sender] = true;
        ++p.approvals;
        emit Approved(proposalId, msg.sender);
    }

    /// @inheritdoc IGovernance
    /// @dev SPEC A2: re-checks allowlist and NAV freshness; bands, size and turnover are what members approved.
    function executeProposal(uint256 proposalId) external nonReentrant {
        Proposal storage p = _open(proposalId);
        if (!quorumReached(proposalId)) revert QuorumNotReached(proposalId);
        Action[] memory actions = _actions[proposalId];
        Reason r = IMandate(mandate).check(actions);
        if (r == Reason.ADAPTER_NOT_ALLOWED || r == Reason.NAV_STALE) revert PolicyViolation(r);
        p.executed = true;
        IPlenum(plenum).execute(actions);
        emit ProposalExecuted(proposalId);
    }

    /// @notice True when approvals × 10,000 ≥ escalateQuorumBps × member count.
    function quorumReached(uint256 proposalId) public view returns (bool) {
        uint256 members = IPlenum(plenum).memberCount();
        uint256 needBps = IMandate(mandate).config().escalateQuorumBps;
        return uint256(proposals[proposalId].approvals) * BPS >= needBps * members;
    }

    /// @notice The actions a proposal will execute.
    function actionsOf(uint256 proposalId) external view returns (Action[] memory) {
        return _actions[proposalId];
    }

    /// @inheritdoc IGovernance
    function pause() external onlyMember {
        if (paused) return;
        _vote();
        if (pauseVotes >= IMandate(mandate).config().pauseQuorum) {
            paused = true;
            _newRound();
            emit Paused(msg.sender);
        }
    }

    /// @inheritdoc IGovernance
    function unpause() external onlyMember {
        if (!paused) return;
        _vote();
        if (pauseVotes >= IMandate(mandate).config().pauseQuorum) {
            paused = false;
            _newRound();
            emit Unpaused(msg.sender);
        }
    }

    /// @inheritdoc IGovernance
    function replaceManager(address) external pure {
        revert NotImplemented(); // stretch: MG-6
    }

    function _open(uint256 proposalId) internal view returns (Proposal storage p) {
        if (proposalId == 0 || proposalId > proposalCount) revert UnknownProposal(proposalId);
        p = proposals[proposalId];
        if (p.executed || block.timestamp > p.deadline) revert ProposalClosed(proposalId);
    }

    function _vote() internal {
        if (votedInRound[pauseRound][msg.sender]) revert AlreadyVoted(msg.sender);
        votedInRound[pauseRound][msg.sender] = true;
        ++pauseVotes;
    }

    function _newRound() internal {
        ++pauseRound;
        pauseVotes = 0;
    }
}
