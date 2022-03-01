//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.9;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeCastUpgradeable.sol";
import "./interfaces/IMintableToken.sol";
import "./interfaces/IERC721.sol";

contract ERC721Staking is OwnableUpgradeable {
    using SafeCastUpgradeable for uint256;
    using SafeCastUpgradeable for int256;

    uint256 private constant MAGNITUDE = 2**128;

    IMintableToken public rewardToken;

    struct TokenTypeInfo {
        address token;
        uint256 magnifiedRewardPerSecondPerToken;
        uint256 magnifiedRewardPerShare;
        uint256 lastRewardDistribution;
        uint256 totalStaked;
        uint256 lockPeriod;
        mapping(address => uint256) stakeOf;
        mapping(address => uint256) lockOf;
        mapping(address => int256) magnifiedRewardCorrections;
        mapping(address => uint256) withdrawnRewardOf;
    }

    mapping(uint256 => TokenTypeInfo) private typeInfo;

    mapping(address => uint256) private typeOrder;

    uint256 private nextOrder;

    struct StakedToken {
        address token;
        uint256 tokenId;
    }

    mapping(address => StakedToken[]) private stakedTokens;

    // CONSTRUCTOR

    function initialize(IMintableToken rewardToken_) external initializer {
        __Ownable_init();
        
        rewardToken = rewardToken_;
    }

    // PUBLIC FUNCTIONS

    function stake(address token, uint256 tokenId) external {
        TokenTypeInfo storage info = typeInfo[typeOrder[token] - 1];
        require(info.magnifiedRewardPerSecondPerToken != 0, "No staking for this type");

        _distributeReward(info);

        IERC721(token).transferFrom(msg.sender, address(this), tokenId);

        if (info.stakeOf[msg.sender] == 0) {
            info.lockOf[msg.sender] = block.timestamp + info.lockPeriod;
        }

        info.totalStaked++;
        info.stakeOf[msg.sender]++;
        info.magnifiedRewardCorrections[msg.sender] -= info.magnifiedRewardPerShare.toInt256();

        stakedTokens[msg.sender].push(StakedToken({
            token: token,
            tokenId: tokenId
        }));
    }

    function stakeBatch(address token, uint256[] memory tokenIds) external {
        TokenTypeInfo storage info = typeInfo[typeOrder[token] - 1];
        require(info.magnifiedRewardPerSecondPerToken != 0, "No staking for this token");

        _distributeReward(info);
        IERC721 erc721 = IERC721(token);

        for (uint256 i; i < tokenIds.length; i++) {
            erc721.transferFrom(msg.sender, address(this), tokenIds[i]);
            stakedTokens[msg.sender].push(StakedToken({
                token: token,
                tokenId: tokenIds[i]
            }));
        }

        if (info.stakeOf[msg.sender] == 0) {
            info.lockOf[msg.sender] = block.timestamp + info.lockPeriod;
        }

        info.totalStaked+= tokenIds.length;
        info.stakeOf[msg.sender]+= tokenIds.length;
        info.magnifiedRewardCorrections[msg.sender]-= (info.magnifiedRewardPerShare * tokenIds.length).toInt256();
    }

    function unstake() external {
        while(stakedTokens[msg.sender].length > 0) {
            StakedToken memory staked = stakedTokens[msg.sender][stakedTokens[msg.sender].length - 1];
            _unstakeToken(staked.token, staked.tokenId);
        }

        claimReward();
    }

    function claimReward() public {
        uint256 totalReward;
        for (uint256 i = 0; i < nextOrder; i++) {
            TokenTypeInfo storage info = typeInfo[i];
            _distributeReward(info);
            uint256 reward = _storedRewardOf(info, msg.sender);
            info.withdrawnRewardOf[msg.sender] += reward;
            totalReward += reward;
        }
        rewardToken.mint(msg.sender, totalReward);
    }

    // RESTRICTED FUNCTIONS

    function setRewardPerYearPerToken(address token, uint256 rewardPerYear, uint256 lockPeriod_)
        external
        onlyOwner
    {
        if (typeOrder[token] != 0) {
            TokenTypeInfo storage info = typeInfo[typeOrder[token] - 1];
            _distributeReward(info);
            info.magnifiedRewardPerSecondPerToken = rewardPerYear * MAGNITUDE / (365 days);
            info.lockPeriod = lockPeriod_;
        } else {
            nextOrder++;
            typeOrder[token] = nextOrder;
            typeInfo[nextOrder - 1].token = token;
            typeInfo[nextOrder - 1].magnifiedRewardPerSecondPerToken = rewardPerYear * MAGNITUDE / (365 days);
            typeInfo[nextOrder - 1].lastRewardDistribution = block.timestamp;
            typeInfo[nextOrder - 1].lockPeriod = lockPeriod_;
        }
    }

    // VIEW FUNCTIONS

    function stakeInfoOf(address account, address token) external view returns (uint256 stakeOf, uint256 lockOf, uint256 withdrawnRewardOf) {
        uint256 orderType = typeOrder[token] - 1;

        stakeOf = typeInfo[orderType].stakeOf[account];
        lockOf = typeInfo[orderType].lockOf[account];
        withdrawnRewardOf = typeInfo[orderType].withdrawnRewardOf[account];
    }

    function rewardPerYearPerToken(address token) external view returns (uint256) {
        return typeInfo[typeOrder[token] - 1].magnifiedRewardPerSecondPerToken * (365 days) / MAGNITUDE;
    }

    function stakedTokensOf(address account) external view returns (StakedToken[] memory) {
        return stakedTokens[account];
    }

    function rewardOf(address account) public view returns (uint256) {
        uint256 totalReward;
        for (uint256 i = 0; i < nextOrder; i++) {
            TokenTypeInfo storage info = typeInfo[i];

            uint256 currentRewardPerShare = (info.magnifiedRewardPerShare
                + info.magnifiedRewardPerSecondPerToken * (block.timestamp - info.lastRewardDistribution)
            );
            uint256 accumulatedReward = ((
                (currentRewardPerShare * info.stakeOf[account]).toInt256()
            ) + info.magnifiedRewardCorrections[account]).toUint256() / MAGNITUDE;
            totalReward += (accumulatedReward - info.withdrawnRewardOf[account]);
        }
        return totalReward;
    }

    function _storedRewardOf(TokenTypeInfo storage info, address account) private view returns (uint256) {
        uint256 accumulatedReward = ((
            (info.magnifiedRewardPerShare * info.stakeOf[account]).toInt256()
        ) + info.magnifiedRewardCorrections[account]).toUint256() / MAGNITUDE;
        return accumulatedReward - info.withdrawnRewardOf[account];
    }

    // INTERNAL FUNCTIONS

    function _unstakeToken(address token, uint256 tokenId) private {
        TokenTypeInfo storage info = typeInfo[typeOrder[token] - 1];

        if (block.timestamp > info.lockOf[msg.sender]) {
            _distributeReward(info);

            IERC721(token).transferFrom(address(this), msg.sender, tokenId);

            info.totalStaked--;
            info.stakeOf[msg.sender]--;
            info.magnifiedRewardCorrections[msg.sender] += info.magnifiedRewardPerShare.toInt256();

            stakedTokens[msg.sender].pop();
        }
    }

    function _distributeReward(TokenTypeInfo storage info) private {
        if (block.timestamp > info.lastRewardDistribution) {
            info.magnifiedRewardPerShare +=
                    info.magnifiedRewardPerSecondPerToken *
                        (block.timestamp - info.lastRewardDistribution);
            info.lastRewardDistribution = block.timestamp;
        }
    }
}
