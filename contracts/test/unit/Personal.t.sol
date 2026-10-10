// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Fixture} from "../utils/Fixture.sol";
import {MandateConfig, Op, PolicyViolation, Reason} from "../../src/interfaces/Types.sol";
import {Plenum} from "../../src/core/Plenum.sol";
import {Mandate} from "../../src/core/Mandate.sol";
import {Governance} from "../../src/core/Governance.sol";
import {ManagerGateway} from "../../src/core/ManagerGateway.sol";

/// @notice Personal portfolios (SPEC A23): a plenum of one runs on the same contracts with single-person settings.
contract PersonalPortfolioTest is Fixture {
    Governance gov;
    ManagerGateway gw;

    function setUp() public override {
        super.setUp();
        MandateConfig memory c = balanced();
        c.maxMembers = 1;
        c.pauseQuorum = 1;
        c.escalateQuorumBps = 10_000;
        vm.prank(ana);
        plenum = Plenum(factory.createPlenum("My portfolio", 1, c, manager));
        mandate = Mandate(plenum.mandate());
        governance = plenum.governance();
        gateway = plenum.gateway();
        gov = Governance(governance);
        gw = ManagerGateway(gateway);
        _seedBalanced(10_000 * USD); // Ana joins, contributes and allocates to targets
    }

    function test_nobodyElseCanJoin() public {
        bytes memory inv = _invite(anaPk, jonas, 2, uint64(block.timestamp + 1 days));
        vm.prank(jonas);
        vm.expectRevert(abi.encodeWithSelector(PolicyViolation.selector, Reason.MEMBER_CAP));
        plenum.join(inv, bytes32(0));
        assertEq(plenum.memberCount(), 1);
    }

    function test_managerTradesInBand() public {
        vm.prank(manager);
        assertEq(
            uint8(gw.executeInBand(_one(address(tbill), Op.Withdraw, 300 * USD), bytes32(0), bytes32(0))),
            uint8(Reason.OK)
        );
        assertEq(plenum.cash(), 2_300 * USD);
    }

    function test_ownerAloneApprovesEscalations() public {
        vm.prank(manager);
        uint256 id = gw.escalate(_one(address(tbill), Op.Withdraw, 1_500 * USD), bytes32(0), bytes32(0));
        assertFalse(gov.quorumReached(id));
        vm.prank(ana);
        gov.approve(id);
        assertTrue(gov.quorumReached(id)); // 1 of 1
        gov.executeProposal(id);
        assertEq(plenum.cash(), 3_500 * USD);
    }

    function test_ownerAlonePausesAndResumes() public {
        vm.prank(ana);
        gov.pause();
        assertTrue(gov.paused());
        vm.prank(manager);
        vm.expectRevert(abi.encodeWithSelector(PolicyViolation.selector, Reason.PAUSED));
        gw.executeInBand(_one(address(tbill), Op.Withdraw, 100 * USD), bytes32(0), bytes32(0));
        vm.prank(ana);
        gov.unpause();
        assertFalse(gov.paused());
    }

    function test_ownerRedeemsToSelf() public {
        uint256 units = plenum.unitsOf(ana);
        vm.prank(ana);
        uint256 out = plenum.redeem(units / 10, ana);
        assertApproxEqAbs(out, 1_000 * USD, 1);
    }
}
