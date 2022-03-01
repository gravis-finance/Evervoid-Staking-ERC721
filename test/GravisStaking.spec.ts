import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { GravisStaking, MintableToken } from "../typechain";
import {
    increaseTime,
    mineBlock,
    startMining,
    stopMining,
} from "./shared/utils";

const parseUnits = ethers.utils.parseUnits;

const YEAR = 365 * 24 * 60 * 60;
const LOCK_PERIOD = 60 * 60; // 1 hour

describe("Test Gravis Staking", function () {
    let owner: SignerWithAddress, other: SignerWithAddress;
    let grvx: MintableToken, fuel: MintableToken, staking: GravisStaking;
    let fuelPerSecond: BigNumber;

    this.beforeEach(async function () {
        [owner, other] = await ethers.getSigners();

        const MintableTokenFactory = await ethers.getContractFactory(
            "MintableToken"
        );
        grvx = await MintableTokenFactory.deploy();
        fuel = await MintableTokenFactory.deploy();

        const GravisStakingFactory = await ethers.getContractFactory(
            "GravisStaking"
        );
        staking = await GravisStakingFactory.deploy(
            grvx.address,
            fuel.address,
            0,
            parseUnits("1"),
            LOCK_PERIOD
        );
        fuelPerSecond = await staking.fuelPerGrvxPerSecond();

        await fuel.grantRole(await fuel.MINTER_ROLE(), staking.address);

        await grvx.mint(owner.address, parseUnits("1000"));
        await grvx.approve(staking.address, parseUnits("10000"));
        await grvx.mint(other.address, parseUnits("1000"));
        await grvx.connect(other).approve(staking.address, parseUnits("10000"));
    });

    it("Can't deploy with wrong start, can deploy with right start", async function () {
        const block = await ethers.provider.getBlock(
            await ethers.provider.getBlockNumber()
        );

        const GravisStakingFactory = await ethers.getContractFactory(
            "GravisStaking"
        );
        await expect(
            GravisStakingFactory.deploy(
                grvx.address,
                fuel.address,
                block.timestamp,
                parseUnits("1"),
                LOCK_PERIOD
            )
        ).to.be.revertedWith("Reward start too early");

        await GravisStakingFactory.deploy(
            grvx.address,
            fuel.address,
            block.timestamp + 10,
            parseUnits("1"),
            LOCK_PERIOD
        );
    });

    it("Can't stake without approval", async function () {
        await grvx.approve(staking.address, 0);

        await expect(staking.stake(parseUnits("10"))).to.be.revertedWith(
            "ERC20: transfer amount exceeds allowance"
        );
    });

    it("Can't stake more than balance", async function () {
        await expect(staking.stake(parseUnits("2000"))).to.be.revertedWith(
            "ERC20: transfer amount exceeds balance"
        );
    });

    it("Can stake correct amount", async function () {
        await staking.stake(parseUnits("100"));

        expect(await staking.stakeOf(owner.address)).to.equal(
            parseUnits("100")
        );
        expect(await grvx.balanceOf(owner.address)).to.equal(parseUnits("900"));
        expect(await grvx.balanceOf(staking.address)).to.equal(
            parseUnits("100")
        );
    });

    it("Can't unstake more than user's stake", async function () {
        await staking.stake(parseUnits("100"));

        await expect(staking.unstake(parseUnits("200"))).to.be.revertedWith(
            "VM Exception while processing transaction: reverted with panic code 0x11 (Arithmetic operation underflowed or overflowed outside of an unchecked block)"
        );
    });

    it("Can unstake correct amount", async function () {
        await staking.stake(parseUnits("100"));
        await staking.unstake(parseUnits("50"));

        expect(await staking.stakeOf(owner.address)).to.equal(parseUnits("50"));
        expect(await grvx.balanceOf(owner.address)).to.equal(parseUnits("950"));
        expect(await grvx.balanceOf(staking.address)).to.equal(
            parseUnits("50")
        );
    });

    it("Current reward works corect", async function () {
        const tx = await staking.stake(parseUnits("100"));
        const initialBlock = await ethers.provider.getBlock(tx.blockNumber!);
        expect(await staking.lastRewardDistribution()).to.equal(
            initialBlock.timestamp
        );

        await increaseTime(1000);

        let currentBlock = await ethers.provider.getBlock(
            await ethers.provider.getBlockNumber()
        );
        expect(await staking.rewardOf(owner.address)).to.equal(
            parseUnits("100")
                .mul(fuelPerSecond)
                .div(parseUnits("1"))
                .mul(currentBlock.timestamp - initialBlock.timestamp)
                .sub(1)
        );

        const tx2 = await staking.connect(other).stake(parseUnits("100"));
        const nextBlock = await ethers.provider.getBlock(tx2.blockNumber!);
        expect(await staking.lastRewardDistribution()).to.equal(
            nextBlock.timestamp
        );

        await increaseTime(1000);

        const previousReward = parseUnits("100")
            .mul(fuelPerSecond)
            .div(parseUnits("1"))
            .mul(nextBlock.timestamp - initialBlock.timestamp)
            .sub(1);
        currentBlock = await ethers.provider.getBlock(
            await ethers.provider.getBlockNumber()
        );
        expect(await staking.rewardOf(owner.address)).to.equal(
            previousReward.add(
                parseUnits("100")
                    .mul(fuelPerSecond)
                    .div(parseUnits("1"))
                    .mul(currentBlock.timestamp - nextBlock.timestamp)
            )
        );
        expect(await staking.rewardOf(other.address)).to.equal(
            parseUnits("100")
                .mul(fuelPerSecond)
                .div(parseUnits("1"))
                .mul(currentBlock.timestamp - nextBlock.timestamp)
                .sub(1)
        );
    });

    it("Claiming rewards work correct", async function () {
        await stopMining();
        const tx1 = await staking.stake(parseUnits("100"));
        const tx2 = await staking.connect(other).stake(parseUnits("300"));
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
            parseUnits("100")
                .mul(fuelPerSecond)
                .div(parseUnits("1"))
                .mul(currentBlock.timestamp - initialBlock.timestamp)
                .sub(1)
        );
        expect(await staking.rewardOf(other.address)).to.equal(
            parseUnits("300")
                .mul(fuelPerSecond)
                .div(parseUnits("1"))
                .mul(currentBlock.timestamp - initialBlock.timestamp)
                .sub(1)
        );

        const tx3 = await staking.claimReward();
        const claimBlock = await ethers.provider.getBlock(tx3.blockNumber!);
        expect(await fuel.balanceOf(owner.address)).to.equal(
            parseUnits("100")
                .mul(fuelPerSecond)
                .div(parseUnits("1"))
                .mul(claimBlock.timestamp - initialBlock.timestamp)
                .sub(1)
        );
        expect(await staking.rewardOf(owner.address)).to.equal(0);

        const tx4 = await staking.connect(other).claimReward();
        const nextClaimBlock = await ethers.provider.getBlock(tx4.blockNumber!);
        expect(await fuel.balanceOf(other.address)).to.equal(
            parseUnits("300")
                .mul(fuelPerSecond)
                .div(parseUnits("1"))
                .mul(nextClaimBlock.timestamp - initialBlock.timestamp)
                .sub(1)
        );
        expect(await staking.rewardOf(other.address)).to.equal(0);

        const tx5 = await staking.stake(parseUnits("200"));
        const stakeBlock = await ethers.provider.getBlock(tx5.blockNumber!);

        currentBlock = await ethers.provider.getBlock(
            await ethers.provider.getBlockNumber()
        );
        expect(await staking.rewardOf(owner.address)).to.equal(
            parseUnits("100")
                .mul(fuelPerSecond)
                .div(parseUnits("1"))
                .mul(stakeBlock.timestamp - claimBlock.timestamp)
                .add(
                    parseUnits("300")
                        .mul(fuelPerSecond)
                        .div(parseUnits("1"))
                        .mul(currentBlock.timestamp - stakeBlock.timestamp)
                )
        );
        expect(await staking.rewardOf(other.address)).to.equal(
            parseUnits("300")
                .mul(fuelPerSecond)
                .div(parseUnits("1"))
                .mul(currentBlock.timestamp - nextClaimBlock.timestamp)
        );

        const previousFuel = await fuel.balanceOf(owner.address);
        const tx6 = await staking.claimReward();
        const lastClaimBlock = await ethers.provider.getBlock(tx6.blockNumber!);
        expect(await fuel.balanceOf(owner.address)).to.equal(
            previousFuel.add(
                parseUnits("100")
                    .mul(fuelPerSecond)
                    .div(parseUnits("1"))
                    .mul(stakeBlock.timestamp - claimBlock.timestamp)
                    .add(
                        parseUnits("300")
                            .mul(fuelPerSecond)
                            .div(parseUnits("1"))
                            .mul(
                                lastClaimBlock.timestamp - stakeBlock.timestamp
                            )
                    )
            )
        );
    });

    it("Owner and only owner can set fuel per GRVX per year", async function () {
        await expect(
            staking.connect(other).setFuelPerGrvxPerYear(parseUnits("2"))
        ).to.be.revertedWith("Ownable: caller is not the owner");

        await staking.setFuelPerGrvxPerYear(parseUnits("2"));
        expect(await staking.fuelPerGrvxPerSecond()).to.equal(
            parseUnits("2").div(YEAR)
        );
    });
});
