// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {MandateConfig} from "../src/interfaces/Types.sol";
import {Rehearsal} from "./Rehearsal.s.sol";
import {Templates} from "./Templates.sol";

/// @notice A personal portfolio (a plenum of one, SPEC A23) through the same lifecycle as the rehearsal group:
///         Balanced template with maxMembers = 1, pauseQuorum = 1 and escalateQuorumBps = 10000, so the owner alone
///         approves escalations and pauses the manager. Demo timing. Writes `personalPlenum`.
contract Personal is Rehearsal {
    function groupName() internal pure override returns (string memory) {
        return "My Portfolio";
    }

    function jsonKey() internal pure override returns (string memory) {
        return ".personalPlenum";
    }

    function mandate(Ctx memory c) internal pure override returns (MandateConfig memory) {
        return Templates.buildPersonal(Templates.BALANCED, c.tbill, c.credit, c.gold, timing());
    }
}
