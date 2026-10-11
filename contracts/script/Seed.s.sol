// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {MockUSD} from "../src/mocks/MockUSD.sol";

/// @notice Prepares demo members' passkey accounts: mints MOCK test dollars and sends testnet MON for gas
///         (Mera accounts are plain EOAs). Membership itself comes from signed invites in the app.
/// @dev Env: DEPLOYER_PRIVATE_KEY, DEMO_MEMBER_ADDRESSES (comma-separated), SEED_USD (whole dollars, default 5000),
///      SEED_GAS_WEI (default 0.5 MON).
contract Seed is Script {
    uint256 constant ANVIL_KEY_0 = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;

    function run() external {
        require(block.chainid == 10143 || block.chainid == 31337, "Monad testnet or local only");
        string memory json =
            vm.readFile(string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".json"));
        MockUSD usd = MockUSD(vm.parseJsonAddress(json, ".asset"));

        address[] memory members = vm.envAddress("DEMO_MEMBER_ADDRESSES", ",");
        uint256 amount = vm.envOr("SEED_USD", uint256(5_000)) * 1e6;
        uint256 gasWei = vm.envOr("SEED_GAS_WEI", uint256(0.5 ether));

        vm.startBroadcast(vm.envOr("DEPLOYER_PRIVATE_KEY", ANVIL_KEY_0));
        for (uint256 i; i < members.length; ++i) {
            usd.mint(members[i], amount);
            if (members[i].balance < gasWei) {
                (bool ok,) = members[i].call{value: gasWei - members[i].balance}("");
                require(ok, "gas top-up failed");
            }
            console.log("seeded", members[i]);
        }
        vm.stopBroadcast();
    }
}
