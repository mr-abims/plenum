// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Fixture} from "../utils/Fixture.sol";
import {Action, Op, PolicyViolation, Reason, Unauthorized} from "../../src/interfaces/Types.sol";
import {IManagerGateway} from "../../src/interfaces/IManagerGateway.sol";
import {ManagerGateway} from "../../src/core/ManagerGateway.sol";
import {Governance} from "../../src/core/Governance.sol";

/// @notice Gateway behaviour plus the contract-level red-team cases (SPEC §8): RT-1, RT-3, RT-4, RT-5, RT-6, RT-8.
contract ManagerGatewayTest is Fixture {
    bytes32 constant RATIONALE = keccak256("memo");
    bytes32 constant MODEL = bytes32("qwen3.8-max");

    ManagerGateway gw;
    Governance gov;

    function setUp() public override {
        super.setUp();
        _seedBalanced(10_000 * USD);
        _join(jonas, 2);
        _join(wei_, 3);
        gw = ManagerGateway(gateway);
        gov = Governance(governance);
    }

    function _act(Action[] memory a) internal returns (Reason) {
        vm.prank(manager);
        return gw.executeInBand(a, RATIONALE, MODEL);
    }

    function test_onlyManager() public {
        Action[] memory a = _one(address(tbill), Op.Withdraw, 100 * USD);
        vm.prank(ana);
        vm.expectRevert(abi.encodeWithSelector(Unauthorized.selector, ana));
        gw.executeInBand(a, RATIONALE, MODEL);
        vm.prank(ana);
        vm.expectRevert(abi.encodeWithSelector(Unauthorized.selector, ana));
        gw.escalate(a, RATIONALE, MODEL);
    }

    function test_inBand_executesAndCommitsProvenance() public {
        Action[] memory a = _one(address(tbill), Op.Withdraw, 300 * USD);
        vm.expectEmit(address(gw));
        emit IManagerGateway.ManagerAction(keccak256(abi.encode(a)), RATIONALE, MODEL, Reason.OK);
        assertEq(uint8(_act(a)), uint8(Reason.OK));
        assertEq(plenum.cash(), 2_300 * USD);
        assertEq(gw.lastExecution(), block.timestamp);
        assertEq(gw.turnoverToday(), 300 * USD);
    }

    function test_cooldown_refusedWithoutStateChange() public {
        _act(_one(address(tbill), Op.Withdraw, 100 * USD));
        Action[] memory a = _one(address(tbill), Op.Withdraw, 100 * USD);
        vm.expectEmit(address(gw));
        emit IManagerGateway.ManagerAction(keccak256(abi.encode(a)), RATIONALE, MODEL, Reason.COOLDOWN);
        assertEq(uint8(_act(a)), uint8(Reason.COOLDOWN));
        assertEq(plenum.cash(), 2_100 * USD);
        vm.warp(block.timestamp + 1 minutes);
        _postNav(10_000 * USD);
        assertEq(uint8(_act(a)), uint8(Reason.OK));
    }

    /// RT-1 / RT-8: a forced call to an address that is not on the allowlist reverts.
    function test_RT1_RT8_unknownAdapterReverts() public {
        address evil = makeAddr("0xABC");
        vm.prank(manager);
        vm.expectRevert(abi.encodeWithSelector(PolicyViolation.selector, Reason.ADAPTER_NOT_ALLOWED));
        gw.executeInBand(_one(evil, Op.Deposit, 4_000 * USD), RATIONALE, MODEL);
        vm.prank(manager);
        vm.expectRevert(abi.encodeWithSelector(PolicyViolation.selector, Reason.ADAPTER_NOT_ALLOWED));
        gw.escalate(_one(evil, Op.Deposit, 4_000 * USD), RATIONALE, MODEL);
    }

    /// RT-3: stale NAV -> refused, nothing moves.
    function test_RT3_staleNavRefused() public {
        vm.warp(block.timestamp + 16 minutes);
        assertEq(uint8(_act(_one(address(tbill), Op.Withdraw, 100 * USD))), uint8(Reason.NAV_STALE));
        assertEq(plenum.cash(), 2_000 * USD);
    }

    /// RT-4: one trade above maxTradeBps is refused in-band, escalated, and only moves after member approval.
    function test_RT4_oversizedTradeEscalatedThenApproved() public {
        Action[] memory big = _two(address(tbill), Op.Withdraw, 1_500 * USD, address(gold), Op.Deposit, 1_500 * USD);
        assertEq(uint8(_act(big)), uint8(Reason.TRADE_TOO_LARGE));

        vm.prank(manager);
        uint256 id = gw.escalate(big, RATIONALE, MODEL);
        assertEq(plenum.cash(), 2_000 * USD); // nothing moved

        vm.prank(jonas);
        gov.approve(id);
        vm.prank(wei_);
        gov.approve(id); // 2 of 3 members >= 50%
        gov.executeProposal(id);
        assertEq(tbill.valueOf(address(plenum)), 3_000 * USD);
    }

    /// RT-5: many small trades to evade the size cap hit the daily turnover cap (25% of holdings).
    function test_RT5_turnoverCap() public {
        for (uint256 i; i < 3; ++i) {
            assertEq(uint8(_act(_one(address(tbill), Op.Withdraw, 400 * USD))), uint8(Reason.OK));
            _tick();
            assertEq(uint8(_act(_one(address(tbill), Op.Deposit, 400 * USD))), uint8(Reason.OK));
            _tick();
        }
        // 2,400 used; one more 400 trade would make 2,800 > 2,500.
        uint256 cashBefore = plenum.cash();
        assertEq(uint8(_act(_one(address(tbill), Op.Withdraw, 400 * USD))), uint8(Reason.TURNOVER_CAP));
        assertEq(plenum.cash(), cashBefore);
        // Next day the budget resets.
        vm.warp(block.timestamp + 1 days);
        _postNav(10_000 * USD);
        assertEq(uint8(_act(_one(address(tbill), Op.Withdraw, 400 * USD))), uint8(Reason.OK));
    }

    /// RT-6: stolen key — members pause instantly and every gateway write reverts.
    function test_RT6_pauseStopsTheManager() public {
        vm.prank(jonas);
        gov.pause();
        vm.prank(wei_);
        gov.pause(); // quorum 2
        assertTrue(gov.paused());
        Action[] memory a = _one(address(tbill), Op.Withdraw, 100 * USD);
        vm.prank(manager);
        vm.expectRevert(abi.encodeWithSelector(PolicyViolation.selector, Reason.PAUSED));
        gw.executeInBand(a, RATIONALE, MODEL);
        vm.prank(manager);
        vm.expectRevert(abi.encodeWithSelector(PolicyViolation.selector, Reason.PAUSED));
        gw.escalate(a, RATIONALE, MODEL);
    }

    function test_simulateMatchesExecution() public {
        assertEq(uint8(gw.simulate(_one(address(tbill), Op.Withdraw, 300 * USD))), uint8(Reason.OK));
        assertEq(uint8(gw.simulate(_one(address(tbill), Op.Deposit, 500 * USD))), uint8(Reason.LIQUIDITY_FLOOR));
    }

    function test_setManager_onlyGovernance() public {
        vm.prank(manager);
        vm.expectRevert(abi.encodeWithSelector(Unauthorized.selector, manager));
        gw.setManager(manager);
        vm.prank(governance);
        gw.setManager(ana);
        assertEq(gw.manager(), ana);
    }

    function _tick() internal {
        vm.warp(block.timestamp + 1 minutes);
        _postNav(10_000 * USD);
    }
}
