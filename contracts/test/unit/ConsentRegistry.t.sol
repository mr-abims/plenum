// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Fixture} from "../utils/Fixture.sol";
import {Unauthorized} from "../../src/interfaces/Types.sol";
import {IConsentRegistry} from "../../src/interfaces/IConsentRegistry.sol";
import {ConsentRegistry} from "../../src/core/ConsentRegistry.sol";

contract ConsentRegistryTest is Fixture {
    bytes32 constant SCOPE = keccak256("risk-questionnaire");

    function test_grantIsActiveUntilExpiry() public {
        uint64 expiry = uint64(block.timestamp + 24 hours);
        vm.expectEmit(address(consent));
        emit IConsentRegistry.ConsentGranted(1, ana, manager, SCOPE, expiry);
        vm.prank(ana);
        uint256 id = consent.grant(manager, SCOPE, expiry);
        assertTrue(consent.isActive(id));
        assertEq(consent.grantIdsOf(ana).length, 1);
        assertEq(consent.grantIdsOf(ana)[0], id);
        vm.warp(expiry); // RT-7: expired consent
        assertFalse(consent.isActive(id));
    }

    function test_revokeByMemberOnly() public {
        vm.prank(ana);
        uint256 id = consent.grant(manager, SCOPE, uint64(block.timestamp + 1 hours));
        vm.prank(manager);
        vm.expectRevert(abi.encodeWithSelector(Unauthorized.selector, manager));
        consent.revoke(id);
        vm.expectEmit(address(consent));
        emit IConsentRegistry.ConsentRevoked(id);
        vm.prank(ana);
        consent.revoke(id);
        assertFalse(consent.isActive(id));
    }

    function test_rejectsBadInput() public {
        vm.startPrank(ana);
        vm.expectRevert(abi.encodeWithSelector(ConsentRegistry.ExpiryInPast.selector, uint64(block.timestamp)));
        consent.grant(manager, SCOPE, uint64(block.timestamp));
        vm.expectRevert(ConsentRegistry.ZeroGrantee.selector);
        consent.grant(address(0), SCOPE, uint64(block.timestamp + 1));
        vm.expectRevert(abi.encodeWithSelector(ConsentRegistry.UnknownGrant.selector, 42));
        consent.revoke(42);
        vm.stopPrank();
        assertFalse(consent.isActive(42));
    }
}
