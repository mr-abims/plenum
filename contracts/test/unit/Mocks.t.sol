// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Fixture} from "../utils/Fixture.sol";
import {Reason} from "../../src/interfaces/Types.sol";
import {MockAToken} from "../../src/mocks/MockAToken.sol";
import {MockCreditVault} from "../../src/adapters/MockCreditVault.sol";
import {MockGold} from "../../src/adapters/MockGold.sol";

/// @notice MOCK A-Token gating, compliance gate and MOCK adapters.
contract MocksTest is Fixture {
    function test_aToken_movesOnlyBetweenEligibleParties() public {
        aToken.mint(ana, 10 * USD);
        vm.prank(ana);
        vm.expectRevert(abi.encodeWithSelector(MockAToken.NotEligible.selector, stranger));
        aToken.transfer(stranger, 1);

        vm.expectRevert(abi.encodeWithSelector(MockAToken.NotEligible.selector, stranger));
        aToken.mint(stranger, 1);

        vm.prank(ana);
        aToken.transfer(jonas, 1);
        assertEq(aToken.balanceOf(jonas), 1);
    }

    function test_aToken_revokedHolderIsFrozen() public {
        aToken.mint(ana, 10 * USD);
        identity.setIdentity(ana, false, 0, bytes2(0));
        vm.prank(ana);
        vm.expectRevert(abi.encodeWithSelector(MockAToken.NotEligible.selector, ana));
        aToken.transfer(jonas, 1);
    }

    function test_aToken_registerRequiresRole() public {
        vm.prank(stranger);
        vm.expectRevert();
        aToken.registerApass(stranger);
    }

    function test_complianceGate() public view {
        assertEq(uint8(gate.checkMember(ana)), uint8(Reason.OK));
        assertEq(uint8(gate.checkMember(stranger)), uint8(Reason.MEMBER_NOT_VERIFIED));
        assertEq(uint8(gate.checkPayee(stranger)), uint8(Reason.PAYEE_NOT_VERIFIED));
    }

    function test_tbill_depositAccrueWithdraw() public {
        aToken.mint(ana, 1_000 * USD);
        vm.startPrank(ana);
        aToken.approve(address(tbill), type(uint256).max);
        tbill.deposit(1_000 * USD);
        vm.stopPrank();
        aToken.mint(address(this), 50 * USD);
        aToken.approve(address(tbill), 50 * USD);
        tbill.accrue(50 * USD);
        assertApproxEqAbs(tbill.valueOf(ana), 1_050 * USD, 1);
        vm.prank(ana);
        tbill.withdraw(1_000 * USD);
        assertEq(aToken.balanceOf(ana), 1_000 * USD);
    }

    function test_credit_asyncExit() public {
        aToken.mint(ana, 100 * USD);
        vm.startPrank(ana);
        aToken.approve(address(credit), type(uint256).max);
        credit.deposit(100 * USD);
        uint256 id = credit.requestRedeem(40 * USD);
        assertEq(credit.valueOf(ana), 60 * USD);
        assertEq(credit.pendingOf(ana), 40 * USD);
        assertEq(credit.claimable(id), 0);
        vm.expectRevert();
        credit.claim(id);
        vm.warp(block.timestamp + 1 hours);
        assertEq(credit.claimable(id), 40 * USD);
        assertEq(credit.claim(id), 40 * USD);
        vm.stopPrank();
        assertEq(credit.pendingOf(ana), 0);
        vm.prank(jonas);
        vm.expectRevert(abi.encodeWithSelector(MockCreditVault.NotRequestOwner.selector, id));
        credit.claim(id);
    }

    function test_gold_priceMovesValue() public {
        aToken.mint(ana, 2_400 * USD);
        vm.startPrank(ana);
        aToken.approve(address(gold), type(uint256).max);
        gold.deposit(2_400 * USD); // 1 oz
        vm.stopPrank();
        assertEq(gold.ounces(ana), 1e18);
        gold.setPrice(2_640 * USD);
        assertEq(gold.valueOf(ana), 2_640 * USD);
        vm.prank(ana);
        vm.expectRevert(); // reserve only holds 2,400
        gold.withdraw(2_640 * USD);
        aToken.mint(address(this), 240 * USD);
        aToken.approve(address(gold), 240 * USD);
        gold.fund(240 * USD);
        vm.prank(ana);
        gold.withdraw(2_640 * USD);
        assertEq(gold.ounces(ana), 0);
    }

    function test_gold_onlyOwnerSetsPrice() public {
        vm.prank(stranger);
        vm.expectRevert();
        gold.setPrice(1);
        vm.expectRevert(MockGold.ZeroPrice.selector);
        gold.setPrice(0);
    }
}
