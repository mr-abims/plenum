// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/// @title MockUSD — MOCK
/// @notice MOCK test dollar used as Plenum's settlement asset on testnet: a plain 6-decimal ERC-20 that a
///         MINTER_ROLE holder (the deployer, the testnet onboarding faucet) can mint. It has no value.
contract MockUSD is ERC20, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    constructor() ERC20("MOCK US Dollar", "mUSD") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice MOCK faucet for demo balances. Minter only.
    function mint(address to, uint256 amount) external onlyRole(MINTER_ROLE) {
        _mint(to, amount);
    }
}
