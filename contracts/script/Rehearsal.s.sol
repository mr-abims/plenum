// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {Action, Op} from "../src/interfaces/Types.sol";
import {Plenum} from "../src/core/Plenum.sol";
import {Governance} from "../src/core/Governance.sol";
import {NavOracle} from "../src/core/NavOracle.sol";
import {PlenumFactory} from "../src/core/PlenumFactory.sol";
import {MockUSD} from "../src/mocks/MockUSD.sol";
import {Templates} from "./Templates.sol";

/// @notice Rehearsal plenum for the agent and CRE before the app exists: the deployer organises a Balanced plenum
///         (demo timing), joins, contributes, and the members (just the deployer) approve the initial allocation
///         as a governance proposal. A FALLBACK NAV is posted so execution can proceed; CRE takes over afterwards.
/// @dev Env: DEPLOYER_PRIVATE_KEY, FALLBACK_NAV_WRITER_KEY, MANAGER_OPERATOR_KEY, REHEARSAL_USD (default 10000).
contract Rehearsal is Script {
    uint256 constant ANVIL_KEY_0 = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    uint256 constant ANVIL_KEY_1 = 0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d;
    uint256 constant ANVIL_KEY_2 = 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a;

    struct Ctx {
        string path;
        PlenumFactory factory;
        NavOracle oracle;
        MockUSD usd;
        address tbill;
        address credit;
        address gold;
        uint256 pk;
        uint256 total;
    }

    function run() external {
        require(block.chainid == 10143 || block.chainid == 31337, "Monad testnet or local only");
        Ctx memory c = _load();
        Plenum plenum = _createJoinContribute(c);

        vm.startBroadcast(vm.envOr("FALLBACK_NAV_WRITER_KEY", ANVIL_KEY_1));
        c.oracle.fallbackWrite(address(plenum), c.total);
        vm.stopBroadcast();

        _allocate(c, plenum);
        vm.writeJson(vm.toString(address(plenum)), c.path, jsonKey());
        console.log(groupName(), address(plenum));
        console.log("Gateway", plenum.gateway());
    }

    /// @dev Hooks so variants (e.g. Showcase.s.sol) reuse the same setup.
    function groupName() internal view virtual returns (string memory) {
        return "Rehearsal Club";
    }

    function timing() internal pure virtual returns (Templates.Timing memory) {
        return Templates.demo();
    }

    function jsonKey() internal pure virtual returns (string memory) {
        return ".rehearsalPlenum";
    }

    function _load() internal view returns (Ctx memory c) {
        c.path = string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".json");
        string memory json = vm.readFile(c.path);
        c.factory = PlenumFactory(vm.parseJsonAddress(json, ".factory"));
        c.oracle = NavOracle(vm.parseJsonAddress(json, ".navOracle"));
        c.usd = MockUSD(vm.parseJsonAddress(json, ".asset"));
        c.tbill = vm.parseJsonAddress(json, ".tbillVault");
        c.credit = vm.parseJsonAddress(json, ".creditVault");
        c.gold = vm.parseJsonAddress(json, ".gold");
        c.pk = vm.envOr("DEPLOYER_PRIVATE_KEY", ANVIL_KEY_0);
        c.total = vm.envOr("REHEARSAL_USD", uint256(10_000)) * 1e6;
    }

    function _createJoinContribute(Ctx memory c) internal returns (Plenum plenum) {
        address organizer = vm.addr(c.pk);
        address manager = vm.addr(vm.envOr("MANAGER_OPERATOR_KEY", ANVIL_KEY_2));
        vm.startBroadcast(c.pk);
        plenum = Plenum(
            c.factory
                .createPlenum(
                    groupName(),
                    Templates.BALANCED,
                    Templates.build(Templates.BALANCED, c.tbill, c.credit, c.gold, timing()),
                    manager
                )
        );
        uint64 expiry = uint64(block.timestamp + 1 days);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(c.pk, plenum.inviteDigest(organizer, 1, expiry));
        plenum.join(abi.encode(organizer, uint256(1), expiry, abi.encodePacked(r, s, v)), bytes32(0));
        c.usd.mint(organizer, c.total);
        c.usd.approve(address(plenum), c.total);
        plenum.contribute(c.total);
        vm.stopBroadcast();
    }

    function _allocate(Ctx memory c, Plenum plenum) internal {
        Action[] memory alloc = new Action[](3);
        alloc[0] = Action({adapter: c.tbill, op: Op.Deposit, assets: c.total * 45 / 100});
        alloc[1] = Action({adapter: c.credit, op: Op.Deposit, assets: c.total * 20 / 100});
        alloc[2] = Action({adapter: c.gold, op: Op.Deposit, assets: c.total * 15 / 100});
        Governance gov = Governance(plenum.governance());
        vm.startBroadcast(c.pk);
        uint256 id = gov.propose(alloc, keccak256("initial allocation to Balanced targets"));
        gov.approve(id);
        gov.executeProposal(id);
        vm.stopBroadcast();
    }
}
