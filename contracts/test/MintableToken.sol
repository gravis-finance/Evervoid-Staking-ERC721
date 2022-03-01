//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/presets/ERC20PresetMinterPauser.sol";

contract MintableToken is ERC20PresetMinterPauser {
    constructor() ERC20PresetMinterPauser("Token", "TKN") {}
}
