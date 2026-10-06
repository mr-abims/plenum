// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Fixture} from "../utils/Fixture.sol";
import {Action, Op, PolicyViolation, Reason, Unauthorized} from "../../src/interfaces/Types.sol";
import {IGovernance} from "../../src/interfaces/IGovernance.sol";
import {Governance} from "../../src/core/Governance.sol";

contract GovernanceTest is Fixture {
    Governance gov;
    Action[] internal big;

    function setUp() public override {
        super.setUp();
        _seedBalanced(10_000 * USD);
        _join(jonas, 2);
        _join(wei_, 3);
        gov = Governance(governance);
    }

    function _propose(address who) internal returns (uint256) {
        vm.prank(who);
        return gov.propose(_one(address(tbill), Op.Withdraw, 1_500 * USD), keccak256("memo"));
    }

    function test_propose_membersOrGatewayOnly() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Unauthorized.selector, stranger));
        gov.propose(_one(address(tbill), Op.Withdraw, 1), bytes32(0));
        assertEq(_propose(jonas), 1);
        assertEq(_propose(gateway), 2);
    }

    function test_propose_allowlistOnly() public {
        vm.prank(jonas);
        vm.expectRevert(abi.encodeWithSelector(PolicyViolation.selector, Reason.ADAPTER_NOT_ALLOWED));
        gov.propose(_one(makeAddr("evil"), Op.Deposit, 1), bytes32(0));
    }

    function test_quorumAndExecute() public {
        uint256 id = _propose(gateway);
        vm.prank(ana);
        gov.approve(id);
        assertFalse(gov.quorumReached(id)); // 1 of 3 < 50%
        vm.expectRevert(abi.encodeWithSelector(Governance.QuorumNotReached.selector, id));
        gov.executeProposal(id);

        vm.expectEmit(address(gov));
        emit IGovernance.Approved(id, jonas);
        vm.prank(jonas);
        gov.approve(id);
        assertTrue(gov.quorumReached(id));

        vm.expectEmit(address(gov));
        emit IGovernance.ProposalExecuted(id);
        gov.executeProposal(id);
        assertEq(plenum.cash(), 3_500 * USD);

        vm.expectRevert(abi.encodeWithSelector(Governance.ProposalClosed.selector, id));
        gov.executeProposal(id);
    }

    function test_approve_rules() public {
        uint256 id = _propose(gateway);
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Unauthorized.selector, stranger));
        gov.approve(id);

        vm.startPrank(ana);
        gov.approve(id);
        vm.expectRevert(abi.encodeWithSelector(Governance.AlreadyApproved.selector, id, ana));
        gov.approve(id);
        vm.stopPrank();

        vm.warp(block.timestamp + 48 hours + 1);
        vm.prank(jonas);
        vm.expectRevert(abi.encodeWithSelector(Governance.ProposalClosed.selector, id));
        gov.approve(id);

        vm.prank(jonas);
        vm.expectRevert(abi.encodeWithSelector(Governance.UnknownProposal.selector, 99));
        gov.approve(99);
    }

    function test_execute_rechecksNavFreshness() public {
        uint256 id = _propose(gateway);
        vm.prank(ana);
        gov.approve(id);
        vm.prank(jonas);
        gov.approve(id);
        vm.warp(block.timestamp + 16 minutes);
        vm.expectRevert(abi.encodeWithSelector(PolicyViolation.selector, Reason.NAV_STALE));
        gov.executeProposal(id);
    }

    function test_pauseAndUnpause_kOfN() public {
        vm.prank(ana);
        gov.pause();
        assertFalse(gov.paused());
        vm.prank(ana);
        vm.expectRevert(abi.encodeWithSelector(Governance.AlreadyVoted.selector, ana));
        gov.pause();

        vm.expectEmit(address(gov));
        emit IGovernance.Paused(jonas);
        vm.prank(jonas);
        gov.pause();
        assertTrue(gov.paused());

        vm.prank(ana); // new round: Ana may vote again
        gov.unpause();
        assertTrue(gov.paused());
        vm.prank(wei_);
        gov.unpause();
        assertFalse(gov.paused());
    }

    function test_pause_membersOnly() public {
        vm.prank(stranger);
        vm.expectRevert(abi.encodeWithSelector(Unauthorized.selector, stranger));
        gov.pause();
    }

    function test_actionsStoredVerbatim() public {
        uint256 id = _propose(gateway);
        Action[] memory a = gov.actionsOf(id);
        assertEq(a.length, 1);
        assertEq(a[0].adapter, address(tbill));
        assertEq(a[0].assets, 1_500 * USD);
    }
}
