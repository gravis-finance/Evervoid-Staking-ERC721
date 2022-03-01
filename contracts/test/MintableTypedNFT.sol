//SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MintableTypedNFT is ERC721, Ownable {

    uint256 public types;
    
    uint256 private lastTokenId;
    mapping (uint256 => uint256) tokenTypes;

    constructor(uint256 types_) ERC721("NFT", "NFT") Ownable() {
        types = types_;
    }

    function mint(address _to, uint256 _type, uint256 _amount) external onlyOwner returns (uint256) {
        for (uint i = 0; i < _amount; i += 1) {
            lastTokenId++;
            _mint(_to, lastTokenId);
            tokenTypes[lastTokenId] = _type;
        }
        return lastTokenId + 1;
    }

    function getTokenType(uint256 _tokenId) public view returns (uint256) {
        if (_exists(_tokenId)) {
            return tokenTypes[_tokenId];
        } else {
            return type(uint256).max;
        }
    }

    function getTypeInfo(uint256 _typeId) public view returns (
        uint256 nominalPrice,
        uint256 capSupply,
        uint256 maxSupply,
        string memory info,
        address minterOnly,
        string memory uri
    ) {
        if (_typeId < types) {
            return (1, 1, 1, "s", address(0), "s");
        } else {
            return (0, 0, 0, "", address(0), "");
        }
    }

    function burn(uint256 tokenId) external {
        require(_isApprovedOrOwner(_msgSender(), tokenId), "Caller is not owner nor approved");
        _burn(tokenId);
    }
} 
