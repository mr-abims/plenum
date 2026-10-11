// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Fixture} from "../utils/Fixture.sol";
import {Action, Op} from "../../src/interfaces/Types.sol";

contract UnitMathFuzz is Fixture {
    function setUp() public override {
        super.setUp();
        _join(ana, 1);
        _join(jonas, 2);
        _fund(ana, type(uint128).max);
        _fund(jonas, type(uint128).max);
    }

    /// @notice Invariant 7: contribute then immediately redeem at an unchanged NAV never returns more.
    function testFuzz_contributeThenRedeemNeverProfits(uint256 seed, uint256 nav, uint256 assets) public {
        seed = bound(seed, 1, 1e15 * USD);
        nav = bound(nav, 1, 1e15 * USD);
        assets = bound(assets, 1, 1e15 * USD);

        vm.prank(ana);
        plenum.contribute(seed);
        _postNav(nav);
        // Make sure redemptions can be paid from cash whatever the reported NAV says.
        usd.mint(address(plenum), 2e15 * USD);

        vm.startPrank(jonas);
        uint256 units;
        try plenum.contribute(assets) returns (uint256 u) {
            units = u;
        } catch {
            vm.stopPrank();
            return; // dust that prices to zero units is refused (ZeroAmount); nothing moved
        }
        uint256 out = plenum.redeem(units, jonas);
        vm.stopPrank();
        assertLe(out, assets);
    }

    /// @notice First-depositor inflation (virtual offset δ = 6): the attacker never profits, and the victim's
    ///         rounding loss is bounded by donation / 10^6 (the attack costs ~10^6× what it can take).
    function testFuzz_firstDepositorInflationUnprofitable(uint256 donation, uint256 victim) public {
        donation = bound(donation, 1, 1e12 * USD);
        victim = bound(victim, 1 * USD, 1e12 * USD);

        vm.prank(ana);
        uint256 attackerUnits = plenum.contribute(1);
        usd.mint(address(plenum), donation); // attacker "donates" cash
        _postNav(donation + 1); // honest administrator prices the donation in

        vm.prank(jonas);
        uint256 victimUnits;
        try plenum.contribute(victim) returns (uint256 u) {
            victimUnits = u;
        } catch {
            return; // priced to zero units: the contribution is refused, so the victim loses nothing
        }

        _postNav(donation + 1 + victim);
        vm.prank(jonas);
        uint256 victimBack = plenum.redeem(victimUnits, jonas);
        vm.prank(ana);
        uint256 attackerBack = plenum.redeem(attackerUnits, ana);

        assertLe(victimBack, victim);
        assertLe(victim - victimBack, donation / 1e6 + 2);
        assertLe(attackerBack, donation + 1); // no profit
    }

    /// @notice Mandate.check never reverts on allowlisted actions of any size.
    function testFuzz_checkNeverReverts(uint8 which, uint8 opRaw, uint256 assets) public {
        _seedBalanced(10_000 * USD);
        address[3] memory adapters = [address(tbill), address(credit), address(gold)];
        Action[] memory a = _one(adapters[which % 3], Op(opRaw % 4), bound(assets, 0, 1e30));
        mandate.check(a);
    }
}
