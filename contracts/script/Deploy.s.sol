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
import {MockUSD} from "../src/mocks/MockUSD.sol";
import {MockTBillVault} from "../src/adapters/MockTBillVault.sol";
import {MockCreditVault} from "../src/adapters/MockCreditVault.sol";
import {MockGold} from "../src/adapters/MockGold.sol";

/// @notice Deploys the shared singletons, the MOCK test dollar and MOCK adapters, bundle implementations and the
///         factory, then writes addresses to deployments/<chainId>.json. Monad testnet (10143) or a local chain only.
/// @dev Env: DEPLOYER_PRIVATE_KEY, FALLBACK_NAV_WRITER_KEY, CRE_FORWARDER (defaults to the CRE mock forwarder
///      for `cre workflow simulate --broadcast`), CREDIT_REDEEM_DELAY (seconds, default 300),
///      GOLD_PRICE_USD (initial MOCK gold price per ounce, default 4200; CRE then reports the real spot price),
///      TREASURY (receives the protocol's cut of breaking fees, default the deployer),
///      FAUCET_PRIVATE_KEY (optional: testnet onboarding faucet, granted MINTER_ROLE on the test dollar).
contract Deploy is Script {
    address constant CRE_MOCK_FORWARDER_MONAD_TESTNET = 0xB9F79d863261869B234c481D1f9A7af84AeAd192;
    uint256 constant ANVIL_KEY_0 = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    /// @dev Protocol's share of every breaking fee (SPEC A26); the rest stays with the group.
    uint16 constant PROTOCOL_FEE_CUT_BPS = 2500;
    uint256 constant ANVIL_KEY_1 = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;

    struct Deployed {
        address deployer;
        address fallbackWriter;
        address forwarder;
        uint256 startBlock;
        MockUSD usd;
        NavOracle oracle;
        ConsentRegistry consent;
        MockTBillVault tbill;
        MockCreditVault credit;
        MockGold gold;
        PlenumFactory factory;
        address faucet;
    }

    function run() external {
        require(block.chainid == 10143 || block.chainid == 31337, "Monad testnet or local only");
        uint256 pk = vm.envOr("DEPLOYER_PRIVATE_KEY", ANVIL_KEY_0);
        Deployed memory d;
        d.deployer = vm.addr(pk);
        d.fallbackWriter = vm.addr(vm.envOr("FALLBACK_NAV_WRITER_KEY", ANVIL_KEY_1));
        d.forwarder = vm.envOr("CRE_FORWARDER", CRE_MOCK_FORWARDER_MONAD_TESTNET);
        uint256 faucetPk = vm.envOr("FAUCET_PRIVATE_KEY", uint256(0));
        d.faucet = faucetPk == 0 ? address(0) : vm.addr(faucetPk);
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
        d.usd = new MockUSD();
        d.oracle = new NavOracle(d.forwarder, d.fallbackWriter);
        d.consent = new ConsentRegistry();
        d.tbill = new MockTBillVault(d.usd);
        d.credit = new MockCreditVault(address(d.usd), redeemDelay);
        // Start near the real spot price so the first CRE price report passes the 20% circuit breaker.
        d.gold = new MockGold(address(d.usd), vm.envOr("GOLD_PRICE_USD", uint256(4_200)) * 1e6, d.forwarder);
    }

    function _deployFactory(Deployed memory d) internal returns (PlenumFactory) {
        return new PlenumFactory(
            PlenumFactory.Deps({
                plenumImpl: address(new Plenum()),
                mandateImpl: address(new Mandate()),
                governanceImpl: address(new Governance()),
                gatewayImpl: address(new ManagerGateway()),
                asset: address(d.usd),
                navOracle: address(d.oracle),
                consentRegistry: address(d.consent),
                treasury: vm.envOr("TREASURY", d.deployer),
                protocolFeeCutBps: PROTOCOL_FEE_CUT_BPS
            })
        );
    }

    function _wire(Deployed memory d) internal {
        MockUSD t = d.usd;
        t.grantRole(t.MINTER_ROLE(), d.deployer);
        if (d.faucet != address(0)) t.grantRole(t.MINTER_ROLE(), d.faucet);
        t.mint(address(d.gold), 20_000e6); // MOCK reserve that pays gold sales when the real price moves
    }

    function _write(Deployed memory d) internal {
        string memory k = "deployment";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeUint(k, "startBlock", d.startBlock);
        vm.serializeAddress(k, "deployer", d.deployer);
        vm.serializeAddress(k, "fallbackNavWriter", d.fallbackWriter);
        vm.serializeAddress(k, "creForwarder", d.forwarder);
        vm.serializeAddress(k, "faucet", d.faucet);
        vm.serializeAddress(k, "asset", address(d.usd));
        vm.serializeAddress(k, "navOracle", address(d.oracle));
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
