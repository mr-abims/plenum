// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Reason} from "./Types.sol";

/// @title IComplianceGate
/// @notice Shared wrapper around the identity provider: member, payee and (stretch) jurisdiction rules.
interface IComplianceGate {
    /// @notice OK, MEMBER_NOT_VERIFIED or JURISDICTION_BLOCKED for a would-be member or contributor.
    function checkMember(address account) external view returns (Reason);

    /// @notice OK, PAYEE_NOT_VERIFIED or JURISDICTION_BLOCKED for a payee.
    function checkPayee(address account) external view returns (Reason);

    /// @notice Reverting form of checkMember.
    function requireMember(address account) external view;

    /// @notice Reverting form of checkPayee.
    function requirePayee(address account) external view;
}
