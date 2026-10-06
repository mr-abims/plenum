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
}
