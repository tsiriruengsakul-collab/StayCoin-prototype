// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @notice One unit is one seasonal night. The marketplace alone issues and consumes units.
contract HappyPassToken is ERC20 {
    address private immutable marketplace = msg.sender;
    uint256 public immutable seasonEnd;

    constructor(uint256 end) ERC20("Happy Pass", "HAPPY") {
        seasonEnd = end;
    }

    function decimals() public pure override returns (uint8) { return 0; }

    function issue(address guest) external {
        require(msg.sender == marketplace, "Only marketplace");
        _mint(guest, 1);
    }

    function consume(address guest) external {
        require(msg.sender == marketplace, "Only marketplace");
        _burn(guest, 1);
    }

    function _update(address from, address to, uint256 amount) internal override {
        require(from == address(0) || to == address(0) || block.timestamp < seasonEnd, "Pass expired");
        super._update(from, to, amount);
    }
}
