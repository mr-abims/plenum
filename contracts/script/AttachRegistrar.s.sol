// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {MockIdentityProvider} from "../src/compliance/MockIdentityProvider.sol";
import {CleanverseAttestationRegistrar} from "../src/compliance/CleanverseAttestationRegistrar.sol";

/// @notice Adds the Cleanverse attestation registrar to an existing deployment (SPEC A22): deploys it and hands it
///         ownership of the identity store, so identities change only through signed attestations. Nothing else is
///         redeployed. Env: DEPLOYER_PRIVATE_KEY (current owner of the identity store), CLEANVERSE_ATTESTER_KEY.
contract AttachRegistrar is Script {
    function run() external {
        require(block.chainid == 10143 || block.chainid == 31337, "Monad testnet or local only");
        string memory path = string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".json");
        MockIdentityProvider identity =
            MockIdentityProvider(vm.parseJsonAddress(vm.readFile(path), ".identityProvider"));
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address attester = vm.addr(vm.envUint("CLEANVERSE_ATTESTER_KEY"));
        require(identity.owner() == vm.addr(pk), "deployer must own the identity store");

        vm.startBroadcast(pk);
        CleanverseAttestationRegistrar registrar = new CleanverseAttestationRegistrar(identity, attester, vm.addr(pk));
        identity.transferOwnership(address(registrar));
        vm.stopBroadcast();

        vm.writeJson(vm.toString(address(registrar)), path, ".attestationRegistrar");
        vm.writeJson(vm.toString(attester), path, ".cleanverseAttester");
        console.log("Registrar", address(registrar));
        console.log("MOCK Cleanverse attester", attester);
    }
}
