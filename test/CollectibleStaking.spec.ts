import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers, upgrades } from "hardhat";
import {
    CollectibleStaking,
    MintableToken,
    MintableTypedNFT,
} from "../typechain";
import {
    increaseTime,
    mineBlock,
    startMining,
    stopMining,
} from "./shared/utils";

const parseUnits = ethers.utils.parseUnits;
const { AddressZero } = ethers.constants;

const YEAR = 365 * 24 * 60 * 60;
const LOCK_PERIOD = 60 * 60; // 1 hour

describe("Test Collectible Staking", function () {
    let owner: SignerWithAddress, other: SignerWithAddress;
    let nft: MintableTypedNFT, fuel: MintableToken, staking: CollectibleStaking;

    this.beforeEach(async function () {
        [owner, other] = await ethers.getSigners();

        const MintableTokenFactory = await ethers.getContractFactory(
            "MintableToken"
        );
        fuel = await MintableTokenFactory.deploy();

        const CollectibleStakingFactory = await ethers.getContractFactory(
            "CollectibleStaking"
        );
        staking = (await upgrades.deployProxy(CollectibleStakingFactory, [
            fuel.address,
        ])) as CollectibleStaking;

        await fuel.grantRole(await fuel.MINTER_ROLE(), staking.address);

        const MintableTypedNFTFactory = await ethers.getContractFactory(
            "MintableTypedNFT"
        );
        nft = await MintableTypedNFTFactory.deploy(10);

        await staking.setRewardPerYearPerToken(
            nft.address,
            1,
            parseUnits("0.001").mul(365 * 24 * 60 * 60),
            LOCK_PERIOD
        );
        await staking.setRewardPerYearPerToken(
            nft.address,
            2,
            parseUnits("0.002").mul(365 * 24 * 60 * 60),
            LOCK_PERIOD
        );

        await nft.mint(owner.address, 1, 1);
        await nft.mint(owner.address, 2, 1);
        await nft.mint(other.address, 1, 1);

        await nft.setApprovalForAll(staking.address, true);
        await nft.connect(other).setApprovalForAll(staking.address, true);
    });

    it("Can't stake without approval", async function () {
        await nft.setApprovalForAll(staking.address, false);

        await expect(staking.stake(nft.address, 1)).to.be.revertedWith(
            "ERC721: transfer caller is not owner nor approved"
        );
    });

    it("Can't stake other's token", async function () {
        await expect(staking.stake(nft.address, 3)).to.be.revertedWith(
            "ERC721: transfer of token that is not own"
        );
    });

    it("Can stake valid token", async function () {
        await staking.stake(nft.address, 1);

        const tokens = await staking.stakedTokensOf(owner.address);
        expect(tokens.length).to.equal(1);
        expect(tokens[0].token).to.equal(nft.address);
        expect(tokens[0].tokenId).to.equal(1);
        expect(await nft.ownerOf(1)).to.equal(staking.address);
    });

    it("Can unstake valid", async function () {
        await staking.stake(nft.address, 1);
        await staking.unstake();

        const tokens = await staking.stakedTokensOf(owner.address);
        expect(tokens.length).to.equal(0);
        expect(await nft.ownerOf(1)).to.equal(owner.address);
    });

    it("Current reward works corect", async function () {
        const tx = await staking.stake(nft.address, 1);
        const initialBlock = await ethers.provider.getBlock(tx.blockNumber!);

        await increaseTime(1000);

        let currentBlock = await ethers.provider.getBlock(
            await ethers.provider.getBlockNumber()
        );
        expect(await staking.rewardOf(owner.address)).to.equal(
            parseUnits("0.001").mul(
                currentBlock.timestamp - initialBlock.timestamp
            )
        );

        const tx2 = await staking.connect(other).stake(nft.address, 3);
        const nextBlock = await ethers.provider.getBlock(tx2.blockNumber!);

        await increaseTime(1000);

        currentBlock = await ethers.provider.getBlock(
            await ethers.provider.getBlockNumber()
        );
        expect(await staking.rewardOf(owner.address)).to.equal(
            parseUnits("0.001").mul(
                currentBlock.timestamp - initialBlock.timestamp
            )
        );
        expect(await staking.rewardOf(other.address)).to.equal(
            parseUnits("0.001").mul(
                currentBlock.timestamp - nextBlock.timestamp
            )
        );
    });

    it("Claiming rewards work correct", async function () {
        await stopMining();
        const tx1 = await staking.stake(nft.address, 1);
        const tx2 = await staking.connect(other).stake(nft.address, 3);
        await startMining();
        await tx1.wait();
        const receipt = await tx2.wait();

        const initialBlock = await ethers.provider.getBlock(
            receipt.blockNumber
        );

        await increaseTime(1000);

        let currentBlock = await ethers.provider.getBlock(
            await ethers.provider.getBlockNumber()
        );
        expect(await staking.rewardOf(owner.address)).to.equal(
            parseUnits("0.001").mul(
                currentBlock.timestamp - initialBlock.timestamp
            )
        );
        expect(await staking.rewardOf(other.address)).to.equal(
            parseUnits("0.001").mul(
                currentBlock.timestamp - initialBlock.timestamp
            )
        );

        await increaseTime(700);

        const tx3 = await staking.claimReward();
        const claimBlock = await ethers.provider.getBlock(tx3.blockNumber!);
        expect(await fuel.balanceOf(owner.address)).to.equal(
            parseUnits("0.001").mul(
                claimBlock.timestamp - initialBlock.timestamp
            )
        );
        expect(await staking.rewardOf(owner.address)).to.equal(0);

        await increaseTime(1500);

        const tx4 = await staking.connect(other).claimReward();
        const nextClaimBlock = await ethers.provider.getBlock(tx4.blockNumber!);
        expect(await fuel.balanceOf(other.address)).to.equal(
            parseUnits("0.001").mul(
                nextClaimBlock.timestamp - initialBlock.timestamp
            )
        );
        expect(await staking.rewardOf(other.address)).to.equal(0);

        await increaseTime(400);

        const tx5 = await staking.stake(nft.address, 2);
        const stakeBlock = await ethers.provider.getBlock(tx5.blockNumber!);

        currentBlock = await ethers.provider.getBlock(
            await ethers.provider.getBlockNumber()
        );
        expect(await staking.rewardOf(owner.address)).to.equal(
            parseUnits("0.001")
                .mul(stakeBlock.timestamp - claimBlock.timestamp)
                .add(
                    parseUnits("0.003").mul(
                        currentBlock.timestamp - stakeBlock.timestamp
                    )
                )
        );
        expect(await staking.rewardOf(other.address)).to.equal(
            parseUnits("0.001").mul(
                currentBlock.timestamp - nextClaimBlock.timestamp
            )
        );

        await increaseTime(300);

        const previousFuel = await fuel.balanceOf(owner.address);
        const tx6 = await staking.claimReward();
        const lastClaimBlock = await ethers.provider.getBlock(tx6.blockNumber!);
        expect(await fuel.balanceOf(owner.address)).to.equal(
            previousFuel.add(
                parseUnits("0.001")
                    .mul(stakeBlock.timestamp - claimBlock.timestamp)
                    .add(
                        parseUnits("0.003").mul(
                            lastClaimBlock.timestamp - stakeBlock.timestamp
                        )
                    )
            )
        );
    });

    it("Owner and only owner can set reward per year per token", async function () {
        await expect(
            staking
                .connect(other)
                .setRewardPerYearPerToken(
                    nft.address,
                    3,
                    parseUnits("0.1"),
                    LOCK_PERIOD
                )
        ).to.be.revertedWith("Ownable: caller is not the owner");

        await staking.setRewardPerYearPerToken(
            nft.address,
            3,
            parseUnits("0.1").mul(365 * 24 * 60 * 60),
            LOCK_PERIOD
        );
        expect(await staking.rewardPerYearPerToken(nft.address, 3)).to.equal(
            parseUnits("0.1").mul(365 * 24 * 60 * 60)
        );
    });
});
