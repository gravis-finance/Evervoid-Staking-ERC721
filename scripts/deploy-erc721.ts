import hre, { ethers, network, upgrades } from "hardhat";

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/*async function sendTx(title: string, func: any, args: any) {
    console.log(title, '..', args.length && args || '');
    const tx = await func(...args);
    console.log(title, 'at', tx.hash);
    const res = await tx.wait();
    console.log(title, 'done');
    return res;
}*/


async function main() {
    const StakingFactory = await ethers.getContractFactory(
        "ERC721Staking"
    );

    const constructorArgs: [string] = [process.env.FUEL_ADDRESS!];

    // const staking = StakingFactory.attach(process.env.STAKING!);
    const staking = await upgrades.deployProxy(
        StakingFactory,
        constructorArgs
    );
    await staking.deployed();

    console.log("GravisStaking (proxy) deployed to:", staking.address);

    if (network.name !== "localhost" && network.name !== "hardhat") {
        console.log("Sleeping before verification...");
        await sleep(20000);

        await hre.run("verify:verify", {
            address: staking.address,
            constructorArguments: constructorArgs,
        });
    }

    /*const token_contract = await ethers.getContractFactory('MintableToken');
    const token = await token_contract.attach(process.env.FUEL_ADDRESS!);

    await sendTx('Token: grantRole', token.grantRole, [
        await token.MINTER_ROLE(),
        staking.address,
    ]);

    await sendTx('Staking: setRewardPerYearPerToken', staking.setRewardPerYearPerToken, [
        process.env.COLLECTIBLE_STAKING_ADDRESS!,
        3,
        process.env.LOCK_PERIOD!,
    ]);

    const erc721_contract = await ethers.getContractFactory('MintableERC721AutoId');
    const erc721 = await erc721_contract.attach(process.env.COLLECTIBLE_STAKING_ADDRESS!);

    await sendTx('ERC721: approve', erc721.approve, [
        staking.address,
        1,
    ]);

    await sendTx('Staking: stake', staking.stake, [
        process.env.COLLECTIBLE_STAKING_ADDRESS!,
        1,
    ]);*/

    // await sendTx('Staking: claimReward', staking.claimReward, []);
    // await sendTx('Staking: unstake', staking.unstake, []);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
    console.error(error.error || error);
    process.exitCode = 1;
});
