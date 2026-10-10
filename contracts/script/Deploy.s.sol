// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {Plenum} from "../src/core/Plenum.sol";
import {Mandate} from "../src/core/Mandate.sol";
import {Governance} from "../src/core/Governance.sol";
import {ManagerGateway} from "../src/core/ManagerGateway.sol";
import {NavOracle} from "../src/core/NavOracle.sol";
import {ConsentRegistry} from "../src/core/ConsentRegistry.sol";
import {PlenumFactory} from "../src/core/PlenumFactory.sol";
import {ComplianceGate} from "../src/compliance/ComplianceGate.sol";
import {MockIdentityProvider} from "../src/compliance/MockIdentityProvider.sol";
import {CleanverseAttestationRegistrar} from "../src/compliance/CleanverseAttestationRegistrar.sol";
import {MockAToken} from "../src/mocks/MockAToken.sol";
import {MockTBillVault} from "../src/adapters/MockTBillVault.sol";
import {MockCreditVault} from "../src/adapters/MockCreditVault.sol";
import {MockGold} from "../src/adapters/MockGold.sol";

/// @notice Deploys the shared singletons, MOCK identity/A-Token/adapters, bundle implementations and the factory,
///         then writes addresses to deployments/<chainId>.json. Monad testnet (10143) or a local chain only.
/// @dev Env: DEPLOYER_PRIVATE_KEY, FALLBACK_NAV_WRITER_KEY, CRE_FORWARDER (defaults to the CRE mock forwarder
///      for `cre workflow simulate --broadcast`), CREDIT_REDEEM_DELAY (seconds, default 300),
///      CLEANVERSE_ATTESTER_KEY (MOCK attester until Cleanverse issues a signer; anvil key 4 locally).
contract Deploy is Script {
    address constant CRE_MOCK_FORWARDER_MONAD_TESTNET = 0xB9F79d863261869B234c481D1f9A7af84AeAd192;
    uint256 constant ANVIL_KEY_0 = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    uint256 constant ANVIL_KEY_1 = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
    uint256 constant ANVIL_KEY_4 = 0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a;

    struct Deployed {
        address deployer;
        address fallbackWriter;
        address forwarder;
        uint256 startBlock;
        MockIdentityProvider identity;
        MockAToken aToken;
        NavOracle oracle;
        ComplianceGate gate;
        ConsentRegistry consent;
        MockTBillVault tbill;
        MockCreditVault credit;
        MockGold gold;
        PlenumFactory factory;
        CleanverseAttestationRegistrar registrar;
        address attester;
    }

    function run() external {
        require(block.chainid == 10143 || block.chainid == 31337, "Monad testnet or local only");
        uint256 pk = vm.envOr("DEPLOYER_PRIVATE_KEY", ANVIL_KEY_0);
        Deployed memory d;
        d.deployer = vm.addr(pk);
        d.fallbackWriter = vm.addr(vm.envOr("FALLBACK_NAV_WRITER_KEY", ANVIL_KEY_1));
        d.forwarder = vm.envOr("CRE_FORWARDER", CRE_MOCK_FORWARDER_MONAD_TESTNET);
        d.attester = vm.addr(vm.envOr("CLEANVERSE_ATTESTER_KEY", ANVIL_KEY_4));
        d.startBlock = block.number;
        uint32 redeemDelay = uint32(vm.envOr("CREDIT_REDEEM_DELAY", uint256(300)));

        vm.startBroadcast(pk);
        _deploySingletons(d, redeemDelay);
        d.factory = _deployFactory(d);
        _wire(d);
        vm.stopBroadcast();

        _write(d);
    }

    function _deploySingletons(Deployed memory d, uint32 redeemDelay) internal {
        d.identity = new MockIdentityProvider();
        d.aToken = new MockAToken(d.identity);
        d.oracle = new NavOracle(d.forwarder, d.fallbackWriter);
        d.gate = new ComplianceGate(d.identity);
        d.consent = new ConsentRegistry();
        d.tbill = new MockTBillVault(d.aToken);
        d.credit = new MockCreditVault(address(d.aToken), redeemDelay);
        d.gold = new MockGold(address(d.aToken), 2_400e6);
    }

    function _deployFactory(Deployed memory d) internal returns (PlenumFactory) {
        return new PlenumFactory(
            PlenumFactory.Deps({
                plenumImpl: address(new Plenum()),
                mandateImpl: address(new Mandate()),
                governanceImpl: address(new Governance()),
                gatewayImpl: address(new ManagerGateway()),
                aToken: address(d.aToken),
                navOracle: address(d.oracle),
                complianceGate: address(d.gate),
                consentRegistry: address(d.consent)
            })
        );
    }

    function _wire(Deployed memory d) internal {
        MockAToken t = d.aToken;
        t.grantRole(t.REGISTER_ROLE(), address(d.factory));
        t.grantRole(t.REGISTER_ROLE(), d.deployer);
        t.grantRole(t.MINTER_ROLE(), d.deployer);
        t.registerApass(address(d.tbill));
        t.registerApass(address(d.credit));
        t.registerApass(address(d.gold));
        d.identity.setIdentity(d.deployer, true, 1, bytes2("US")); // MOCK: demo operator funds MOCK yield
        // From here on, identities change only through signed Cleanverse attestations (SPEC A22).
        d.registrar = new CleanverseAttestationRegistrar(d.identity, d.attester, d.deployer);
        d.identity.transferOwnership(address(d.registrar));
    }

    function _write(Deployed memory d) internal {
        string memory k = "deployment";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeUint(k, "startBlock", d.startBlock);
        vm.serializeAddress(k, "deployer", d.deployer);
        vm.serializeAddress(k, "fallbackNavWriter", d.fallbackWriter);
        vm.serializeAddress(k, "creForwarder", d.forwarder);
        vm.serializeAddress(k, "identityProvider", address(d.identity));
        vm.serializeAddress(k, "attestationRegistrar", address(d.registrar));
        vm.serializeAddress(k, "cleanverseAttester", d.attester);
        vm.serializeAddress(k, "aToken", address(d.aToken));
        vm.serializeAddress(k, "navOracle", address(d.oracle));
        vm.serializeAddress(k, "complianceGate", address(d.gate));
        vm.serializeAddress(k, "consentRegistry", address(d.consent));
        vm.serializeAddress(k, "tbillVault", address(d.tbill));
        vm.serializeAddress(k, "creditVault", address(d.credit));
        vm.serializeAddress(k, "gold", address(d.gold));
        string memory json = vm.serializeAddress(k, "factory", address(d.factory));
        string memory path = string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(json, path);
        console.log("Deployment written to", path);
    }
}
