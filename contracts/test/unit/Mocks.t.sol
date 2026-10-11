// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Fixture} from "../utils/Fixture.sol";
import {Reason} from "../../src/interfaces/Types.sol";
import {MockUSD} from "../../src/mocks/MockUSD.sol";
import {MockCreditVault} from "../../src/adapters/MockCreditVault.sol";
import {MockGold} from "../../src/adapters/MockGold.sol";

/// @notice MOCK test dollar and MOCK adapters.
contract MocksTest is Fixture {
    function test_usd_isAPlainSixDecimalToken() public {
        assertEq(usd.decimals(), 6);
        usd.mint(ana, 10 * USD);
        vm.prank(ana);
        usd.transfer(stranger, 1);
        assertEq(usd.balanceOf(stranger), 1);
    }

    function test_usd_mintRequiresRole() public {
        vm.prank(stranger);
        vm.expectRevert();
        usd.mint(stranger, 1);
    }

    function test_tbill_depositAccrueWithdraw() public {
        usd.mint(ana, 1_000 * USD);
        vm.startPrank(ana);
        usd.approve(address(tbill), type(uint256).max);
        tbill.deposit(1_000 * USD);
        vm.stopPrank();
        usd.mint(address(this), 50 * USD);
        usd.approve(address(tbill), 50 * USD);
        tbill.accrue(50 * USD);
        assertApproxEqAbs(tbill.valueOf(ana), 1_050 * USD, 1);
        vm.prank(ana);
        tbill.withdraw(1_000 * USD);
        assertEq(usd.balanceOf(ana), 1_000 * USD);
    }

    function test_credit_asyncExit() public {
        usd.mint(ana, 100 * USD);
        vm.startPrank(ana);
        usd.approve(address(credit), type(uint256).max);
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
        usd.mint(ana, 2_400 * USD);
        vm.startPrank(ana);
        usd.approve(address(gold), type(uint256).max);
        gold.deposit(2_400 * USD); // 1 oz
        vm.stopPrank();
        assertEq(gold.ounces(ana), 1e18);
        gold.setPrice(2_640 * USD);
        assertEq(gold.valueOf(ana), 2_640 * USD);
        vm.prank(ana);
        vm.expectRevert(); // reserve only holds 2,400
        gold.withdraw(2_640 * USD);
        usd.mint(address(this), 240 * USD);
        usd.approve(address(gold), 240 * USD);
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

    function test_gold_crePriceReportUpdatesPrice() public {
        uint64 ts = uint64(block.timestamp);
        vm.expectEmit(address(gold));
        emit MockGold.PriceReported(2_600 * USD, ts);
        vm.prank(MOCK_FORWARDER);
        gold.onReport("", abi.encode(2_600 * USD, ts));
        assertEq(gold.price(), 2_600 * USD);
        assertEq(gold.priceTimestamp(), ts);
    }

    function test_gold_crePriceReportGuards() public {
        uint64 ts = uint64(block.timestamp);
        vm.startPrank(MOCK_FORWARDER);
        gold.onReport("", abi.encode(2_500 * USD, ts));
        vm.expectRevert(abi.encodeWithSelector(MockGold.StalePrice.selector, ts, ts));
        gold.onReport("", abi.encode(2_510 * USD, ts));
        vm.expectRevert(abi.encodeWithSelector(MockGold.FuturePrice.selector, ts + 1));
        gold.onReport("", abi.encode(2_510 * USD, ts + 1));
        vm.warp(block.timestamp + 60);
        vm.expectRevert(abi.encodeWithSelector(MockGold.PriceJump.selector, 2_500 * USD, 3_100 * USD));
        gold.onReport("", abi.encode(3_100 * USD, uint64(block.timestamp)));
        vm.expectRevert(MockGold.ZeroPrice.selector);
        gold.onReport("", abi.encode(uint256(0), uint64(block.timestamp)));
        vm.stopPrank();

        vm.prank(stranger);
        vm.expectRevert();
        gold.onReport("", abi.encode(2_510 * USD, uint64(block.timestamp)));
        assertEq(gold.price(), 2_500 * USD);
    }
}
