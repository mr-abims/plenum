// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Action, MandateConfig} from "./Types.sol";

/// @title IGovernance
/// @notice Members approve escalations, pause the manager, change the mandate and replace the manager (SPEC A26).
interface IGovernance {
    event Escalated(uint256 indexed proposalId, bytes32 actionsHash, bytes32 rationaleHash);
    event Approved(uint256 indexed proposalId, address indexed member);
    event ProposalExecuted(uint256 indexed proposalId);
    event Paused(address by);
    event Unpaused(address by);
    event ManagerReplaced(address oldManager, address newManager);
    /// @notice A member proposed new rules; `configHash` = keccak256(abi.encode(config)).
    event MandateChangeProposed(uint256 indexed proposalId, bytes32 configHash, bytes32 rationaleHash);
    /// @notice A member proposed a new manager operator key.
    event ManagerReplacementProposed(uint256 indexed proposalId, address newManager, bytes32 rationaleHash);

    /// @notice One-time setup by the factory.
    function initialize(address plenum, address mandate, address gateway) external;

    /// @notice Open a proposal to execute `actions`. Members or ManagerGateway (escalations).
    function propose(Action[] calldata actions, bytes32 rationaleHash) external returns (uint256 proposalId);

    /// @notice Approve a proposal (one onchain tx per member, signed with their passkey account). Members only.
    function approve(uint256 proposalId) external;

    /// @notice Execute a proposal that reached quorum within its window. Re-checks the allowlist and NAV freshness
    ///         (amendment A2). Anyone may call.
    function executeProposal(uint256 proposalId) external;

    /// @notice Cast a pause vote; the manager is paused once `pauseQuorum` members have voted. Members only.
    function pause() external;

    /// @notice Lift the pause. Members only (quorum rule set in Session 2).
    function unpause() external;

    /// @notice Propose new rules. Members only. Passes with `mandateChangeBps` of members; executing it queues the
    ///         config in Mandate behind the current timelock.
    function proposeMandateChange(MandateConfig calldata config, bytes32 rationaleHash)
        external
        returns (uint256 proposalId);
    /// @notice Propose a new manager operator key. Members only. Passes with `mandateChangeBps` of members and takes
    ///         effect when executed.
    function proposeManagerReplacement(address newManager, bytes32 rationaleHash) external returns (uint256 proposalId);
    /// @notice True while the manager is paused.
    function paused() external view returns (bool);
}
