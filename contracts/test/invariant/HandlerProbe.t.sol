// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {InvariantSetup} from "./PlenumInvariants.t.sol";

/// @notice Guards the invariant suite's usefulness: the handler must be able to reach successful in-band
///         executions, otherwise invariant 2 would pass vacuously.
contract HandlerProbe is InvariantSetup {
    function test_handlerReachesInBandExecutions() public {
        for (uint256 i; i < 40; ++i) {
            uint256 seed = uint256(keccak256(abi.encode(i)));
            handler.managerAct(seed, seed >> 8, seed >> 16, false, true);
        }
        assertGt(handler.okExecutions(), 3);
        assertFalse(handler.bandViolation());
    }

    /// The SPEC A26 actions must take effect, or invariants 4 and 8 would pass vacuously.
    function test_handlerReachesRuleChangesSwapsAndExits() public {
        handler.changeRules(500, 1 days);
        assertEq(mandate.config().earlyExitFeeBps, 500);

        handler.replaceManager();
        assertEq(handler.manager(), handler.manager2());
        handler.replaceManager();
        assertEq(handler.manager(), manager);

        vm.warp(mandate.nextPeriodEnd() - 1 hours); // mid-period: exits pay the fee
        handler.postNav();
        assertGt(mandate.exitFeeBps(), 0);
        handler.contribute(1, 1_000 * USD);
        handler.leaveAndRejoin(1);
        assertGt(usd.balanceOf(plenum.treasury()), 0);
        assertTrue(plenum.isMember(jonas)); // rejoined
        assertFalse(handler.treasuryOverpaid());
    }
}
