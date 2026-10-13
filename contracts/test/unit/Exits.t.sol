// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Fixture} from "../utils/Fixture.sol";
import {MandateConfig, PolicyViolation, Reason} from "../../src/interfaces/Types.sol";
import {IPlenum} from "../../src/interfaces/IPlenum.sol";
import {Plenum} from "../../src/core/Plenum.sol";
import {Mandate} from "../../src/core/Mandate.sol";

/// @notice Investment periods, the breaking fee and leaving (SPEC A26).
contract ExitsTest is Fixture {
    uint16 constant FEE_BPS = 200; // 2%

    function _periodic() internal view returns (MandateConfig memory c) {
        c = balanced();
        c.periodLength = 30 days;
        c.exitWindow = 3 days;
        c.earlyExitFeeBps = FEE_BPS;
    }

    function _use(Plenum p) internal {
        plenum = p;
        mandate = Mandate(p.mandate());
        governance = p.governance();
        gateway = p.gateway();
    }

    function _create(MandateConfig memory c) internal {
        vm.prank(ana);
        _use(Plenum(factory.createPlenum("Term club", 1, c, manager)));
    }

    /// @dev Ana seeds 10,000 allocated at Balanced targets (cash 2,000); Jonas adds 2,000 cash.
    function setUp() public override {
        super.setUp();
        _create(_periodic());
        _seedBalanced(10_000 * USD);
        _join(jonas, 2);
        _fund(jonas, 2_000 * USD);
        vm.prank(jonas);
        plenum.contribute(2_000 * USD);
    }

    function _reprice() internal {
        _postNav(mandate.holdingsTotal());
    }

    function _value(address who) internal view returns (uint256) {
        (uint256 v,) = plenum.currentNav();
        return plenum.unitsOf(who) * (v + 1) / (plenum.totalUnits() + 1e6);
    }

    function _redeemAll(address who) internal returns (uint256) {
        uint256 units = plenum.unitsOf(who);
        vm.prank(who);
        return plenum.redeem(units, who);
    }

    // ------------------------------------------------------------- breaking fee

    function test_earlyExit_feeSplitBetweenTreasuryAndGroup() public {
        vm.warp(block.timestamp + 10 days);
        _reprice();
        assertEq(mandate.exitFeeBps(), FEE_BPS);

        uint256 anaBefore = _value(ana);
        uint256 gross = _value(jonas);
        uint256 fee = gross * FEE_BPS / 10_000;
        uint256 toTreasury = fee * 2500 / 10_000;

        vm.expectEmit(address(plenum));
        emit IPlenum.ExitFeeCharged(jonas, fee, toTreasury);
        uint256 out = _redeemAll(jonas);

        assertEq(out, gross - fee);
        assertEq(usd.balanceOf(jonas), gross - fee);
        assertEq(usd.balanceOf(treasury), toTreasury);
        // The rest of the fee stayed in the pool: Ana's share grew by it.
        assertApproxEqAbs(_value(ana), anaBefore + fee - toTreasury, 2);
    }

    function test_exitInWindow_isFree() public {
        vm.warp(mandate.periodStart() + 30 days + 1 days);
        _reprice();
        assertEq(mandate.exitFeeBps(), 0);
        uint256 gross = _value(jonas);
        uint256 out = _redeemAll(jonas);
        assertEq(out, gross);
        assertEq(usd.balanceOf(treasury), 0);
    }

    function test_feeReturnsAfterWindow_andWindowRepeats() public {
        uint256 start = mandate.periodStart();
        assertEq(mandate.nextPeriodEnd(), start + 30 days);
        vm.warp(start + 30 days + 3 days); // window closed
        assertEq(mandate.exitFeeBps(), FEE_BPS);
        assertEq(mandate.nextPeriodEnd(), start + 60 days);
        vm.warp(start + 60 days); // second period end: window open again
        assertEq(mandate.exitFeeBps(), 0);
    }

    function test_noPeriod_exitsAlwaysFree() public {
        _create(balanced());
        assertEq(mandate.exitFeeBps(), 0);
        assertEq(mandate.nextPeriodEnd(), 0);
    }

    function test_pendingRuleChange_waivesFee() public {
        vm.warp(block.timestamp + 10 days);
        _reprice();
        vm.prank(governance);
        mandate.scheduleChange(_periodic());
        assertEq(mandate.exitFeeBps(), 0);
        uint256 gross = _value(jonas);
        assertEq(_redeemAll(jonas), gross);
        assertEq(usd.balanceOf(treasury), 0);

        vm.warp(block.timestamp + 48 hours);
        mandate.applyChange();
        assertEq(mandate.exitFeeBps(), FEE_BPS); // same period length: clock not reset, still mid-period
    }

    function test_lastHolder_payWholeFeeToTreasury() public {
        _create(_periodic());
        _join(ana, 1);
        _join(jonas, 2); // member without units
        _fund(ana, 1_000 * USD);
        vm.prank(ana);
        plenum.contribute(1_000 * USD);
        vm.warp(block.timestamp + 1 days);
        _postNav(1_000 * USD);

        uint256 out = _redeemAll(ana);
        assertEq(out, 980 * USD);
        assertEq(usd.balanceOf(treasury), 20 * USD); // nobody left to share it with
    }

    function test_personalPortfolio_feeGoesToTreasury() public {
        MandateConfig memory c = _periodic();
        c.maxMembers = 1;
        c.pauseQuorum = 1;
        c.escalateQuorumBps = 10_000;
        _create(c);
        _join(ana, 1);
        _fund(ana, 1_000 * USD);
        vm.prank(ana);
        plenum.contribute(1_000 * USD);
        vm.warp(block.timestamp + 1 days);
        _postNav(1_000 * USD);

        uint256 half = plenum.unitsOf(ana) / 2;
        vm.prank(ana);
        uint256 out = plenum.redeem(half, ana);
        assertApproxEqAbs(out, 490 * USD, 1);
        assertApproxEqAbs(usd.balanceOf(treasury), 10 * USD, 1);
    }

    function test_cashShortfall_revertsWithNoStateChange() public {
        vm.warp(block.timestamp + 10 days);
        _reprice();
        uint256 units = plenum.unitsOf(ana);
        uint256 total = plenum.totalUnits();
        vm.prank(ana);
        vm.expectRevert(abi.encodeWithSelector(PolicyViolation.selector, Reason.LIQUIDITY_FLOOR));
        plenum.redeem(units, ana);
        assertEq(plenum.unitsOf(ana), units);
        assertEq(plenum.totalUnits(), total);
        assertEq(usd.balanceOf(treasury), 0);
    }

    // -------------------------------------------------------------------- leave

    function test_leave_paysOutAndRemovesMember() public {
        vm.warp(block.timestamp + 10 days);
        _reprice();
        uint256 gross = _value(jonas);

        vm.expectEmit(address(plenum));
        emit IPlenum.MemberLeft(jonas);
        vm.prank(jonas);
        uint256 out = plenum.leave(jonas);

        assertEq(out, gross - gross * FEE_BPS / 10_000);
        assertFalse(plenum.isMember(jonas));
        assertEq(plenum.memberCount(), 1);
        assertEq(plenum.unitsOf(jonas), 0);
        address[] memory m = plenum.members();
        assertEq(m.length, 1);
        assertEq(m[0], ana);
    }

    function test_leave_swapAndPop_keepsOthers() public {
        _create(_periodic());
        _join(ana, 1);
        _join(jonas, 2);
        _join(wei_, 3);
        vm.prank(ana);
        plenum.leave(ana);
        address[] memory m = plenum.members();
        assertEq(m.length, 2);
        assertEq(m[0], wei_);
        assertEq(m[1], jonas);
        vm.prank(wei_);
        plenum.leave(wei_);
        m = plenum.members();
        assertEq(m.length, 1);
        assertEq(m[0], jonas);
    }

    function test_exOrganizer_cannotInvite_memberCan() public {
        _create(_periodic());
        _join(ana, 1);
        _join(jonas, 2);
        vm.prank(ana);
        plenum.leave(ana);
        assertTrue(plenum.organizerLeft());

        bytes memory fromAna = _invite(anaPk, wei_, 3, uint64(block.timestamp + 1 days));
        vm.prank(wei_);
        vm.expectRevert(abi.encodeWithSelector(Plenum.InvalidInviteSigner.selector, ana));
        plenum.join(fromAna, bytes32(0));

        bytes memory fromJonas = _invite(jonasPk, wei_, 4, uint64(block.timestamp + 1 days));
        vm.prank(wei_);
        plenum.join(fromJonas, bytes32(0));
        assertTrue(plenum.isMember(wei_));
    }

    function test_leave_thenRejoin() public {
        vm.prank(jonas);
        plenum.leave(jonas);
        _join(jonas, 7);
        assertTrue(plenum.isMember(jonas));
        assertEq(plenum.memberCount(), 2);
        assertEq(plenum.members().length, 2);
    }

    function test_leave_nonMemberReverts() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Plenum.NotMember.selector, stranger));
        plenum.leave(stranger);
    }

    // --------------------------------------------------------------- validation

    function test_invalidPeriodSettingsRejected() public {
        MandateConfig memory c = _periodic();
        c.earlyExitFeeBps = 1001;
        _expectInvalid(c);
        c = _periodic();
        c.exitWindow = 30 days;
        _expectInvalid(c);
        c = _periodic();
        c.exitWindow = 0;
        _expectInvalid(c);
        c = _periodic();
        c.mandateChangeBps = 5000;
        _expectInvalid(c);
    }

    function _expectInvalid(MandateConfig memory c) internal {
        vm.prank(ana);
        vm.expectRevert(Mandate.InvalidConfig.selector);
        factory.createPlenum("Bad", 1, c, manager);
    }
}
