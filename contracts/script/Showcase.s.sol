// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Rehearsal} from "./Rehearsal.s.sol";
import {Templates} from "./Templates.sol";

/// @notice Showcase group for the landing page's live "break the rules" console: a Balanced group whose price stays
///         valid for 30 days, so visitors' moves are answered by ManagerGateway.simulate during judging without a
///         price update. Same setup as the rehearsal group; written to deployments/<chainId>.json as `showcasePlenum`.
contract Showcase is Rehearsal {
    function groupName() internal pure override returns (string memory) {
        return "Showcase Club";
    }

    function timing() internal pure override returns (Templates.Timing memory t) {
        t = Templates.demo();
        t.navMaxAge = 30 days;
    }

    function jsonKey() internal pure override returns (string memory) {
        return ".showcasePlenum";
    }
}
