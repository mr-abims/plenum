// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {Fixture} from "../utils/Fixture.sol";
import {Action, MandateConfig, Op, Reason} from "../../src/interfaces/Types.sol";
import {INavOracle} from "../../src/interfaces/INavOracle.sol";
import {IAssetAdapter} from "../../src/interfaces/IAssetAdapter.sol";
import {Plenum} from "../../src/core/Plenum.sol";
import {Mandate} from "../../src/core/Mandate.sol";
import {ManagerGateway} from "../../src/core/ManagerGateway.sol";
import {Governance} from "../../src/core/Governance.sol";
import {NavOracle} from "../../src/core/NavOracle.sol";
import {MockAToken} from "../../src/mocks/MockAToken.sol";
import {MockTBillVault} from "../../src/adapters/MockTBillVault.sol";
import {MockCreditVault} from "../../src/adapters/MockCreditVault.sol";

/// @notice Drives random sequences of member, manager, administrator and attacker actions and records any
///         breach of SPEC §13 invariants in ghost variables.
contract Handler is Test {
    uint256 constant USD = 1e6;
    uint256 constant BPS = 10_000;

    Plenum plenum;
    Mandate mandate;
    ManagerGateway gw;
    Governance gov;
    NavOracle oracle;
    MockAToken aToken;
    MockTBillVault tbill;
    MockCreditVault credit;
    address manager;
    address fallbackWriter;
    address[] public actors;
    address[3] adapters;
    address public evil = makeAddr("evilAdapter");
    address public stranger = makeAddr("unverifiedPayee");

    // Ghosts: each stays false unless an invariant is broken.
    bool public bandViolation; // 2
    bool public managerReducedUnits; // 3
    bool public navWentBackwards; // 5
    bool public pausedWriteSucceeded; // 6
    bool public roundTripProfit; // 7
    uint64 public lastNavTs;
    uint256 public okExecutions;

    constructor(
        Plenum plenum_,
        ManagerGateway gw_,
        Governance gov_,
        NavOracle oracle_,
        MockAToken aToken_,
        address[3] memory adapters_,
        address manager_,
        address fallbackWriter_,
        address[] memory actors_
    ) {
        plenum = plenum_;
        mandate = Mandate(plenum_.mandate());
        gw = gw_;
        gov = gov_;
        oracle = oracle_;
        aToken = aToken_;
        adapters = adapters_;
        tbill = MockTBillVault(adapters_[0]);
        credit = MockCreditVault(adapters_[1]);
        manager = manager_;
        fallbackWriter = fallbackWriter_;
        actors = actors_;
    }

    // ------------------------------------------------------------- members

    function contribute(uint256 who, uint256 amount) external {
        address a = actors[who % actors.length];
        amount = bound(amount, 1, 50_000 * USD);
        vm.prank(a);
        try plenum.contribute(amount) {} catch {}
    }

    function redeem(uint256 who, uint256 frac, bool toStranger) external {
        address a = actors[who % actors.length];
        uint256 units = plenum.unitsOf(a) * bound(frac, 1, 100) / 100;
        if (units == 0) return;
        vm.prank(a);
        try plenum.redeem(units, toStranger ? stranger : a) {} catch {}
    }

    /// Invariant 7: contribute then immediately redeem at an unchanged NAV never returns more.
    function roundTrip(uint256 who, uint256 amount) external {
        address a = actors[who % actors.length];
        amount = bound(amount, 1, 50_000 * USD);
        vm.startPrank(a);
        try plenum.contribute(amount) returns (uint256 units) {
            try plenum.redeem(units, a) returns (uint256 out) {
                if (out > amount) roundTripProfit = true;
            } catch {}
        } catch {}
        vm.stopPrank();
    }

    function vote(uint256 who, bool doPause) external {
        address a = actors[who % actors.length];
        vm.prank(a);
        if (doPause) {
            try gov.pause() {} catch {}
        } else {
            try gov.unpause() {} catch {}
        }
    }

    // ------------------------------------------------------------- manager

    function managerAct(uint256 adapterSeed, uint256 opSeed, uint256 amount, bool useEvil, bool patient) external {
        if (patient) {
            vm.warp(block.timestamp + 1 minutes); // wait out the cooldown
            postNav();
        }
        Action[] memory acts = _action(adapterSeed, opSeed, amount, useEvil);
        uint256[] memory unitsBefore = _units();
        (uint256 cashPre, uint256[3] memory pre, uint256 total) = _holdings();
        bool wasPaused = gov.paused();

        vm.prank(manager);
        try gw.executeInBand(acts, keccak256("memo"), bytes32("qwen3.8-max")) returns (Reason r) {
            if (wasPaused) pausedWriteSucceeded = true;
            if (r == Reason.OK) {
                ++okExecutions;
                _checkNoWorse(cashPre, pre, total);
            }
        } catch {}
        _checkUnits(unitsBefore);
    }

    function managerEscalate(uint256 adapterSeed, uint256 opSeed, uint256 amount, uint256 approvals) external {
        Action[] memory acts = _action(adapterSeed, opSeed, amount, false);
        uint256[] memory unitsBefore = _units();
        bool wasPaused = gov.paused();
        vm.prank(manager);
        try gw.escalate(acts, keccak256("memo"), bytes32("qwen3.8-max")) returns (uint256 id) {
            if (wasPaused) pausedWriteSucceeded = true;
            _checkUnits(unitsBefore);
            approvals = bound(approvals, 0, actors.length);
            for (uint256 i; i < approvals; ++i) {
                vm.prank(actors[i]);
                try gov.approve(id) {} catch {}
            }
            try gov.executeProposal(id) {} catch {}
        } catch {}
    }

    // ---------------------------------------------------- world and admin

    function postNav() public {
        vm.warp(block.timestamp + 1);
        uint256 nav = mandate.holdingsTotal(); // honest administrator
        vm.prank(fallbackWriter);
        try oracle.fallbackWrite(address(plenum), nav) {} catch {}
        uint64 ts = oracle.latest(address(plenum)).timestamp;
        if (ts < lastNavTs) navWentBackwards = true;
        lastNavTs = ts;
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 0, 2 hours));
        postNav();
    }

    function drift(bool useCredit, uint256 amount) external {
        amount = bound(amount, 1, 2_000 * USD);
        aToken.mint(address(this), amount);
        if (useCredit) {
            aToken.approve(address(credit), amount);
            credit.accrue(address(plenum), amount);
        } else {
            aToken.approve(address(tbill), amount);
            tbill.accrue(amount);
        }
    }

    // ------------------------------------------------------------- helpers

    function _action(uint256 adapterSeed, uint256 opSeed, uint256 amount, bool useEvil)
        internal
        view
        returns (Action[] memory acts)
    {
        acts = new Action[](1);
        Op op = Op(opSeed % 4);
        // Mostly realistic sizes (≤ 12% of holdings, around the 10% cap), occasionally anything.
        uint256 cap = mandate.holdingsTotal() * 12 / 100 + 1;
        uint256 assets = op == Op.Claim
            ? bound(amount, 1, credit.nextRequestId())
            : (amount % 8 == 0 ? bound(amount, 1, 1e12 * USD) : bound(amount, 1, cap));
        acts[0] = Action({adapter: useEvil ? evil : adapters[adapterSeed % 3], op: op, assets: assets});
    }

    function _units() internal view returns (uint256[] memory u) {
        u = new uint256[](actors.length);
        for (uint256 i; i < actors.length; ++i) {
            u[i] = plenum.unitsOf(actors[i]);
        }
    }

    /// Invariant 3: no call from the manager address reduces any member's units.
    function _checkUnits(uint256[] memory before) internal {
        for (uint256 i; i < actors.length; ++i) {
            if (plenum.unitsOf(actors[i]) < before[i]) managerReducedUnits = true;
        }
    }

    function _holdings() internal view returns (uint256 cash, uint256[3] memory sleeves, uint256 total) {
        cash = plenum.cash();
        total = cash;
        for (uint256 i; i < 3; ++i) {
            IAssetAdapter a = IAssetAdapter(adapters[i]);
            sleeves[i] = a.valueOf(address(plenum)) + a.pendingOf(address(plenum));
            total += sleeves[i];
        }
    }

    /// Invariant 2 (SPEC A2/A18): after an OK in-band execution every sleeve is in band or no worse, and cash is
    /// at/above the floor or no lower. 1-wei tolerance for adapter rounding (MockGold ounces).
    function _checkNoWorse(uint256 cashPre, uint256[3] memory pre, uint256 totalPre) internal {
        (uint256 cash, uint256[3] memory post, uint256 total) = _holdings();
        MandateConfig memory c = mandate.config();
        if (total + 2 < totalPre) bandViolation = true; // execution may not leak value
        if (cash * BPS < uint256(c.minLiquidityBps) * total && cash < cashPre) bandViolation = true;
        for (uint256 i; i < 3; ++i) {
            uint256 t = uint256(c.targetBps[i]) * total;
            uint256 x = post[i] * BPS;
            uint256 b = uint256(c.bandBps[i]) * total;
            uint256 tol = 2 * BPS;
            if (x + b + tol >= t && x <= t + b + tol) continue;
            uint256 y = pre[i] * BPS;
            if (x > t ? y + tol < x : y > x + tol) bandViolation = true;
        }
    }
}

/// @notice Shared setup: a seeded Balanced plenum with three funded members and the handler as the only target.
abstract contract InvariantSetup is Fixture {
    Handler handler;
    address[] actors;

    function setUp() public override {
        super.setUp();
        _seedBalanced(10_000 * USD);
        _join(jonas, 2);
        _join(wei_, 3);
        actors.push(ana);
        actors.push(jonas);
        actors.push(wei_);
        for (uint256 i; i < actors.length; ++i) {
            _fund(actors[i], 10_000_000 * USD);
        }

        handler = new Handler(
            plenum,
            ManagerGateway(gateway),
            Governance(governance),
            oracle,
            aToken,
            [address(tbill), address(credit), address(gold)],
            manager,
            fallbackWriter,
            actors
        );
        aToken.grantRole(aToken.MINTER_ROLE(), address(handler));
        _verify(address(handler));
        targetContract(address(handler));
    }
}

contract PlenumInvariants is InvariantSetup {
    /// 1. The sum of member units always equals total units.
    function invariant_1_unitsSumToTotal() public view {
        uint256 sum;
        for (uint256 i; i < actors.length; ++i) {
            sum += plenum.unitsOf(actors[i]);
        }
        assertEq(sum, plenum.totalUnits());
    }

    /// 2. After any successful in-band execution, every holding is in band or no worse (SPEC A18).
    function invariant_2_inBandOrNoWorse() public view {
        assertFalse(handler.bandViolation());
    }

    /// 3. No call from the manager address reduces any member's units.
    function invariant_3_managerNeverReducesUnits() public view {
        assertFalse(handler.managerReducedUnits());
    }

    /// 4. A-Token leaves Plenum only to an allowlisted adapter or a verified address.
    function invariant_4_noValueToUnverifiedOrUnknown() public view {
        assertEq(aToken.balanceOf(handler.evil()), 0);
        assertEq(aToken.balanceOf(handler.stranger()), 0);
        assertEq(aToken.balanceOf(manager), 0);
    }

    /// 5. NAV report timestamps strictly increase.
    function invariant_5_navTimestampsIncrease() public view {
        assertFalse(handler.navWentBackwards());
    }

    /// 6. While paused, every ManagerGateway write reverts.
    function invariant_6_pausedManagerCannotWrite() public view {
        assertFalse(handler.pausedWriteSucceeded());
    }

    /// 7. Contribute then immediately redeem never returns more than was contributed.
    function invariant_7_noRoundTripProfit() public view {
        assertFalse(handler.roundTripProfit());
    }
}
