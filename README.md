# Gravis Evervoid Staking ERC721

This contract provides ERC721 (AutoID) token standards stacking for an award in ERC20 tokens.
ERC721 Stacking URL: https://evervo.id/resources/t01-staking?network=56

## Deployment And Configuration

### Compile

Copy `.env.example` to a new file called `.env` and fill the values in it.

```
npx hardhat compile
```

### Test

```
npx hardhat test
```

### Deploy Collectible Staking

Copy file `example.env` to `.env` and replace empty address variables with correct values. Then run:

```
npx hardhat run scripts/deploy-collectible.ts --network [Your Network]
```

### Upgrade Collectible Staking

Copy file `example.env` to `.env` and replace empty address variables with correct values. Then run:

```
npx hardhat run scripts/upgrade-collectible.ts --network [Your Network]
```

### Configure Collectible Staking

Copy file `example.env` to `.env` and replace empty address variables with correct values. Run:

```
npx hardhat console --network [Your Network]
```

Hardhat console will open. Inside it run (placing real address where needed):

```
const staking = await ethers.getContractAt("CollectibleStaking", process.env.COLLECTIBLE_STAKING)
```

Then execute configuration functions as follows:

```
await staking.setRewardPerYearPerToken("address", "reward per year")
```


## Collectible Staking

This contracts allows users to stake GravisCollectible tokens and receiver ERC20 rewards;

### Stake

This function is used to stake NFT to contract. Approval for staked token should be given in prior.

```jsx
function stake(address token, uint256 tokenId)
```

**Parameters**

-   address token - address of the staked token contract
-   uint256 tokenId - ID of the staked token

### Unstake

This function is used to unstake all previously staked tokens. Collects reward as side effect.

```jsx
function unstake()
```

### Claim Reward

This function is used to claim accumulated reward of the user.

```jsx
function claimReward()
```

### Reward Of

This view function returns current reward amount for a given user.

```jsx
function rewardOf(address account) public view returns (uint256)
```

**Parameters**

-   address account - address to get reward for

### Staked Token Of

This view function returns list of staked tokens for a given address

```jsx
function stakedTokensOf(address account) public view returns (StakedToken[] memory)
```

**Parameters**

-   address account - address to get staked tokens for

**Return**

List of _StakedToken_ objects, each one consisting of:

-   token - address of the staked token contract
-   tokenId - ID of the staked token

### Set Reward Per Year Per Token

This function sets amount of fuel given per year for one staked token of selected type. Can only be called by owner.

```jsx
function setRewardPerYearPerToken(
    address token, uint256 rewardPerYear
) external onlyOwner
```

**Parameters**

-   address token - address of the token contract
-   uint256 rewardPerYear - amount of FUEL (as wei) given for staking one token of this type per year

**Warning**

Due to internal contract logic (reward are stored on per-second basis) actual value of reward given per token per year can slightly differ from the one provided at the moment of setting.
