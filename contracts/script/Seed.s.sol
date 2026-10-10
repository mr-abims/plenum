// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console} from "forge-std/Script.sol";
import {MockAToken} from "../src/mocks/MockAToken.sol";
import {CleanverseAttestationRegistrar} from "../src/compliance/CleanverseAttestationRegistrar.sol";

/// @notice Prepares demo members' passkey accounts: verifies each address through a signed Cleanverse attestation
///         (MOCK attester key until Cleanverse issues a signer), mints MOCK mvUSD and sends testnet MON for gas
///         (Mera accounts are plain EOAs).
/// @dev Env: DEPLOYER_PRIVATE_KEY, CLEANVERSE_ATTESTER_KEY, DEMO_MEMBER_ADDRESSES (comma-separated), optional
///      DEMO_MEMBER_COUNTRIES (comma-separated ISO codes, same order), SEED_MVUSD (whole dollars, default 5000),
///      SEED_GAS_WEI (default 0.5 MON), ATTESTATION_DAYS (default 365).
contract Seed is Script {
    uint256 constant ANVIL_KEY_0 = 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80;
    uint256 constant ANVIL_KEY_4 = 0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a;

    function run() external {
        require(block.chainid == 10143 || block.chainid == 31337, "Monad testnet or local only");
        string memory json =
            vm.readFile(string.concat(vm.projectRoot(), "/deployments/", vm.toString(block.chainid), ".json"));
        CleanverseAttestationRegistrar registrar =
            CleanverseAttestationRegistrar(vm.parseJsonAddress(json, ".attestationRegistrar"));
        MockAToken aToken = MockAToken(vm.parseJsonAddress(json, ".aToken"));

        address[] memory members = vm.envAddress("DEMO_MEMBER_ADDRESSES", ",");
        string[] memory countries = vm.envOr("DEMO_MEMBER_COUNTRIES", ",", new string[](0));
        uint256 mvusd = vm.envOr("SEED_MVUSD", uint256(5_000)) * 1e6;
        uint256 gasWei = vm.envOr("SEED_GAS_WEI", uint256(0.5 ether));
        uint256 attesterPk = vm.envOr("CLEANVERSE_ATTESTER_KEY", ANVIL_KEY_4);
        uint64 validFor = uint64(vm.envOr("ATTESTATION_DAYS", uint256(365)) * 1 days);

        vm.startBroadcast(vm.envOr("DEPLOYER_PRIVATE_KEY", ANVIL_KEY_0));
        for (uint256 i; i < members.length; ++i) {
            _attest(
                registrar,
                attesterPk,
                members[i],
                i < countries.length ? bytes2(bytes(countries[i])) : bytes2(0),
                validFor
            );
            aToken.mint(members[i], mvusd);
            if (members[i].balance < gasWei) {
                (bool ok,) = members[i].call{value: gasWei - members[i].balance}("");
                require(ok, "gas top-up failed");
            }
            console.log("seeded", members[i]);
        }
        vm.stopBroadcast();
    }

    /// @dev Signs as the (MOCK) Cleanverse attester and relays the attestation.
    function _attest(
        CleanverseAttestationRegistrar registrar,
        uint256 attesterPk,
        address member,
        bytes2 country,
        uint64 validFor
    ) internal {
        CleanverseAttestationRegistrar.Attestation memory a = CleanverseAttestationRegistrar.Attestation({
            subject: member,
            verified: true,
            tier: 1,
            country: country,
            issuedAt: uint64(block.timestamp) - 1,
            expiresAt: uint64(block.timestamp) + validFor,
            nonce: uint256(keccak256(abi.encode(member, block.timestamp, block.chainid)))
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(attesterPk, registrar.digest(a));
        registrar.submit(a, abi.encodePacked(r, s, v));
    }
}
