// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/// @notice Educational test units with no monetary value.
contract MockTHB is ERC20, Ownable {
    constructor() ERC20("Mock Thai Baht", "MockTHB") Ownable(msg.sender) {}

    function decimals() public pure override returns (uint8) {
        return 2;
    }

    function mint(address recipient, uint256 satang) external onlyOwner {
        _mint(recipient, satang);
    }
}
