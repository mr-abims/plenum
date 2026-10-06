// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import {MandateConfig, Reason, NotImplemented} from "../../src/interfaces/Types.sol";
import {Plenum} from "../../src/core/Plenum.sol";
import {Mandate} from "../../src/core/Mandate.sol";
import {Governance} from "../../src/core/Governance.sol";
import {ManagerGateway} from "../../src/core/ManagerGateway.sol";
import {NavOracle} from "../../src/core/NavOracle.sol";
import {ConsentRegistry} from "../../src/core/ConsentRegistry.sol";
import {PlenumFactory} from "../../src/core/PlenumFactory.sol";
import {ComplianceGate} from "../../src/compliance/ComplianceGate.sol";
import {MockIdentityProvider} from "../../src/compliance/MockIdentityProvider.sol";
import {MockAToken} from "../../src/mocks/MockAToken.sol";
import {MockTBillVault} from "../../src/adapters/MockTBillVault.sol";
import {MockCreditVault} from "../../src/adapters/MockCreditVault.sol";
import {MockGold} from "../../src/adapters/MockGold.sol";

/// @notice Session 0 smoke test: everything deploys, wires up and clones; ABI-relevant enum order is pinned.
contract ScaffoldTest is Test {
    address constant MOCK_FORWARDER = 0xB9F79d863261869B234c481D1f9A7af84AeAd192;
    address fallbackWriter = makeAddr("fallbackWriter");

    MockIdentityProvider identity;
    MockAToken aToken;
    NavOracle oracle;
    ComplianceGate gate;
    ConsentRegistry consent;
    PlenumFactory factory;
    MockTBillVault tbill;
    MockCreditVault credit;
    MockGold gold;

    function setUp() public {
        identity = new MockIdentityProvider();
        aToken = new MockAToken(identity);
        oracle = new NavOracle(MOCK_FORWARDER, fallbackWriter);
        gate = new ComplianceGate(identity);
        consent = new ConsentRegistry();
        tbill = new MockTBillVault(aToken);
        credit = new MockCreditVault(address(aToken), 1 hours);
        gold = new MockGold(address(aToken), 2_400e6);
        factory = new PlenumFactory(
            PlenumFactory.Deps({
                plenumImpl: address(new Plenum()),
                mandateImpl: address(new Mandate()),
                governanceImpl: address(new Governance()),
                gatewayImpl: address(new ManagerGateway()),
                aToken: address(aToken),
                navOracle: address(oracle),
                complianceGate: address(gate),
                consentRegistry: address(consent)
            })
        );
    }

    function test_wiring() public view {
        assertEq(aToken.decimals(), 6);
        assertEq(oracle.getForwarderAddress(), MOCK_FORWARDER);
        assertEq(oracle.fallbackWriter(), fallbackWriter);
        assertEq(address(gate.identity()), address(identity));
        assertEq(factory.aToken(), address(aToken));
        assertEq(tbill.asset(), address(aToken));
        assertTrue(credit.isAsync());
        assertFalse(gold.isAsync());
    }

    function test_implementationsCannotBeInitialized() public {
        Mandate impl = Mandate(factory.mandateImpl());
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        impl.initialize(address(1), address(oracle), address(2), _balanced());
    }

    function test_mandateCloneStoresConfig() public {
        Mandate m = Mandate(Clones.clone(factory.mandateImpl()));
        m.initialize(address(1), address(oracle), address(2), _balanced());
        MandateConfig memory c = m.config();
        assertEq(c.adapters.length, 3);
        assertEq(c.targetBps[0], 4500);
        assertEq(c.minLiquidityBps, 2000);
        assertEq(c.pauseQuorum, 2);
        assertTrue(m.isAllowed(address(tbill)));
        assertFalse(m.isAllowed(address(0xABC)));
    }

    function test_onReportRejectsNonForwarder() public {
        vm.expectRevert();
        oracle.onReport("", "");
    }

    function test_stubsRevertNotImplemented() public {
        vm.expectRevert(NotImplemented.selector);
        factory.createPlenum("Club", 1, _balanced(), address(this));
    }

    /// @dev Envio, the agent and the UI decode Reason by ordinal; this pins the order from SPEC §7.
    function test_reasonOrdinalsMatchSpec() public pure {
        assertEq(uint8(Reason.OK), 0);
        assertEq(uint8(Reason.ADAPTER_NOT_ALLOWED), 1);
        assertEq(uint8(Reason.NAV_STALE), 6);
        assertEq(uint8(Reason.PAUSED), 8);
        assertEq(uint8(Reason.MEMBER_CAP), 12);
    }

    /// @dev Balanced template (SPEC §12): T-bill 45±5, credit 20±3, gold 15±3, cash floor 20, max trade 10.
    function _balanced() internal view returns (MandateConfig memory c) {
        c.adapters = new address[](3);
        c.adapters[0] = address(tbill);
        c.adapters[1] = address(credit);
        c.adapters[2] = address(gold);
        c.targetBps = new uint16[](3);
        c.targetBps[0] = 4500;
        c.targetBps[1] = 2000;
        c.targetBps[2] = 1500;
        c.bandBps = new uint16[](3);
        c.bandBps[0] = 500;
        c.bandBps[1] = 300;
        c.bandBps[2] = 300;
        c.minLiquidityBps = 2000;
        c.maxTradeBps = 1000;
        c.maxDailyTurnoverBps = 2500;
        c.navMaxAge = 15 minutes;
        c.cooldown = 1 minutes;
        c.maxMembers = 99;
        c.escalateQuorumBps = 5000;
        c.mandateChangeBps = 6667;
        c.timelock = 48 hours;
        c.pauseQuorum = 2;
    }
}
