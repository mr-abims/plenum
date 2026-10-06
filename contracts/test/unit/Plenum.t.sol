// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Fixture} from "../utils/Fixture.sol";
import {IPlenum} from "../../src/interfaces/IPlenum.sol";
import {MandateConfig, Op, PolicyViolation, Reason, Unauthorized} from "../../src/interfaces/Types.sol";
import {Plenum} from "../../src/core/Plenum.sol";

contract PlenumTest is Fixture {
    // ------------------------------------------------------------------ join

    function test_join_boundInvite() public {
        vm.expectEmit(address(plenum));
        emit IPlenum.MemberJoined(jonas, keccak256(abi.encode("x25519", jonas)));
        _join(jonas, 7);
        assertTrue(plenum.isMember(jonas));
        assertEq(plenum.memberCount(), 1);
        assertTrue(plenum.inviteUsed(7));
    }

    function test_join_openInviteIsSingleUse() public {
        bytes memory inv = _invite(anaPk, address(0), 9, uint64(block.timestamp + 1 days));
        vm.prank(jonas);
        plenum.join(inv, bytes32(0));
        vm.prank(wei_);
        vm.expectRevert(abi.encodeWithSelector(Plenum.InviteAlreadyUsed.selector, 9));
        plenum.join(inv, bytes32(0));
    }

    function test_join_boundInviteRejectsOtherCaller() public {
        bytes memory inv = _invite(anaPk, jonas, 1, uint64(block.timestamp + 1 days));
        vm.prank(wei_);
        vm.expectRevert(abi.encodeWithSelector(Plenum.InviteNotForCaller.selector, jonas));
        plenum.join(inv, bytes32(0));
    }

    function test_join_expired() public {
        uint64 expiry = uint64(block.timestamp + 1 hours);
        bytes memory inv = _invite(anaPk, jonas, 1, expiry);
        vm.warp(expiry + 1);
        vm.prank(jonas);
        vm.expectRevert(abi.encodeWithSelector(Plenum.InviteExpired.selector, expiry));
        plenum.join(inv, bytes32(0));
    }

    function test_join_rejectsNonMemberSigner() public {
        bytes memory inv = _invite(weiPk, jonas, 1, uint64(block.timestamp + 1 days));
        vm.prank(jonas);
        vm.expectRevert(abi.encodeWithSelector(Plenum.InvalidInviteSigner.selector, wei_));
        plenum.join(inv, bytes32(0));
    }

    function test_join_memberCanInvite() public {
        _join(jonas, 1);
        bytes memory inv = _invite(jonasPk, wei_, 2, uint64(block.timestamp + 1 days));
        vm.prank(wei_);
        plenum.join(inv, bytes32(0));
        assertTrue(plenum.isMember(wei_));
    }

    function test_join_unverifiedIsRefusedAndInviteStaysUnused() public {
        bytes memory inv = _invite(anaPk, stranger, 3, uint64(block.timestamp + 1 days));
        vm.expectEmit(address(plenum));
        emit IPlenum.ComplianceRefused(stranger, Reason.MEMBER_NOT_VERIFIED);
        vm.prank(stranger);
        plenum.join(inv, bytes32(0));
        assertFalse(plenum.isMember(stranger));
        assertFalse(plenum.inviteUsed(3));
    }

    function test_join_alreadyMember() public {
        _join(jonas, 1);
        bytes memory inv = _invite(anaPk, jonas, 2, uint64(block.timestamp + 1 days));
        vm.prank(jonas);
        vm.expectRevert(abi.encodeWithSelector(Plenum.AlreadyMember.selector, jonas));
        plenum.join(inv, bytes32(0));
    }

    function test_join_memberCap() public {
        MandateConfig memory c = balanced();
        c.maxMembers = 1;
        vm.prank(ana);
        plenum = Plenum(factory.createPlenum("Tiny", 1, c, manager));
        _join(ana, 1);
        bytes memory inv = _invite(anaPk, jonas, 2, uint64(block.timestamp + 1 days));
        vm.prank(jonas);
        vm.expectRevert(abi.encodeWithSelector(PolicyViolation.selector, Reason.MEMBER_CAP));
        plenum.join(inv, bytes32(0));
    }

    // ------------------------------------------------------------ contribute

    function test_contribute_bootstrapPricesOneToOne() public {
        _join(ana, 1);
        _fund(ana, 100 * USD);
        vm.expectEmit(address(plenum));
        emit IPlenum.Contributed(ana, 100 * USD, 100 * USD * 1e6, 1e6); // navPerUnit 1.000000
        vm.prank(ana);
        uint256 units = plenum.contribute(100 * USD);
        assertEq(units, 100e12); // 100 whole units, 12 decimals
        assertEq(plenum.totalUnits(), units);
        assertEq(plenum.cash(), 100 * USD);
    }

    function test_contribute_unverifiedIsRefusedOnchain() public {
        aToken.mint(ana, 10 * USD); // stranger can't even hold mvUSD; refusal happens before any transfer
        vm.expectEmit(address(plenum));
        emit IPlenum.ComplianceRefused(stranger, Reason.MEMBER_NOT_VERIFIED);
        vm.prank(stranger);
        assertEq(plenum.contribute(10 * USD), 0);
        assertEq(plenum.totalUnits(), 0);
    }

    function test_contribute_verifiedNonMemberReverts() public {
        _fund(jonas, 10 * USD);
        vm.prank(jonas);
        vm.expectRevert(abi.encodeWithSelector(Plenum.NotMember.selector, jonas));
        plenum.contribute(10 * USD);
    }

    function test_contribute_afterBootstrapNeedsFreshNav() public {
        _join(ana, 1);
        _fund(ana, 200 * USD);
        vm.startPrank(ana);
        plenum.contribute(100 * USD);
        vm.expectRevert(abi.encodeWithSelector(PolicyViolation.selector, Reason.NAV_STALE));
        plenum.contribute(100 * USD);
        vm.stopPrank();
    }

    function test_contribute_pricesAtNavPlusFlows() public {
        _join(ana, 1);
        _join(jonas, 2);
        _fund(ana, 100 * USD);
        _fund(jonas, 100 * USD);
        vm.prank(ana);
        plenum.contribute(100 * USD);
        _postNav(110 * USD); // fund grew 10%

        vm.prank(jonas);
        uint256 units = plenum.contribute(55 * USD);
        // 55 × (100e12 + 1e6) / (110e6 + 1) ≈ 50 whole units
        assertApproxEqRel(units, 50e12, 1e12);

        // A second contribution before the next report includes Jonas's flow in V.
        vm.prank(jonas);
        uint256 units2 = plenum.contribute(45 * USD);
        assertApproxEqRel(units2, 40_909_090_909_090, 1e12); // 45 × 150 / 165
        assertEq(plenum.netFlowSince(), int256(100 * USD));
    }

    function test_contribute_newReportResetsNetFlows() public {
        _join(ana, 1);
        _fund(ana, 300 * USD);
        vm.startPrank(ana);
        plenum.contribute(100 * USD);
        vm.stopPrank();
        _postNav(100 * USD);
        vm.prank(ana);
        plenum.contribute(100 * USD);
        assertEq(plenum.netFlowSince(), int256(100 * USD));
        _postNav(200 * USD);
        vm.prank(ana);
        plenum.contribute(100 * USD);
        assertEq(plenum.netFlowSince(), int256(100 * USD)); // reset to 0, then +100
    }

    // ---------------------------------------------------------------- redeem

    function test_redeem_toVerifiedPayee() public {
        _join(ana, 1);
        _fund(ana, 100 * USD);
        vm.prank(ana);
        uint256 units = plenum.contribute(100 * USD);
        _postNav(100 * USD);
        vm.prank(ana);
        uint256 assets = plenum.redeem(units / 2, jonas);
        assertApproxEqAbs(assets, 50 * USD, 1);
        assertEq(aToken.balanceOf(jonas), assets);
        assertEq(plenum.unitsOf(ana), units - units / 2);
    }

    function test_redeem_unverifiedPayeeIsRefused() public {
        _join(ana, 1);
        _fund(ana, 100 * USD);
        vm.prank(ana);
        uint256 units = plenum.contribute(100 * USD);
        _postNav(100 * USD);
        vm.expectEmit(address(plenum));
        emit IPlenum.ComplianceRefused(stranger, Reason.PAYEE_NOT_VERIFIED);
        vm.prank(ana);
        assertEq(plenum.redeem(units, stranger), 0);
        assertEq(plenum.unitsOf(ana), units);
        assertEq(plenum.cash(), 100 * USD);
    }

    function test_redeem_revokedMemberCanExitToVerifiedAddress() public {
        _join(ana, 1);
        _fund(ana, 100 * USD);
        vm.prank(ana);
        uint256 units = plenum.contribute(100 * USD);
        _postNav(100 * USD);
        identity.setIdentity(ana, false, 0, bytes2(0));
        vm.prank(ana);
        plenum.redeem(units, jonas);
        assertEq(plenum.unitsOf(ana), 0);
    }

    function test_redeem_beyondCashReverts() public {
        _seedBalanced(10_000 * USD); // 20% cash
        uint256 units = plenum.unitsOf(ana);
        vm.prank(ana);
        vm.expectRevert(abi.encodeWithSelector(PolicyViolation.selector, Reason.LIQUIDITY_FLOOR));
        plenum.redeem(units / 2, ana);
    }

    function test_redeem_insufficientUnits() public {
        _join(ana, 1);
        vm.prank(ana);
        vm.expectRevert(abi.encodeWithSelector(Plenum.InsufficientUnits.selector, 1, 0));
        plenum.redeem(1, ana);
    }

    // --------------------------------------------------------------- execute

    function test_execute_onlyGatewayOrGovernance() public {
        vm.prank(manager); // even the manager key cannot call Plenum directly
        vm.expectRevert(abi.encodeWithSelector(Unauthorized.selector, manager));
        plenum.execute(_one(address(tbill), Op.Deposit, 1));
    }

    function test_execute_rejectsNonAllowlistedAdapter() public {
        address evil = makeAddr("evil");
        vm.prank(gateway);
        vm.expectRevert(abi.encodeWithSelector(PolicyViolation.selector, Reason.ADAPTER_NOT_ALLOWED));
        plenum.execute(_one(evil, Op.Deposit, 1));
    }

    function test_execute_movesMoneyOnlyIntoAdapters() public {
        _seedBalanced(10_000 * USD);
        assertEq(plenum.cash(), 2_000 * USD);
        assertEq(tbill.valueOf(address(plenum)), 4_500 * USD);
        assertEq(credit.valueOf(address(plenum)), 2_000 * USD);
        assertApproxEqAbs(gold.valueOf(address(plenum)), 1_500 * USD, 1);
        assertEq(aToken.allowance(address(plenum), address(tbill)), 0); // approvals reset
    }

    function test_execute_governanceMayCall() public {
        _seedBalanced(10_000 * USD);
        vm.prank(governance);
        plenum.execute(_one(address(tbill), Op.Withdraw, 100 * USD));
        assertEq(plenum.cash(), 2_100 * USD);
    }
}
