//SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

interface ITypedNFT {
    function transferFrom(
        address from,
        address to,
        uint256 tokenId
    ) external;
    function getTokenType(uint256 _tokenId) external view returns (uint256);
}