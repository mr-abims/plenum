// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";

import {Action, MandateConfig, Op} from "../../src/interfaces/Types.sol";
import {Plenum} from "../../src/core/Plenum.sol";
import {Mandate} from "../../src/core/Mandate.sol";
import {Governance} from "../../src/core/Governance.sol";
import {ManagerGateway} from "../../src/core/ManagerGateway.sol";
import {NavOracle} from "../../src/core/NavOracle.sol";
import {ConsentRegistry} from "../../src/core/ConsentRegistry.sol";
import {PlenumFactory} from "../../src/core/PlenumFactory.sol";
import {MockUSD} from "../../src/mocks/MockUSD.sol";
import {MockTBillVault} from "../../src/adapters/MockTBillVault.sol";
import {MockCreditVault} from "../../src/adapters/MockCreditVault.sol";
import {MockGold} from "../../src/adapters/MockGold.sol";

/// @notice Shared deployment: MOCK test dollar, shared singletons, three MOCK adapters, a factory,
///         and one Balanced plenum organised by Ana.
abstract contract Fixture is Test {
    address constant MOCK_FORWARDER = 0xB9F79d863261869B234c481D1f9A7af84AeAd192;
    uint256 constant USD = 1e6;

    address fallbackWriter = makeAddr("fallbackWriter");
    address manager = makeAddr("manager");

    uint256 anaPk = 0xA11A;
    uint256 jonasPk = 0xB0B;
    uint256 weiPk = 0xC0C;
    address ana;
    address jonas;
    address wei_;
    address stranger = makeAddr("stranger"); // never invited

    MockUSD usd;
    NavOracle oracle;
    ConsentRegistry consent;
    PlenumFactory factory;
    MockTBillVault tbill;
    MockCreditVault credit;
    MockGold gold;

    Plenum plenum;
    Mandate mandate;
    address governance;
    address gateway;

    function setUp() public virtual {
        vm.warp(1_760_000_000);
        ana = vm.addr(anaPk);
        jonas = vm.addr(jonasPk);
        wei_ = vm.addr(weiPk);

        usd = new MockUSD();
        oracle = new NavOracle(MOCK_FORWARDER, fallbackWriter);
        consent = new ConsentRegistry();
        tbill = new MockTBillVault(usd);
        credit = new MockCreditVault(address(usd), 1 hours);
        gold = new MockGold(address(usd), 2_400 * USD, MOCK_FORWARDER);
        factory = new PlenumFactory(
            PlenumFactory.Deps({
                plenumImpl: address(new Plenum()),
                mandateImpl: address(new Mandate()),
                governanceImpl: address(new Governance()),
                gatewayImpl: address(new ManagerGateway()),
                asset: address(usd),
                navOracle: address(oracle),
                consentRegistry: address(consent)
            })
        );

        usd.grantRole(usd.MINTER_ROLE(), address(this));

        vm.prank(ana);
        plenum = Plenum(factory.createPlenum("Club", 1, balanced(), manager));
        mandate = Mandate(plenum.mandate());
        governance = plenum.governance();
        gateway = plenum.gateway();
    }

    // ---------------------------------------------------------------- helpers

    function _fund(address who, uint256 amount) internal {
        usd.mint(who, amount);
        vm.prank(who);
        usd.approve(address(plenum), type(uint256).max);
    }

    function _invite(uint256 signerPk, address invitee, uint256 nonce, uint64 expiry)
        internal
        view
        returns (bytes memory)
    {
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(signerPk, plenum.inviteDigest(invitee, nonce, expiry));
        return abi.encode(invitee, nonce, expiry, abi.encodePacked(r, s, v));
    }

    function _join(address who, uint256 nonce) internal {
        bytes memory inv = _invite(anaPk, who, nonce, uint64(block.timestamp + 1 days));
        vm.prank(who);
        plenum.join(inv, keccak256(abi.encode("x25519", who)));
    }

    function _postNav(uint256 nav) internal {
        vm.warp(block.timestamp + 1);
        vm.prank(fallbackWriter);
        oracle.fallbackWrite(address(plenum), nav);
    }

    function _execute(Action[] memory actions) internal {
        vm.prank(gateway);
        plenum.execute(actions);
    }

    function _one(address adapter, Op op, uint256 assets) internal pure returns (Action[] memory a) {
        a = new Action[](1);
        a[0] = Action({adapter: adapter, op: op, assets: assets});
    }

    function _two(address a1, Op op1, uint256 x1, address a2, Op op2, uint256 x2)
        internal
        pure
        returns (Action[] memory a)
    {
        a = new Action[](2);
        a[0] = Action({adapter: a1, op: op1, assets: x1});
        a[1] = Action({adapter: a2, op: op2, assets: x2});
    }

    /// @dev Ana joins and contributes `total`, then the plenum is allocated exactly at Balanced targets
    ///      (45 / 20 / 15 / cash 20) and a fresh NAV is posted.
    function _seedBalanced(uint256 total) internal {
        if (!plenum.isMember(ana)) _join(ana, 1);
        _fund(ana, total);
        vm.prank(ana);
        plenum.contribute(total);
        Action[] memory a = new Action[](3);
        a[0] = Action({adapter: address(tbill), op: Op.Deposit, assets: total * 45 / 100});
        a[1] = Action({adapter: address(credit), op: Op.Deposit, assets: total * 20 / 100});
        a[2] = Action({adapter: address(gold), op: Op.Deposit, assets: total * 15 / 100});
        _execute(a);
        _postNav(total);
    }

    /// @dev Balanced template (SPEC §12).
    function balanced() internal view returns (MandateConfig memory c) {
        c.adapters = new address[](3);
        c.adapters[0] = address(tbill);
        c.adapters[1] = address(credit);
        c.adapters[2] = address(gold);
        c.targetBps = new uint16[](3);
        c.targetBps[0] = 4500;
        c.targetBps[1] = 2000;
        c.targetBps[2] = 1500;
        c.bandBps = new uint16[](3);
        c.bandBps[0] = 500;
        c.bandBps[1] = 300;
        c.bandBps[2] = 300;
        c.minLiquidityBps = 2000;
        c.maxTradeBps = 1000;
        c.maxDailyTurnoverBps = 2500;
        c.navMaxAge = 15 minutes;
        c.cooldown = 1 minutes;
        c.maxMembers = 99;
        c.escalateQuorumBps = 5000;
        c.mandateChangeBps = 6667;
        c.timelock = 48 hours;
        c.pauseQuorum = 2;
        c.votingPeriod = 48 hours;
    }
}
