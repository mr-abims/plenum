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
import {MockUSD} from "../../src/mocks/MockUSD.sol";
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
    MockUSD usd;
    MockTBillVault tbill;
    MockCreditVault credit;
    address public manager;
    address public manager2 = makeAddr("manager2");
    address public originalManager;
    address public treasury;
    address fallbackWriter;
    address[] public actors;
    uint256[] pks;
    address[3] adapters;
    address public evil = makeAddr("evilAdapter");
    address public payee = makeAddr("outsidePayee"); // a member may redeem to any address

    // Ghosts: each stays false unless an invariant is broken.
    bool public bandViolation; // 2
    bool public managerReducedUnits; // 3
    bool public navWentBackwards; // 5
    bool public pausedWriteSucceeded; // 6
    bool public roundTripProfit; // 7
    bool public treasuryOverpaid; // 8
    uint256 nonce = 1000;
    uint64 public lastNavTs;
    uint256 public okExecutions;

    constructor(
        Plenum plenum_,
        ManagerGateway gw_,
        Governance gov_,
        NavOracle oracle_,
        MockUSD usd_,
        address[3] memory adapters_,
        address manager_,
        address fallbackWriter_,
        address[] memory actors_,
        uint256[] memory pks_
    ) {
        plenum = plenum_;
        mandate = Mandate(plenum_.mandate());
        gw = gw_;
        gov = gov_;
        oracle = oracle_;
        usd = usd_;
        adapters = adapters_;
        tbill = MockTBillVault(adapters_[0]);
        credit = MockCreditVault(adapters_[1]);
        manager = manager_;
        originalManager = manager_;
        fallbackWriter = fallbackWriter_;
        actors = actors_;
        pks = pks_;
        treasury = plenum_.treasury();
    }

    // ------------------------------------------------------------- members

    function contribute(uint256 who, uint256 amount) external {
        address a = actors[who % actors.length];
        amount = bound(amount, 1, 50_000 * USD);
        vm.prank(a);
        try plenum.contribute(amount) {} catch {}
    }

    function redeem(uint256 who, uint256 frac, bool toPayee) external {
        address a = actors[who % actors.length];
        uint256 units = plenum.unitsOf(a) * bound(frac, 1, 100) / 100;
        if (units == 0) return;
        uint256 feeBps = mandate.exitFeeBps();
        uint256 t0 = usd.balanceOf(treasury);
        vm.prank(a);
        try plenum.redeem(units, toPayee ? payee : a) returns (uint256 out) {
            _checkTreasury(t0, out, feeBps);
        } catch {}
    }

    /// Leave (paying any breaking fee), then rejoin on an invite from a remaining member.
    function leaveAndRejoin(uint256 who) external {
        uint256 i = who % actors.length;
        address a = actors[i];
        if (!plenum.isMember(a)) return;
        uint256 feeBps = mandate.exitFeeBps();
        uint256 t0 = usd.balanceOf(treasury);
        vm.prank(a);
        try plenum.leave(a) returns (uint256 out) {
            _checkTreasury(t0, out, feeBps);
        } catch {
            return;
        }
        for (uint256 k; k < actors.length; ++k) {
            if (!plenum.isMember(actors[k])) continue;
            uint64 expiry = uint64(block.timestamp + 1 days);
            (uint8 v, bytes32 r, bytes32 s_) = vm.sign(pks[k], plenum.inviteDigest(a, ++nonce, expiry));
            vm.prank(a);
            try plenum.join(abi.encode(a, nonce, expiry, abi.encodePacked(r, s_, v)), bytes32(0)) {} catch {}
            return;
        }
    }

    /// Members change the fee and period by unanimous vote, wait out the timelock and apply.
    function changeRules(uint256 feeSeed, uint256 periodSeed) external {
        MandateConfig memory c = mandate.config();
        c.earlyExitFeeBps = uint16(bound(feeSeed, 0, 1000));
        c.periodLength = uint32(bound(periodSeed, 2 hours, 2 days));
        c.exitWindow = c.periodLength / 4;
        address proposer = _anyMember();
        if (proposer == address(0)) return;
        vm.prank(proposer);
        uint256 id = gov.proposeMandateChange(c, keccak256("rules"));
        _approveAll(id);
        try gov.executeProposal(id) {} catch {}
        vm.warp(block.timestamp + c.timelock);
        try mandate.applyChange() {} catch {}
        postNav();
    }

    /// Members swap the manager key back and forth; the fuzzer keeps acting as whoever holds it.
    function replaceManager() external {
        address next = gw.manager() == manager2 ? originalManager : manager2;
        address proposer = _anyMember();
        if (proposer == address(0)) return;
        vm.prank(proposer);
        uint256 id = gov.proposeManagerReplacement(next, keccak256("swap"));
        _approveAll(id);
        try gov.executeProposal(id) {
            manager = next;
        } catch {}
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
        uint256 t0 = usd.balanceOf(treasury);

        vm.prank(manager);
        try gw.executeInBand(acts, keccak256("memo"), bytes32("qwen3.8-max")) returns (Reason r) {
            if (wasPaused) pausedWriteSucceeded = true;
            if (r == Reason.OK) {
                ++okExecutions;
                _checkNoWorse(cashPre, pre, total);
            }
        } catch {}
        _checkUnits(unitsBefore);
        if (usd.balanceOf(treasury) != t0) treasuryOverpaid = true; // only exits pay the treasury
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
        usd.mint(address(this), amount);
        if (useCredit) {
            usd.approve(address(credit), amount);
            credit.accrue(address(plenum), amount);
        } else {
            usd.approve(address(tbill), amount);
            tbill.accrue(amount);
        }
    }

    // ------------------------------------------------------------- helpers

    /// Invariant 8: an exit sends the treasury at most the breaking fee: with payout `out` and rate f, the fee is
    /// f/(1-f) of the payout (2 wei of rounding tolerance); nothing when the exit is free.
    function _checkTreasury(uint256 before, uint256 out, uint256 feeBps) internal {
        uint256 got = usd.balanceOf(treasury) - before;
        if (got * (BPS - feeBps) > out * feeBps + 2 * BPS) treasuryOverpaid = true;
    }

    function _anyMember() internal view returns (address) {
        for (uint256 i; i < actors.length; ++i) {
            if (plenum.isMember(actors[i])) return actors[i];
        }
        return address(0);
    }

    function _approveAll(uint256 id) internal {
        for (uint256 i; i < actors.length; ++i) {
            if (!plenum.isMember(actors[i])) continue;
            vm.prank(actors[i]);
            try gov.approve(id) {} catch {}
        }
    }

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
        // Short periods so the fuzzer crosses free-exit windows and pays breaking fees (SPEC A26).
        MandateConfig memory c = balanced();
        c.periodLength = 1 days;
        c.exitWindow = 2 hours;
        c.earlyExitFeeBps = 200;
        c.timelock = 1 hours;
        vm.prank(ana);
        plenum = Plenum(factory.createPlenum("Fuzz club", 1, c, manager));
        mandate = Mandate(plenum.mandate());
        governance = plenum.governance();
        gateway = plenum.gateway();
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
            usd,
            [address(tbill), address(credit), address(gold)],
            manager,
            fallbackWriter,
            actors,
            _pks()
        );
        usd.grantRole(usd.MINTER_ROLE(), address(handler));
        targetContract(address(handler));
    }

    function _pks() internal view returns (uint256[] memory k) {
        k = new uint256[](3);
        (k[0], k[1], k[2]) = (anaPk, jonasPk, weiPk);
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

    /// 4. The settlement asset never reaches an unknown adapter or the manager (SPEC A25).
    function invariant_4_noValueToUnknownOrManager() public view {
        assertEq(usd.balanceOf(handler.evil()), 0);
        assertEq(usd.balanceOf(manager), 0);
        assertEq(usd.balanceOf(handler.manager2()), 0); // a replacement manager is caged the same way
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

    /// 8. The treasury only ever receives breaking fees from member exits, never more than the fee rate, and never
    ///    anything from a manager action (SPEC A26).
    function invariant_8_treasuryOnlyGetsExitFees() public view {
        assertFalse(handler.treasuryOverpaid());
    }
}
