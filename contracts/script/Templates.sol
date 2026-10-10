// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {MandateConfig} from "../src/interfaces/Types.sol";

/// @notice Mandate presets from SPEC §12. The agent and app mirror these numbers.
library Templates {
    uint8 internal constant CONSERVATIVE = 0;
    uint8 internal constant BALANCED = 1;
    uint8 internal constant LIQUIDITY_FIRST = 2;

    /// @notice Clock and quorum settings that differ between production defaults and the recorded demo.
    struct Timing {
        uint32 navMaxAge;
        uint32 cooldown;
        uint32 votingPeriod;
        uint16 escalateQuorumBps;
        uint16 pauseQuorum;
    }

    /// @notice Production defaults: 48 h votes, half the members to approve, 2 to pause.
    function standard() internal pure returns (Timing memory) {
        return Timing({
            navMaxAge: 15 minutes, cooldown: 5 minutes, votingPeriod: 48 hours, escalateQuorumBps: 5000, pauseQuorum: 2
        });
    }

    /// @notice Demo: CRE runs every minute, short cooldown, 1-hour votes, 2 of 5 to approve or pause.
    function demo() internal pure returns (Timing memory) {
        return Timing({
            navMaxAge: 10 minutes, cooldown: 1 minutes, votingPeriod: 1 hours, escalateQuorumBps: 4000, pauseQuorum: 2
        });
    }

    /// @notice Personal portfolio (SPEC A23): a plenum of one. The owner alone approves escalations and can pause.
    function buildPersonal(uint8 id, address tbill, address credit, address gold, Timing memory t)
        internal
        pure
        returns (MandateConfig memory c)
    {
        c = build(id, tbill, credit, gold, t);
        c.maxMembers = 1;
        c.pauseQuorum = 1;
        c.escalateQuorumBps = 10_000;
    }

    function build(uint8 id, address tbill, address credit, address gold, Timing memory t)
        internal
        pure
        returns (MandateConfig memory c)
    {
        if (id == LIQUIDITY_FIRST) {
            // Credit target 0%: left off the allowlist entirely.
            c.adapters = new address[](2);
            c.adapters[0] = tbill;
            c.adapters[1] = gold;
            c.targetBps = new uint16[](2);
            c.targetBps[0] = 5000;
            c.targetBps[1] = 1000;
            c.bandBps = new uint16[](2);
            c.bandBps[0] = 500;
            c.bandBps[1] = 300;
            c.minLiquidityBps = 4000;
            c.maxTradeBps = 1500;
        } else {
            c.adapters = new address[](3);
            c.adapters[0] = tbill;
            c.adapters[1] = credit;
            c.adapters[2] = gold;
            c.targetBps = new uint16[](3);
            c.bandBps = new uint16[](3);
            c.bandBps[0] = 500;
            c.bandBps[1] = 300;
            c.bandBps[2] = 300;
            if (id == CONSERVATIVE) {
                c.targetBps[0] = 6000;
                c.targetBps[1] = 1000;
                c.targetBps[2] = 1000;
            } else {
                c.targetBps[0] = 4500;
                c.targetBps[1] = 2000;
                c.targetBps[2] = 1500;
            }
            c.minLiquidityBps = 2000;
            c.maxTradeBps = 1000;
        }
        c.maxDailyTurnoverBps = 2500;
        c.navMaxAge = t.navMaxAge;
        c.cooldown = t.cooldown;
        c.maxMembers = 99;
        c.escalateQuorumBps = t.escalateQuorumBps;
        c.mandateChangeBps = 6667;
        c.timelock = 48 hours;
        c.pauseQuorum = t.pauseQuorum;
        c.votingPeriod = t.votingPeriod;
    }
}
