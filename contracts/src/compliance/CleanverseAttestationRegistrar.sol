// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {MockIdentityProvider} from "./MockIdentityProvider.sol";

/// @title CleanverseAttestationRegistrar
/// @notice Brings Cleanverse A-Pass verification onchain (SPEC A22). Cleanverse checks a person offchain and signs an
///         EIP-712 `Attestation`; anyone can submit it here, and only a signature from the registered Cleanverse signer
///         updates the identity that ComplianceGate and the A-Token read. This contract is the identity store's only
///         writer: no operator can mark someone verified without a valid attestation.
/// @dev Until Cleanverse issues a signer, `signer` is a labelled MOCK attester key; `setSigner` swaps in theirs.
///      Replay protection: single-use nonces and strictly increasing `issuedAt` per subject (a newer attestation with
///      `verified = false` revokes). `expire` lets anyone clear an identity once its attestation has expired.
contract CleanverseAttestationRegistrar is EIP712, Ownable {
    struct Attestation {
        address subject;
        bool verified;
        uint8 tier;
        bytes2 country; // ISO 3166-1 alpha-2, 0x0000 if not disclosed
        uint64 issuedAt;
        uint64 expiresAt;
        uint256 nonce;
    }

    bytes32 public constant ATTESTATION_TYPEHASH = keccak256(
        "Attestation(address subject,bool verified,uint8 tier,bytes2 country,uint64 issuedAt,uint64 expiresAt,uint256 nonce)"
    );

    MockIdentityProvider public immutable identity;
    address public signer;
    mapping(uint256 => bool) public nonceUsed;
    mapping(address => uint64) public lastIssuedAt;
    mapping(address => uint64) public expiresAt;

    event SignerSet(address indexed signer);
    event AttestationAccepted(
        address indexed subject,
        bool verified,
        uint8 tier,
        bytes2 country,
        uint64 issuedAt,
        uint64 expiresAt,
        address signer
    );
    event IdentityExpired(address indexed subject, uint64 expiredAt);

    error ZeroSigner();
    error BadSignature();
    error NonceUsed(uint256 nonce);
    error StaleAttestation(uint64 issuedAt, uint64 lastIssuedAt);
    error NotYetValid(uint64 issuedAt);
    error AttestationExpired(uint64 expiresAt);
    error NotExpired(uint64 expiresAt);

    constructor(MockIdentityProvider identity_, address signer_, address owner_)
        EIP712("Cleanverse Attestation Registrar", "1")
        Ownable(owner_)
    {
        if (signer_ == address(0)) revert ZeroSigner();
        identity = identity_;
        signer = signer_;
        emit SignerSet(signer_);
    }

    /// @notice Swap the attesting key (e.g. from the MOCK attester to Cleanverse's signer). Owner only.
    function setSigner(address signer_) external onlyOwner {
        if (signer_ == address(0)) revert ZeroSigner();
        signer = signer_;
        emit SignerSet(signer_);
    }

    /// @notice EIP-712 digest the Cleanverse signer signs for `a`.
    function digest(Attestation calldata a) public view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    ATTESTATION_TYPEHASH, a.subject, a.verified, a.tier, a.country, a.issuedAt, a.expiresAt, a.nonce
                )
            )
        );
    }

    /// @notice Submit a signed attestation. Anyone may relay it; only the registered signer's signature counts.
    function submit(Attestation calldata a, bytes calldata signature) external {
        if (!SignatureChecker.isValidSignatureNow(signer, digest(a), signature)) revert BadSignature();
        if (nonceUsed[a.nonce]) revert NonceUsed(a.nonce);
        if (a.issuedAt <= lastIssuedAt[a.subject]) revert StaleAttestation(a.issuedAt, lastIssuedAt[a.subject]);
        if (a.issuedAt > block.timestamp) revert NotYetValid(a.issuedAt);
        if (a.expiresAt <= block.timestamp) revert AttestationExpired(a.expiresAt);

        nonceUsed[a.nonce] = true;
        lastIssuedAt[a.subject] = a.issuedAt;
        expiresAt[a.subject] = a.expiresAt;
        identity.setIdentity(a.subject, a.verified, a.tier, a.country);
        emit AttestationAccepted(a.subject, a.verified, a.tier, a.country, a.issuedAt, a.expiresAt, signer);
    }

    /// @notice Clear `subject`'s identity once its latest attestation has expired. Anyone may call.
    function expire(address subject) external {
        uint64 exp = expiresAt[subject];
        if (exp == 0 || block.timestamp < exp) revert NotExpired(exp);
        expiresAt[subject] = 0;
        identity.setIdentity(subject, false, 0, bytes2(0));
        emit IdentityExpired(subject, exp);
    }
}
