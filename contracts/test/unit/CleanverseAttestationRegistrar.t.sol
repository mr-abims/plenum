// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Fixture} from "../utils/Fixture.sol";
import {IPlenum} from "../../src/interfaces/IPlenum.sol";
import {Reason} from "../../src/interfaces/Types.sol";
import {CleanverseAttestationRegistrar} from "../../src/compliance/CleanverseAttestationRegistrar.sol";

contract CleanverseAttestationRegistrarTest is Fixture {
    CleanverseAttestationRegistrar registrar;
    uint256 attesterPk = 0xC1EA;
    address attester;
    address priya = makeAddr("priya");

    function setUp() public override {
        super.setUp();
        attester = vm.addr(attesterPk);
        registrar = new CleanverseAttestationRegistrar(identity, attester, address(this));
        identity.transferOwnership(address(registrar)); // the registrar becomes the only writer
    }

    function _att(address subject, bool verified, uint64 issuedAt, uint64 expiresAt_, uint256 nonce)
        internal
        view
        returns (CleanverseAttestationRegistrar.Attestation memory a, bytes memory sig)
    {
        a = CleanverseAttestationRegistrar.Attestation({
            subject: subject,
            verified: verified,
            tier: 2,
            country: bytes2("CA"),
            issuedAt: issuedAt,
            expiresAt: expiresAt_,
            nonce: nonce
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(attesterPk, registrar.digest(a));
        sig = abi.encodePacked(r, s, v);
    }

    function _now() internal view returns (uint64) {
        return uint64(block.timestamp);
    }

    function test_validAttestationVerifies() public {
        (CleanverseAttestationRegistrar.Attestation memory a, bytes memory sig) =
            _att(priya, true, _now(), _now() + 365 days, 1);
        vm.prank(stranger); // anyone can relay
        registrar.submit(a, sig);
        assertTrue(identity.isVerified(priya));
        assertEq(identity.tier(priya), 2);
        assertEq(identity.country(priya), bytes2("CA"));
    }

    function test_operatorCanNoLongerSetIdentitiesDirectly() public {
        vm.expectRevert(); // OwnableUnauthorizedAccount: the deployer lost direct control
        identity.setIdentity(priya, true, 1, bytes2(0));
    }

    function test_rejectsWrongSigner() public {
        CleanverseAttestationRegistrar.Attestation memory a = CleanverseAttestationRegistrar.Attestation({
            subject: priya,
            verified: true,
            tier: 1,
            country: bytes2(0),
            issuedAt: _now(),
            expiresAt: _now() + 1 days,
            nonce: 1
        });
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(anaPk, registrar.digest(a)); // not the Cleanverse signer
        vm.expectRevert(CleanverseAttestationRegistrar.BadSignature.selector);
        registrar.submit(a, abi.encodePacked(r, s, v));
    }

    function test_rejectsTamperedFields() public {
        (CleanverseAttestationRegistrar.Attestation memory a, bytes memory sig) =
            _att(priya, true, _now(), _now() + 1 days, 1);
        a.tier = 3; // changed after signing
        vm.expectRevert(CleanverseAttestationRegistrar.BadSignature.selector);
        registrar.submit(a, sig);
    }

    function test_rejectsReplay() public {
        (CleanverseAttestationRegistrar.Attestation memory a, bytes memory sig) =
            _att(priya, true, _now(), _now() + 1 days, 7);
        registrar.submit(a, sig);
        vm.expectRevert(abi.encodeWithSelector(CleanverseAttestationRegistrar.NonceUsed.selector, 7));
        registrar.submit(a, sig);
    }

    function test_olderAttestationCannotOverrideNewer() public {
        (CleanverseAttestationRegistrar.Attestation memory revoke, bytes memory s1) =
            _att(priya, false, _now(), _now() + 1 days, 2);
        (CleanverseAttestationRegistrar.Attestation memory older, bytes memory s2) =
            _att(priya, true, _now() - 1, _now() + 1 days, 3);
        registrar.submit(revoke, s1);
        vm.expectRevert(
            abi.encodeWithSelector(CleanverseAttestationRegistrar.StaleAttestation.selector, _now() - 1, _now())
        );
        registrar.submit(older, s2);
        assertFalse(identity.isVerified(priya));
    }

    function test_newerAttestationRevokes() public {
        (CleanverseAttestationRegistrar.Attestation memory a, bytes memory s1) =
            _att(priya, true, _now(), _now() + 1 days, 1);
        registrar.submit(a, s1);
        vm.warp(block.timestamp + 10);
        (CleanverseAttestationRegistrar.Attestation memory r, bytes memory s2) =
            _att(priya, false, _now(), _now() + 1 days, 2);
        registrar.submit(r, s2);
        assertFalse(identity.isVerified(priya));
    }

    function test_rejectsExpiredOrFuture() public {
        (CleanverseAttestationRegistrar.Attestation memory expired, bytes memory s1) =
            _att(priya, true, _now() - 10, _now(), 1);
        vm.expectRevert(abi.encodeWithSelector(CleanverseAttestationRegistrar.AttestationExpired.selector, _now()));
        registrar.submit(expired, s1);
        (CleanverseAttestationRegistrar.Attestation memory future, bytes memory s2) =
            _att(priya, true, _now() + 60, _now() + 1 days, 2);
        vm.expectRevert(abi.encodeWithSelector(CleanverseAttestationRegistrar.NotYetValid.selector, _now() + 60));
        registrar.submit(future, s2);
    }

    function test_anyoneCanExpireAfterExpiry() public {
        (CleanverseAttestationRegistrar.Attestation memory a, bytes memory sig) =
            _att(priya, true, _now(), _now() + 1 days, 1);
        registrar.submit(a, sig);
        vm.expectRevert(abi.encodeWithSelector(CleanverseAttestationRegistrar.NotExpired.selector, _now() + 1 days));
        registrar.expire(priya);
        vm.warp(block.timestamp + 1 days);
        vm.prank(stranger);
        registrar.expire(priya);
        assertFalse(identity.isVerified(priya));
    }

    function test_setSignerOnlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert();
        registrar.setSigner(stranger);
        address cleanverse = makeAddr("cleanverseSigner");
        registrar.setSigner(cleanverse);
        assertEq(registrar.signer(), cleanverse);
        (CleanverseAttestationRegistrar.Attestation memory a, bytes memory sig) =
            _att(priya, true, _now(), _now() + 1 days, 1);
        vm.expectRevert(CleanverseAttestationRegistrar.BadSignature.selector); // old MOCK key no longer accepted
        registrar.submit(a, sig);
    }

    /// End to end: an attested member joins and contributes; when the attestation expires, money stops moving.
    function test_expiryGatesAssetMovement() public {
        (CleanverseAttestationRegistrar.Attestation memory a, bytes memory sig) =
            _att(priya, true, _now(), _now() + 1 days, 1);
        registrar.submit(a, sig);
        bytes memory inv = _invite(anaPk, priya, 99, uint64(block.timestamp + 1 days));
        vm.prank(priya);
        plenum.join(inv, bytes32(0));
        _join(ana, 1);
        aToken.mint(priya, 100 * USD);
        vm.prank(priya);
        aToken.approve(address(plenum), type(uint256).max);
        vm.prank(priya);
        plenum.contribute(50 * USD);

        vm.warp(block.timestamp + 1 days);
        registrar.expire(priya);
        vm.expectEmit(address(plenum));
        emit IPlenum.ComplianceRefused(priya, Reason.MEMBER_NOT_VERIFIED);
        vm.prank(priya);
        assertEq(plenum.contribute(10 * USD), 0);
    }
}
