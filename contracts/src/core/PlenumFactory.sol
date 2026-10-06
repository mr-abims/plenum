// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {MandateConfig, NotImplemented} from "../interfaces/Types.sol";

/// @title PlenumFactory
/// @notice Deploys one bundle per group as minimal-proxy clones: Plenum, Mandate, Governance, ManagerGateway
///         (decision 4). Shared singletons (NavOracle, ComplianceGate, ConsentRegistry) are wired in. Registers
///         each new Plenum with the A-Token so it may hold it (amendment A9). Callers must be verified.
/// @dev Session 0 stub.
contract PlenumFactory {
    /// @notice Amendment A3: lets Envio discover every bundle.
    event PlenumCreated(
        address indexed plenum, address mandate, address governance, address gateway, uint8 templateId, string name
    );

    address public immutable plenumImpl;
    address public immutable mandateImpl;
    address public immutable governanceImpl;
    address public immutable gatewayImpl;
    address public immutable aToken;
    address public immutable navOracle;
    address public immutable complianceGate;
    address public immutable consentRegistry;

    struct Deps {
        address plenumImpl;
        address mandateImpl;
        address governanceImpl;
        address gatewayImpl;
        address aToken;
        address navOracle;
        address complianceGate;
        address consentRegistry;
    }

    constructor(Deps memory d) {
        plenumImpl = d.plenumImpl;
        mandateImpl = d.mandateImpl;
        governanceImpl = d.governanceImpl;
        gatewayImpl = d.gatewayImpl;
        aToken = d.aToken;
        navOracle = d.navOracle;
        complianceGate = d.complianceGate;
        consentRegistry = d.consentRegistry;
    }

    /// @notice Create a plenum from a template (0 Conservative, 1 Balanced, 2 Liquidity-first) and config.
    ///         Any verified member. `manager` is the AI operator key for the new ManagerGateway.
    function createPlenum(string calldata, uint8, MandateConfig calldata, address) external pure returns (address) {
        revert NotImplemented();
    }
}
