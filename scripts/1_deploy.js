const fs = require('fs')

const hre = require("hardhat");
const ethers = hre.ethers
const provider = ethers.provider

const { decimals, readlineUtils, txUtils } = require('../utils/')
const { getFunctionsForContract, getFunctionDefinitionsFromAbi } = txUtils
const { getAnswer } = readlineUtils
const { d } = decimals

const bsovAddress = '0x26946adA5eCb57f3A1F91605050Ce45c482C9Eb1'
const bsovAbi = require('../utils/bsovAbi.json')
const bsovWhale = '0x4051963047353936096E1D4092D48e1b7386e4DE'
const bsovWhale2 = '0x047714E2E6c2386e92f7e15a48Fa900e51Cb19d6'
const bsovWhale3 = '0x13Fc4Bb93d54e6Ed4cf531D8836cA39162A51284'


const timelockContract2Abi = require('../utils/timelockContract2.json')
const timelockReserveRewardsAbi = require('../utils/timelockReserveRewards.json')

const getFunds = async (whale, owner) => {
  const bsovContract = new ethers.Contract(bsovAddress, bsovAbi, provider)
  const bsovDecimals = parseInt(await bsovContract.decimals())
  const whaleBalance = await bsovContract.balanceOf(whale)
  if (Number(d(whaleBalance.toString(), bsovDecimals)) < 10000) {
    console.log('Needs a new whale address.')
    process.exit()
  }
  try {
    await owner.sendTransaction({ to: whale, value: ethers.parseUnits('10.0', 'ether') })
  } catch (error) {
    console.log('Couldnt send eth.', error)
  }
  const bsovWhaleSigner = await ethers.getImpersonatedSigner(whale)
  const tx = await bsovContract.connect(bsovWhaleSigner).transfer(owner.address, whaleBalance)
  const receipt = await tx.wait()
}

const run = async () => {

  const network = process.env.HARDHAT_NETWORK;
  if (typeof (network) === 'undefined') {
    console.log("Try: npx hardhat run --network <network> filepath");
    process.exit(1);
  }

  if (network !== 'hardhat' && network !== 'mainnet' && network !== 'goerli' && network !== 'sepolia') {
    console.log("Unsupported Network");
    process.exit(1);
  }

  const [owner, user1, user2, user3] = await ethers.getSigners()
  await getFunds(bsovWhale, owner)
  await getFunds(bsovWhale2, owner)
  await getFunds(bsovWhale3, owner)

  const bsovContract = new ethers.Contract(bsovAddress, bsovAbi, provider)
  const bsovDecimals = parseInt(await bsovContract.decimals())

  const bsovBalance = await bsovContract.balanceOf(owner.address)
  if (Number(d(bsovBalance.toString(), bsovDecimals)) < 500000) {
    console.log('Needs more BSOV to perform tests.')
    process.exit()
  }

  await bsovContract.connect(owner).transfer(user1.address, 250000 * 10 ** 8)
  await bsovContract.connect(owner).transfer(user2.address, 250000 * 10 ** 8)

  console.log('Transferred ' + d(bsovBalance, bsovDecimals) + ' BSOV from whale wallets.')

  console.log("The current deployer address is: " + owner.address)

  const exists = await fs.existsSync(__dirname + '/' + network)
  if (!exists) {
    console.log('Cannot find the directory to store the contract address at: ' + __dirname + '/' + network)
    process.exit()
  }

  const balance = await ethers.provider.getBalance(owner.address)
  if (Number(balance) < 100) {
    console.log('ETH Balance for ' + owner.address + ' is insufficient: ' + Number(balance))
    process.exit(1)
  }

  

  const parameters1 = [bsovAddress]
  const Contract1 = await hre.ethers.getContractFactory("TimelockContract2")
  const timelockContract2 = await Contract1.deploy(...parameters1)
  const timelockContract2Address = timelockContract2.target
  await fs.writeFileSync(__dirname + '/' + network + '/TimelockContract2.json', JSON.stringify({ contract: timelockContract2Address }, null, 4))
  console.log("TimelockContract2 deployed to: " + timelockContract2Address + ' on ' + network)

  const parameters = [timelockContract2Address, bsovAddress]
  const Contract = await hre.ethers.getContractFactory("TimelockRewardsReserve")
  const timelockRewardsReserveContract = await Contract.deploy(...parameters)
  const timelockRewardsReserveContractAddress = timelockRewardsReserveContract.target
  await fs.writeFileSync(__dirname + '/' + network + '/TimelockRewardsReserve.json', JSON.stringify({ contract: timelockRewardsReserveContractAddress }, null, 4))
  console.log("TimelockRewardsReserve deployed to: " + timelockRewardsReserveContractAddress + ' on ' + network)

  // Initialize the first contract with the second address
  console.log('Init')
  const init = await timelockContract2.setTimelockRewardReserveAddress(timelockRewardsReserveContractAddress)
  // const init2 = await timelockContract2.setTimelockRewardReserveAddress(timelockRewardsReserveContractAddress)

  // A couple users locks his stuff in the contract
  const sendToLockA = 101000 * 10 ** 8 // just below max in a tx
  console.log('Step 1')
  const step1 = await bsovContract.connect(user1).approveAndCall(timelockContract2Address, sendToLockA, '0x')
  
  const sendToLockB = 60000 * 10 ** 8 // blast thresh by a little
  console.log('Step 1')
  const step2 = await bsovContract.connect(user2).approveAndCall(timelockContract2Address, sendToLockB, '0x')

  const sendToLockC = 1000 * 10 ** 8 // blast thresh by a little
  console.log('Step 1')
  const step3 = await bsovContract.connect(user1).approveAndCall(timelockContract2Address, sendToLockC, '0x')

  const sent = sendToLockA + sendToLockB + sendToLockC
  console.log('total sent:', sent)

  const ea1 = await timelockRewardsReserveContract.eligibleAmount(user1.address)
  console.log('ea1', ea1)

  const ea2 = await timelockRewardsReserveContract.eligibleAmount(user2.address)
  console.log('ea2', ea2)

  const rewardsFunctions = await getFunctionDefinitionsFromAbi(timelockReserveRewardsAbi, ethers)
  // console.log(rewardsFunctions)
  
  const currentTier = await timelockRewardsReserveContract.currentTier()
  // console.log('tier:', currentTier)

  const tiers = await timelockRewardsReserveContract.tiers(2)
  // console.log('tiers:', tiers)

  const timelockFunctions = await getFunctionDefinitionsFromAbi(timelockContract2Abi, ethers)
  // console.log(timelockFunctions)

}

  ; (async () => {

    if (Number(process.version.split('.')[0].replace('v', '')) < 20) {
      console.log('this requires node v20. exiting')
      process.exit(3)
    }
    if (ethers.version < 6) {
      console.log('Upgrade to ethers 6. exiting.')
      process.exit(4)
    }

    try {
      await run()
    } catch (error) {
      console.log(error)
      process.exit(1)
    }
    process.exit(0)
  })()