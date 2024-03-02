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
const bsovWhale4 = '0x5468bd200cd52405556223ec669D3f04e64465f8'
const bsovWhale5 = '0x894129246dE1963e14B39e06c24203FDb904EAB7'
const bsovWhale6 = '0x71fdc6E7C5b76ad7b927abF8B14b9417364Ec2A2'

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
  await getFunds(bsovWhale4, owner)
  await getFunds(bsovWhale5, owner)
  await getFunds(bsovWhale6, owner)

  const bsovContract = new ethers.Contract(bsovAddress, bsovAbi, provider)
  const bsovDecimals = parseInt(await bsovContract.decimals())

  const bsovBalance = await bsovContract.balanceOf(owner.address)
  if (Number(d(bsovBalance.toString(), bsovDecimals)) < 600000) {
    console.log('Needs more BSOV to perform tests.')
    process.exit()
  }

  await bsovContract.connect(owner).transfer(user1.address, 200000 * 10 ** 8)
  await bsovContract.connect(owner).transfer(user2.address, 100000 * 10 ** 8)

  console.log('Transferred ' + d(bsovBalance, bsovDecimals) + ' BSOV from whale wallets.')

  console.log("The current deployer address is: " + owner.address)
  console.log("User 1: " + user1.address)
  console.log("User 2: " + user2.address)
  console.log("User 3: " + user3.address)


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

  // owner seeds contract with 300k rewards tokens
  // the issue here is that since theres a tax the owner must send a percent more than expected to seed. 
  // then call contract calculating a lower number:
  // Recommend: this design has flaws and is not tight, consider redoing this:
  // 1 dont tax owner funds for seeding
  // 2 instead of using the same approve and call method maybe have a separate call for this
  const seedFund = 300000 * 10 ** 8 // just below max in a tx
  const seedFundPerc = 30303030303031
  console.log('Seed')

  // first the owner sends a percent to the contract for rewards
  await bsovContract.connect(owner).transfer(timelockRewardsReserveContractAddress, seedFundPerc)
  // then the owner timelocks the seed funds. 
  const seed = await timelockRewardsReserveContract.connect(owner).ownerTimelockTokens(seedFund, '0x')


  // A couple users locks his stuff in the contract
  const sendToLockA = 101000 * 10 ** 8 // just below max in a tx
  console.log('\nStep 1, user 1')
  const step1 = await bsovContract.connect(user1).approveAndCall(timelockContract2Address, sendToLockA, '0x')
  
  const sendToLockB = 60000 * 10 ** 8 // blast thresh by a little
  console.log('\nStep 1, user 2')
  const step2 = await bsovContract.connect(user2).approveAndCall(timelockContract2Address, sendToLockB, '0x')

  const sendToLockC = 1000 * 10 ** 8 // blast thresh by a little
  console.log('\nStep 1, user 1')
  const step3 = await bsovContract.connect(user1).approveAndCall(timelockContract2Address, sendToLockC, '0x')

  const sent = sendToLockA + sendToLockB + sendToLockC
  console.log('\ntotal sent:', sent)

  const user1Deposits = sendToLockA + sendToLockC
  console.log('user 1 deposits:' + user1Deposits)
  // const ea2 = await timelockRewardsReserveContract.eligibleAmount(user2.address)
  // console.log('ea2', ea2)

  
  // ok weve seeded the contract and staked our stuff

  const balanceCall1 = await timelockContract2.getBalance(user1.address)
  console.log('bc1', balanceCall1)

  const ea1 = await timelockRewardsReserveContract.eligibleAmount(user1.address)
  console.log('User 1 timelock Balance, before claim', ea1)
  // const p1 = await timelockContract2.pendingIncoming(user1.address)
  //console.log(p1)

  // note balance on timelock doesnt appear to change during this call
  const ready = await timelockRewardsReserveContract.connect(user1).claimTimelockRewards()

  const ea2 = await timelockRewardsReserveContract.eligibleAmount(user1.address)
  console.log('User 1 timelock Balance, after claim', ea2)

  // const p2 = await timelockContract2.pendingIncoming(user1.address)
  //console.log(p2)

  const accept = await timelockContract2.connect(user1).acceptIncomingTokens()
  const balanceCall2 = await timelockContract2.getBalance(user1.address)
  console.log('bc2', balanceCall2)
  console.log()


  // withdrawal (early)



  // const wd1 = await timelockContract2.withdraw(balanceCall2, true)
  // console.log(wd1)
  const wd2 = await timelockContract2.withdraw(balanceCall2, false)
  console.log(wd2)






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