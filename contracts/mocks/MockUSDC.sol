// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @notice Mock USDC for testing and Sepolia demo.
 *         Anyone can mint up to 10_000 per call (faucet-like for demo).
 */
contract MockUSDC is ERC20 {
    uint8 private constant _DECIMALS = 6;
    uint256 public constant FAUCET_AMOUNT = 10_000 * 10 ** _DECIMALS;

    constructor() ERC20("Mock USDC", "mUSDC") {}

    function decimals() public pure override returns (uint8) {
        return _DECIMALS;
    }

    /// @notice Public faucet for demo — mints 10,000 mUSDC to caller.
    function faucet() external {
        _mint(msg.sender, FAUCET_AMOUNT);
    }

    /// @notice For test setup.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
