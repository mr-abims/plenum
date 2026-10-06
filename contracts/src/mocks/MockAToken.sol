// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IIdentityProvider} from "../interfaces/IIdentityProvider.sol";
import {NotImplemented} from "../interfaces/Types.sol";

/// @title MockAToken — MOCK
/// @notice MOCK verified-USD settlement asset with Cleanverse A-Token semantics (amendment A9): tokens move only
///         between verified identities or contracts registered via `registerApass` by a REGISTER_ROLE holder
///         (PlenumFactory registers each new Plenum). 6 decimals.
/// @dev Session 0 stub: transfer gating and minting are implemented in Session 1.
contract MockAToken is ERC20, AccessControl {
    bytes32 public constant REGISTER_ROLE = keccak256("REGISTER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    IIdentityProvider public immutable identity;
    mapping(address => bool) public registered;

    event ApassRegistered(address indexed pool);

    constructor(IIdentityProvider identity_) ERC20("MOCK Verified USD", "mvUSD") {
        identity = identity_;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice MOCK of Cleanverse's `registerApass(pool, aToken)`: allow contract `pool` to hold this token.
    function registerApass(address) external view onlyRole(REGISTER_ROLE) {
        revert NotImplemented();
    }

    /// @notice MOCK faucet for demo balances; recipient must be verified. Minter only.
    function mint(address, uint256) external view onlyRole(MINTER_ROLE) {
        revert NotImplemented();
    }
}
