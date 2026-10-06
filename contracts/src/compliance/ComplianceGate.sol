// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IComplianceGate} from "../interfaces/IComplianceGate.sol";
import {IIdentityProvider} from "../interfaces/IIdentityProvider.sol";
import {NotImplemented, Reason} from "../interfaces/Types.sol";

/// @title ComplianceGate
/// @notice Shared check that every member, contributor and payee is a verified identity. Called by Plenum,
///         Governance and PlenumFactory. Provider is pluggable (Cleanverse A-Pass, or a labelled MOCK).
/// @dev Session 0 stub.
contract ComplianceGate is IComplianceGate {
    IIdentityProvider public immutable identity;

    constructor(IIdentityProvider identity_) {
        identity = identity_;
    }

    /// @inheritdoc IComplianceGate
    function checkMember(address) external pure returns (Reason) {
        revert NotImplemented();
    }

    /// @inheritdoc IComplianceGate
    function checkPayee(address) external pure returns (Reason) {
        revert NotImplemented();
    }

    /// @inheritdoc IComplianceGate
    function requireMember(address) external pure {
        revert NotImplemented();
    }

    /// @inheritdoc IComplianceGate
    function requirePayee(address) external pure {
        revert NotImplemented();
    }
}
