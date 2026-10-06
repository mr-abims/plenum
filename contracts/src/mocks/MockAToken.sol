// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IIdentityProvider} from "../interfaces/IIdentityProvider.sol";

/// @title MockAToken — MOCK
/// @notice MOCK verified-USD settlement asset with Cleanverse A-Token semantics (SPEC A9): tokens move only
///         between verified identities or contracts registered via `registerApass` by a REGISTER_ROLE holder
///         (PlenumFactory registers each new Plenum; adapters are registered at deploy). 6 decimals.
contract MockAToken is ERC20, AccessControl {
    bytes32 public constant REGISTER_ROLE = keccak256("REGISTER_ROLE");
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    IIdentityProvider public immutable identity;
    mapping(address => bool) public registered;

    event ApassRegistered(address indexed pool);

    /// @notice A transfer touched an account that is neither verified nor a registered contract.
    error NotEligible(address account);

    constructor(IIdentityProvider identity_) ERC20("MOCK Verified USD", "mvUSD") {
        identity = identity_;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice True when `account` may hold or move this token.
    function isEligible(address account) public view returns (bool) {
        return registered[account] || identity.isVerified(account);
    }

    /// @notice MOCK of Cleanverse's `registerApass(pool, aToken)`: allow contract `pool` to hold this token.
    function registerApass(address pool) external onlyRole(REGISTER_ROLE) {
        registered[pool] = true;
        emit ApassRegistered(pool);
    }

    /// @notice MOCK faucet for demo balances; recipient must be eligible. Minter only.
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }

    /// @dev Every mint, transfer and burn checks the non-zero parties.
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && !isEligible(from)) revert NotEligible(from);
        if (to != address(0) && !isEligible(to)) revert NotEligible(to);
        super._update(from, to, value);
    }
}
