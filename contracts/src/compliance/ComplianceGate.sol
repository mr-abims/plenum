// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IComplianceGate} from "../interfaces/IComplianceGate.sol";
import {IIdentityProvider} from "../interfaces/IIdentityProvider.sol";
import {PolicyViolation, Reason} from "../interfaces/Types.sol";

/// @title ComplianceGate
/// @notice Shared check that every member, contributor and payee is a verified identity. Called by Plenum,
///         Governance and PlenumFactory. Provider is pluggable (Cleanverse A-Pass, or a labelled MOCK).
/// @dev Jurisdiction rules (PS-4) are stretch; JURISDICTION_BLOCKED is not returned yet.
contract ComplianceGate is IComplianceGate {
    IIdentityProvider public immutable identity;

    constructor(IIdentityProvider identity_) {
        identity = identity_;
    }

    /// @inheritdoc IComplianceGate
    function checkMember(address account) public view returns (Reason) {
        return identity.isVerified(account) ? Reason.OK : Reason.MEMBER_NOT_VERIFIED;
    }

    /// @inheritdoc IComplianceGate
    function checkPayee(address account) public view returns (Reason) {
        return identity.isVerified(account) ? Reason.OK : Reason.PAYEE_NOT_VERIFIED;
    }

    /// @inheritdoc IComplianceGate
    function requireMember(address account) external view {
        Reason r = checkMember(account);
        if (r != Reason.OK) revert PolicyViolation(r);
    }

    /// @inheritdoc IComplianceGate
    function requirePayee(address account) external view {
        Reason r = checkPayee(account);
        if (r != Reason.OK) revert PolicyViolation(r);
    }
}
