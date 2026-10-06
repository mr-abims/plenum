// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Action, Reason} from "./Types.sol";

/// @title IManagerGateway
/// @notice The AI manager's only entry point. Owns cooldown and turnover state (amendment A4).
interface IManagerGateway {
    /// @notice Emitted on success (reason OK) and on policy refusal (amendment A1). `modelId` and the memo
    ///         behind `rationaleHash` (which includes the prompt-template version) give provenance.
    event ManagerAction(bytes32 indexed actionsHash, bytes32 rationaleHash, bytes32 modelId, Reason reason);

    /// @notice One-time setup by the factory.
    function initialize(address plenum, address mandate, address governance, address manager) external;

    /// @notice Current manager operator key.
    function manager() external view returns (address);

    /// @notice Full pre-flight: paused → cooldown → turnover → Mandate.check. Used by the agent's `simulate` tool.
    function simulate(Action[] calldata actions) external view returns (Reason);

    /// @notice Execute in-band actions. Manager only. Reverts on unauthorised caller, PAUSED or
    ///         ADAPTER_NOT_ALLOWED; other refusals emit ManagerAction with the reason and change nothing.
    function executeInBand(Action[] calldata actions, bytes32 rationaleHash, bytes32 modelId) external returns (Reason);

    /// @notice Turn out-of-band actions into a Governance proposal. Manager only. Nothing moves until approved.
    function escalate(Action[] calldata actions, bytes32 rationaleHash, bytes32 modelId)
        external
        returns (uint256 proposalId);

    /// @notice Swap the manager key. Governance only.
    function setManager(address newManager) external;
}
