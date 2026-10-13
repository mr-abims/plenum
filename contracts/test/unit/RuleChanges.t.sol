// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Fixture} from "../utils/Fixture.sol";
import {MandateConfig, Op, Reason, Unauthorized} from "../../src/interfaces/Types.sol";
import {IGovernance} from "../../src/interfaces/IGovernance.sol";
import {IMandate} from "../../src/interfaces/IMandate.sol";
import {Plenum} from "../../src/core/Plenum.sol";
import {Mandate} from "../../src/core/Mandate.sol";
import {Governance} from "../../src/core/Governance.sol";
import {ManagerGateway} from "../../src/core/ManagerGateway.sol";
import {MockTBillVault} from "../../src/adapters/MockTBillVault.sol";

/// @notice Members change the rules and replace the manager by supermajority (SPEC MD-3, MG-6, A26).
contract RuleChangesTest is Fixture {
    Governance gov;
    ManagerGateway gw;
    MockTBillVault extra;

    function setUp() public override {
        super.setUp();
        _seedBalanced(10_000 * USD);
        _join(jonas, 2);
        _join(wei_, 3);
        gov = Governance(governance);
        gw = ManagerGateway(gateway);
        extra = new MockTBillVault(usd);
    }

    /// @dev Balanced with a wider gold band and a fourth, empty asset.
    function _withExtra() internal view returns (MandateConfig memory c) {
        c = balanced();
        address[] memory a = new address[](4);
        uint16[] memory t = new uint16[](4);
        uint16[] memory b = new uint16[](4);
        for (uint256 i; i < 3; ++i) {
            a[i] = c.adapters[i];
            t[i] = c.targetBps[i];
            b[i] = c.bandBps[i];
        }
        a[3] = address(extra);
        t[1] = 1500; // credit 20% → 15%
        t[3] = 500;
        b[2] = 500;
        b[3] = 200;
        (c.adapters, c.targetBps, c.bandBps) = (a, t, b);
    }

    function _proposeChange(MandateConfig memory c) internal returns (uint256 id) {
        vm.prank(jonas);
        id = gov.proposeMandateChange(c, keccak256("why"));
    }

    function _approve(uint256 id, address who) internal {
        vm.prank(who);
        gov.approve(id);
    }

    /// @dev Propose → 2 of 3 approve → execute → wait out the timelock → apply.
    function _passAndApply(MandateConfig memory c) internal {
        uint256 id = _proposeChange(c);
        _approve(id, ana);
        _approve(id, jonas);
        gov.executeProposal(id);
        vm.warp(block.timestamp + 48 hours);
        mandate.applyChange();
    }

    // ------------------------------------------------------------- rule change

    function test_proposeMandateChange_membersOnly() public {
        MandateConfig memory c = _withExtra();
        address[3] memory outsiders = [stranger, manager, gateway];
        for (uint256 i; i < 3; ++i) {
            vm.prank(outsiders[i]);
            vm.expectRevert(abi.encodeWithSelector(Unauthorized.selector, outsiders[i]));
            gov.proposeMandateChange(c, bytes32(0));
        }
    }

    function test_proposeMandateChange_rejectsInvalidConfig() public {
        MandateConfig memory c = balanced();
        c.targetBps[0] = 9000; // targets + floor > 100%
        vm.prank(jonas);
        vm.expectRevert(Mandate.InvalidConfig.selector);
        gov.proposeMandateChange(c, bytes32(0));
    }

    function test_needsSupermajority_notEscalationQuorum() public {
        uint256 id = _proposeChange(_withExtra());
        _approve(id, ana);
        assertFalse(gov.quorumReached(id)); // 1 of 3
        vm.expectRevert(abi.encodeWithSelector(Governance.QuorumNotReached.selector, id));
        gov.executeProposal(id);
        _approve(id, jonas);
        assertTrue(gov.quorumReached(id)); // 2 of 3 = two-thirds
    }

    function test_changeWaitsForTimelock_thenApplies() public {
        MandateConfig memory c = _withExtra();
        uint256 id = _proposeChange(c);
        _approve(id, ana);
        _approve(id, jonas);

        vm.expectEmit(address(mandate));
        emit IMandate.MandateChangeScheduled(keccak256(abi.encode(c)), uint64(block.timestamp + 48 hours));
        gov.executeProposal(id);

        (MandateConfig memory pending, uint64 eta) = mandate.pendingChange();
        assertEq(pending.adapters.length, 4);
        assertEq(eta, block.timestamp + 48 hours);
        assertEq(mandate.config().adapters.length, 3); // not yet

        vm.expectRevert(abi.encodeWithSelector(Mandate.ChangeNotReady.selector, eta));
        mandate.applyChange();

        vm.warp(eta);
        vm.expectEmit(address(mandate));
        emit IMandate.MandateChangeApplied(keccak256(abi.encode(c)));
        mandate.applyChange(); // anyone may apply

        MandateConfig memory now_ = mandate.config();
        assertEq(now_.adapters.length, 4);
        assertEq(now_.targetBps[1], 1500);
        assertTrue(mandate.isAllowed(address(extra)));
        (, eta) = mandate.pendingChange();
        assertEq(eta, 0);
        vm.expectRevert(Mandate.NoPendingChange.selector);
        mandate.applyChange();
    }

    function test_scheduleChange_governanceOnly() public {
        MandateConfig memory c = _withExtra();
        vm.prank(jonas);
        vm.expectRevert(abi.encodeWithSelector(Unauthorized.selector, jonas));
        mandate.scheduleChange(c);
    }

    function test_removingAnEmptyAsset_works_nonEmpty_reverts() public {
        _passAndApply(_withExtra());
        _passAndApply(balanced()); // extra holds nothing: removed
        assertFalse(mandate.isAllowed(address(extra)));

        MandateConfig memory noGold = balanced();
        address[] memory a = new address[](2);
        uint16[] memory t = new uint16[](2);
        uint16[] memory b = new uint16[](2);
        (a[0], a[1]) = (address(tbill), address(credit));
        (t[0], t[1]) = (4500, 2000);
        (b[0], b[1]) = (500, 300);
        (noGold.adapters, noGold.targetBps, noGold.bandBps) = (a, t, b);
        uint256 id = _proposeChange(noGold);
        _approve(id, ana);
        _approve(id, jonas);
        gov.executeProposal(id);
        vm.warp(block.timestamp + 48 hours);
        vm.expectRevert(abi.encodeWithSelector(Mandate.AdapterNotEmpty.selector, address(gold)));
        mandate.applyChange(); // the group still holds gold: sell it first
    }

    function test_memberCapBelowMembers_cannotApply() public {
        MandateConfig memory c = balanced();
        c.maxMembers = 2;
        uint256 id = _proposeChange(c);
        _approve(id, ana);
        _approve(id, jonas);
        gov.executeProposal(id);
        vm.warp(block.timestamp + 48 hours);
        vm.expectRevert(Mandate.InvalidConfig.selector);
        mandate.applyChange();
    }

    function test_periodClockResetsWhenLengthChanges() public {
        MandateConfig memory c = balanced();
        c.periodLength = 90 days;
        c.exitWindow = 7 days;
        c.earlyExitFeeBps = 200;
        _passAndApply(c);
        assertEq(mandate.periodStart(), block.timestamp);
        assertEq(mandate.nextPeriodEnd(), block.timestamp + 90 days);
    }

    function test_leaversDropOutOfTheDenominator() public {
        uint256 id = _proposeChange(_withExtra());
        _approve(id, ana);
        assertFalse(gov.quorumReached(id));
        vm.prank(jonas);
        plenum.leave(jonas);
        vm.prank(wei_);
        plenum.leave(wei_);
        assertTrue(gov.quorumReached(id)); // 1 of 1
    }

    // ------------------------------------------------------ manager replacement

    function test_replaceManager_bySupermajority() public {
        address next = makeAddr("nextManager");
        vm.prank(jonas);
        uint256 id = gov.proposeManagerReplacement(next, keccak256("why"));
        assertEq(uint8(gov.kindOf(id)), uint8(Governance.Kind.ReplaceManager));
        _approve(id, ana);
        assertFalse(gov.quorumReached(id));
        _approve(id, wei_);

        vm.expectEmit(address(gov));
        emit IGovernance.ManagerReplaced(manager, next);
        gov.executeProposal(id);
        assertEq(gw.manager(), next);

        vm.prank(manager);
        vm.expectRevert(abi.encodeWithSelector(Unauthorized.selector, manager));
        gw.executeInBand(_one(address(tbill), Op.Withdraw, 100 * USD), bytes32(0), bytes32(0));
        vm.prank(next);
        assertEq(
            uint8(gw.executeInBand(_one(address(tbill), Op.Withdraw, 100 * USD), bytes32(0), bytes32(0))),
            uint8(Reason.OK)
        );
    }

    function test_replaceManager_rules() public {
        vm.prank(manager);
        vm.expectRevert(abi.encodeWithSelector(Unauthorized.selector, manager));
        gov.proposeManagerReplacement(manager, bytes32(0)); // the manager can't pick its successor

        vm.prank(jonas);
        vm.expectRevert(Governance.ZeroManager.selector);
        gov.proposeManagerReplacement(address(0), bytes32(0));
    }

    function test_personalPortfolio_ownerAloneChangesRules() public {
        MandateConfig memory c = balanced();
        c.maxMembers = 1;
        c.pauseQuorum = 1;
        c.escalateQuorumBps = 10_000;
        vm.prank(ana);
        plenum = Plenum(factory.createPlenum("Mine", 1, c, manager));
        mandate = Mandate(plenum.mandate());
        gov = Governance(plenum.governance());
        _join(ana, 1);

        MandateConfig memory next = c;
        next.maxTradeBps = 500;
        vm.prank(ana);
        uint256 id = gov.proposeMandateChange(next, bytes32(0));
        _approve(id, ana);
        gov.executeProposal(id);
        vm.warp(block.timestamp + 48 hours);
        mandate.applyChange();
        assertEq(mandate.config().maxTradeBps, 500);
    }
}
