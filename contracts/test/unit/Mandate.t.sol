// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import {Fixture} from "../utils/Fixture.sol";
import {Action, MandateConfig, Op, Reason} from "../../src/interfaces/Types.sol";
import {Mandate} from "../../src/core/Mandate.sol";

/// @notice Every Reason that Mandate.check owns: OK, ADAPTER_NOT_ALLOWED, NAV_STALE, TRADE_TOO_LARGE,
///         LIQUIDITY_FLOOR, WEIGHT_OUT_OF_BAND. (COOLDOWN, TURNOVER_CAP, PAUSED live in ManagerGateway.)
contract MandateTest is Fixture {
    uint256 constant TOTAL = 10_000 * USD;

    function setUp() public override {
        super.setUp();
        _seedBalanced(TOTAL);
    }

    function test_ok_atTargetsWithNoActions() public view {
        assertEq(uint8(mandate.check(new Action[](0))), uint8(Reason.OK));
    }

    function test_ok_inBandRebalance() public view {
        // T-bill 45% -> 42% (band 40-50), cash 20% -> 23%.
        assertEq(uint8(mandate.check(_one(address(tbill), Op.Withdraw, 300 * USD))), uint8(Reason.OK));
    }

    function test_adapterNotAllowed_unknownAdapter() public {
        assertEq(uint8(mandate.check(_one(makeAddr("0xABC"), Op.Deposit, 1))), uint8(Reason.ADAPTER_NOT_ALLOWED));
    }

    function test_adapterNotAllowed_opMismatch() public view {
        assertEq(uint8(mandate.check(_one(address(credit), Op.Withdraw, 1))), uint8(Reason.ADAPTER_NOT_ALLOWED));
        assertEq(uint8(mandate.check(_one(address(tbill), Op.RequestRedeem, 1))), uint8(Reason.ADAPTER_NOT_ALLOWED));
        assertEq(uint8(mandate.check(_one(address(gold), Op.Claim, 1))), uint8(Reason.ADAPTER_NOT_ALLOWED));
    }

    function test_adapterNotAllowed_takesPrecedenceOverStaleNav() public {
        vm.warp(block.timestamp + 1 days);
        assertEq(uint8(mandate.check(_one(makeAddr("evil"), Op.Deposit, 1))), uint8(Reason.ADAPTER_NOT_ALLOWED));
    }

    function test_navStale_tooOld() public {
        vm.warp(block.timestamp + 15 minutes + 1);
        assertEq(uint8(mandate.check(new Action[](0))), uint8(Reason.NAV_STALE));
    }

    function test_navStale_noReport() public {
        Mandate m = Mandate(Clones.clone(factory.mandateImpl()));
        m.initialize(makeAddr("otherPlenum"), address(oracle), governance, balanced());
        assertEq(uint8(m.check(new Action[](0))), uint8(Reason.NAV_STALE));
    }

    function test_tradeTooLarge_overMaxTradeBps() public view {
        // 10% of 10,000 = 1,000; 1,000.000001 is over.
        assertEq(uint8(mandate.check(_one(address(tbill), Op.Withdraw, 1000 * USD + 1))), uint8(Reason.TRADE_TOO_LARGE));
        // Exactly at the cap is not a size breach (it fails the T-bill band instead: 35% < 40%).
        assertEq(uint8(mandate.check(_one(address(tbill), Op.Withdraw, 1000 * USD))), uint8(Reason.WEIGHT_OUT_OF_BAND));
    }

    function test_liquidityFloor() public view {
        // Cash 20% -> 15%, T-bill 45% -> 50% (still in band).
        assertEq(uint8(mandate.check(_one(address(tbill), Op.Deposit, 500 * USD))), uint8(Reason.LIQUIDITY_FLOOR));
    }

    function test_weightOutOfBand() public view {
        // Credit 20% -> 24% (band 17-23).
        Action[] memory a = _two(address(tbill), Op.Withdraw, 400 * USD, address(credit), Op.Deposit, 400 * USD);
        assertEq(uint8(mandate.check(a)), uint8(Reason.WEIGHT_OUT_OF_BAND));
    }

    function _driftCredit() internal {
        _execute(_one(address(tbill), Op.Withdraw, 500 * USD)); // T-bill 40%, cash 25%
        aToken.mint(address(this), 600 * USD);
        aToken.approve(address(credit), 600 * USD);
        credit.accrue(address(plenum), 600 * USD); // credit 2,600 / 10,600 = 24.5% (band 17-23), cash 23.6%
    }

    function test_noWorse_driftDoesNotBlockUnrelatedTrades() public {
        _driftCredit();
        assertEq(uint8(mandate.check(new Action[](0))), uint8(Reason.OK));
        // Gold 1,500 -> 1,700 (16.0%, band 12-18), cash 23.6% -> 21.7%: credit untouched, so no worse.
        assertEq(uint8(mandate.check(_one(address(gold), Op.Deposit, 200 * USD))), uint8(Reason.OK));
    }

    function test_noWorse_cannotPushDriftedSleeveFurther() public {
        _driftCredit();
        assertEq(uint8(mandate.check(_one(address(credit), Op.Deposit, 100 * USD))), uint8(Reason.WEIGHT_OUT_OF_BAND));
    }

    function test_noWorse_creditDriftFixedInBandStepByStep() public {
        _driftCredit();
        // Step 1: request 400 (pending still counts toward credit: weight unchanged, so allowed).
        Action[] memory req = _one(address(credit), Op.RequestRedeem, 400 * USD);
        assertEq(uint8(mandate.check(req)), uint8(Reason.OK));
        _execute(req);
        // Step 2: claim after the delay -> credit 2,200 / 10,600 = 20.8%, back in band.
        vm.warp(block.timestamp + 1 hours);
        _postNav(10_600 * USD);
        Action[] memory clm = _one(address(credit), Op.Claim, 1);
        assertEq(uint8(mandate.check(clm)), uint8(Reason.OK));
        _execute(clm);
        assertEq(uint8(mandate.check(new Action[](0))), uint8(Reason.OK));
    }

    function test_noWorse_cannotOvershootPastTheOtherBand() public {
        _execute(_one(address(tbill), Op.Deposit, 500 * USD)); // T-bill 50% (edge), cash 15%
        aToken.mint(address(this), 200 * USD);
        aToken.approve(address(tbill), 200 * USD);
        tbill.accrue(200 * USD); // T-bill 5,200 / 10,200 = 51.0% (above band), cash 14.7%
        _postNav(10_200 * USD);
        // Withdraw 1,000 is within the size cap (10% of 10,200) and lands T-bill at 41.2%: in band, allowed.
        assertEq(uint8(mandate.check(_one(address(tbill), Op.Withdraw, 1000 * USD))), uint8(Reason.OK));
        // Two withdrawals of 1,000 land at 31.4%: crossed target and out of band on the other side.
        Action[] memory two = _two(address(tbill), Op.Withdraw, 1000 * USD, address(tbill), Op.Withdraw, 1000 * USD);
        assertEq(uint8(mandate.check(two)), uint8(Reason.WEIGHT_OUT_OF_BAND));
    }

    function test_noWorse_floorMayNotFallFurther() public {
        aToken.mint(address(this), 600 * USD);
        aToken.approve(address(credit), 600 * USD);
        credit.accrue(address(plenum), 600 * USD); // cash 2,000 / 10,600 = 18.9% (below floor)
        assertEq(uint8(mandate.check(new Action[](0))), uint8(Reason.OK));
        assertEq(uint8(mandate.check(_one(address(gold), Op.Deposit, 10 * USD))), uint8(Reason.LIQUIDITY_FLOOR));
        // Raising cash from T-bill is allowed even though it stays below the floor.
        assertEq(uint8(mandate.check(_one(address(tbill), Op.Withdraw, 100 * USD))), uint8(Reason.OK));
    }

    function test_pendingCountsTowardSleeveUntilClaimed() public {
        // Request: value moves to pending, credit weight unchanged at 20%.
        Action[] memory req = _one(address(credit), Op.RequestRedeem, 300 * USD);
        assertEq(uint8(mandate.check(req)), uint8(Reason.OK));
        _execute(req);
        assertEq(credit.pendingOf(address(plenum)), 300 * USD);

        // Claim after the delay: credit 17% (edge of band), cash 23%.
        vm.warp(block.timestamp + 1 hours);
        _postNav(TOTAL);
        Action[] memory clm = _one(address(credit), Op.Claim, 1);
        assertEq(uint8(mandate.check(clm)), uint8(Reason.OK));
        _execute(clm);
        assertEq(plenum.cash(), 2300 * USD);
    }

    function test_config_rejectsInvalid() public {
        MandateConfig memory c = balanced();
        c.targetBps[0] = 9000; // targets + floor > 100%
        Mandate m = Mandate(Clones.clone(factory.mandateImpl()));
        vm.expectRevert(Mandate.InvalidConfig.selector);
        m.initialize(address(plenum), address(oracle), governance, c);

        c = balanced();
        c.maxMembers = 100; // PS-3 guardrail
        vm.expectRevert(Mandate.InvalidConfig.selector);
        m.initialize(address(plenum), address(oracle), governance, c);

        c = balanced();
        c.adapters[1] = c.adapters[0]; // duplicate adapter
        vm.expectRevert(Mandate.InvalidConfig.selector);
        m.initialize(address(plenum), address(oracle), governance, c);
    }

    function test_reasonOrdinalsMatchSpec() public pure {
        assertEq(uint8(Reason.OK), 0);
        assertEq(uint8(Reason.ADAPTER_NOT_ALLOWED), 1);
        assertEq(uint8(Reason.WEIGHT_OUT_OF_BAND), 2);
        assertEq(uint8(Reason.NAV_STALE), 6);
        assertEq(uint8(Reason.PAUSED), 8);
        assertEq(uint8(Reason.MEMBER_CAP), 12);
    }
}
