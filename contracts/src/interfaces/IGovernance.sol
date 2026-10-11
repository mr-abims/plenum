// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Action} from "./Types.sol";

/// @title IGovernance
/// @notice Members approve escalations, pause the manager and (stretch) replace it or change the mandate.
interface IGovernance {
    event Escalated(uint256 indexed proposalId, bytes32 actionsHash, bytes32 rationaleHash);
    event Approved(uint256 indexed proposalId, address indexed member);
    event ProposalExecuted(uint256 indexed proposalId);
    event Paused(address by);
    event Unpaused(address by);
    event ManagerReplaced(address oldManager, address newManager);

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

    /// @notice Stretch (MG-6): replace the manager operator key after a member vote.
    function replaceManager(address newManager) external;

    /// @notice True while the manager is paused.
    function paused() external view returns (bool);
}
