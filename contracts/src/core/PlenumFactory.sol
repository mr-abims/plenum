// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {IPlenum} from "../interfaces/IPlenum.sol";
import {IMandate} from "../interfaces/IMandate.sol";
import {IGovernance} from "../interfaces/IGovernance.sol";
import {IManagerGateway} from "../interfaces/IManagerGateway.sol";
import {MandateConfig} from "../interfaces/Types.sol";

/// @title PlenumFactory
/// @notice Deploys one bundle per group as minimal-proxy clones: Plenum, Mandate, Governance, ManagerGateway
///         (SPEC A10). Shared singletons (NavOracle, ConsentRegistry) and the settlement asset are wired in.
contract PlenumFactory {
    /// @notice SPEC A3: lets Envio discover every bundle.
    event PlenumCreated(
        address indexed plenum, address mandate, address governance, address gateway, uint8 templateId, string name
    );

    address public immutable plenumImpl;
    address public immutable mandateImpl;
    address public immutable governanceImpl;
    address public immutable gatewayImpl;
    address public immutable asset;
    address public immutable navOracle;
    address public immutable consentRegistry;

    struct Deps {
        address plenumImpl;
        address mandateImpl;
        address governanceImpl;
        address gatewayImpl;
        address asset;
        address navOracle;
        address consentRegistry;
    }

    error ZeroManager();

    constructor(Deps memory d) {
        plenumImpl = d.plenumImpl;
        mandateImpl = d.mandateImpl;
        governanceImpl = d.governanceImpl;
        gatewayImpl = d.gatewayImpl;
        asset = d.asset;
        navOracle = d.navOracle;
        consentRegistry = d.consentRegistry;
    }

    /// @notice Create a plenum from a template (0 Conservative, 1 Balanced, 2 Liquidity-first) and its config.
    ///         The caller becomes the organizer. `manager` is the AI operator key.
    function createPlenum(string calldata name, uint8 templateId, MandateConfig calldata config, address manager)
        external
        returns (address plenum)
    {
        if (manager == address(0)) revert ZeroManager();

        plenum = Clones.clone(plenumImpl);
        address mandate = Clones.clone(mandateImpl);
        address governance = Clones.clone(governanceImpl);
        address gateway = Clones.clone(gatewayImpl);

        IPlenum(plenum)
            .initialize(
                IPlenum.InitParams({
                    name: name,
                    asset: asset,
                    mandate: mandate,
                    governance: governance,
                    gateway: gateway,
                    navOracle: navOracle,
                    organizer: msg.sender
                })
            );
        IMandate(mandate).initialize(plenum, navOracle, governance, config);
        IGovernance(governance).initialize(plenum, mandate, gateway);
        IManagerGateway(gateway).initialize(plenum, mandate, governance, manager);

        emit PlenumCreated(plenum, mandate, governance, gateway, templateId, name);
    }
}
