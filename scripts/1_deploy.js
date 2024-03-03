const fs = require('fs')

const hre = require("hardhat");
const ethers = hre.ethers
const provider = ethers.provider

const helpers = require("@nomicfoundation/hardhat-network-helpers")

const { decimals, readlineUtils, txUtils, dateUtils } = require('../utils/')
const { getFunctionsForContract, getFunctionDefinitionsFromAbi } = txUtils
const { getAnswer } = readlineUtils
const { getTimeAgo, dateNowBKK, timeFmtDb } = dateUtils
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

let bsovContract
let bsovDecimals
let timelockContract2
let timelockRewardsReserveContract


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

  bsovContract = new ethers.Contract(bsovAddress, bsovAbi, provider)
  bsovDecimals = parseInt(await bsovContract.decimals())

  const [owner, user1, user2, user3] = await ethers.getSigners()
  await getFunds(bsovWhale, owner)
  await getFunds(bsovWhale2, owner)
  await getFunds(bsovWhale3, owner)
  await getFunds(bsovWhale4, owner)
  await getFunds(bsovWhale5, owner)
  await getFunds(bsovWhale6, owner)

  const bsovBalance = await bsovContract.balanceOf(owner.address)
  if (Number(d(bsovBalance.toString(), bsovDecimals)) < 600000) {
    console.log('Needs more BSOV to perform tests.')
    process.exit()
  }

  await bsovContract.connect(owner).transfer(user1.address, 200000 * 10 ** 8)
  await bsovContract.connect(owner).transfer(user2.address, 100000 * 10 ** 8)

  console.log('Transferred ' + d(bsovBalance, bsovDecimals) + ' BSOV from whale wallets.')

  console.log("Deployer: " + owner.address)
  console.log("User 1:   " + user1.address)
  console.log("User 2:   " + user2.address)
  console.log("User 3:   " + user3.address)
  console.log()

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
  timelockContract2 = await Contract1.deploy(...parameters1)
  const timelockContract2Address = timelockContract2.target
  await fs.writeFileSync(__dirname + '/' + network + '/TimelockContract2.json', JSON.stringify({ contract: timelockContract2Address }, null, 4))
  console.log("TimelockContract2 deployed to: " + timelockContract2Address + ' on ' + network)

  const parameters = [timelockContract2Address, bsovAddress]
  const Contract = await hre.ethers.getContractFactory("TimelockRewardsReserve")
  timelockRewardsReserveContract = await Contract.deploy(...parameters)
  const timelockRewardsReserveContractAddress = timelockRewardsReserveContract.target
  await fs.writeFileSync(__dirname + '/' + network + '/TimelockRewardsReserve.json', JSON.stringify({ contract: timelockRewardsReserveContractAddress }, null, 4))
  console.log("TimelockRewardsReserve deployed to: " + timelockRewardsReserveContractAddress + ' on ' + network)
  console.log()

  // Initialize the first contract with the second address
  await timelockContract2.setTimelockRewardReserveAddress(timelockRewardsReserveContractAddress)
  
  // owner seeds contract with 300k rewards tokens
  // the issue here is that since theres a tax the owner must send a percent more than expected to seed. 
  // then call contract calculating a lower number:
  // Recommend: this design has flaws and is not tight, consider redoing this:
  // 1 dont tax owner funds for seeding
  // 2 instead of using the same approve and call method maybe have a separate call for this
  const seedFund = 300000 * 10 ** 8 // just below max in a tx
  const seedFundPerc = 30303030303031

  // first the owner sends a percent to the contract for rewards
  await bsovContract.connect(owner).transfer(timelockRewardsReserveContractAddress, seedFundPerc)
  // then the owner timelocks the seed funds. 
  await timelockRewardsReserveContract.connect(owner).ownerTimelockTokens(seedFund, '0x')

  console.log(await chainDate() + ' Init and Seed')
  await allTheGlobalThings()


  console.log('............. Section 1: User Deposits .............\n')
  // A couple users locks his stuff in the contract
  const sendToLockA = 101000 * 10 ** 8 // just below max in a tx
  // console.log('\nStep 1, user 1')
  const step1 = await bsovContract.connect(user1).approveAndCall(timelockContract2Address, sendToLockA, '0x')
  
  const sendToLockB = 60000 * 10 ** 8 // blast thresh by a little
  // console.log('\nStep 1, user 2')
  const step2 = await bsovContract.connect(user2).approveAndCall(timelockContract2Address, sendToLockB, '0x')

  const sendToLockC = 1000 * 10 ** 8 
  // console.log('\nStep 1, user 1')
  const step3 = await bsovContract.connect(user1).approveAndCall(timelockContract2Address, sendToLockC, '0x')

  if (0) {
    console.log('User deposit totals')
    const sent = sendToLockA + sendToLockB + sendToLockC
    console.log('\ntotal sent:', sent)
    const user1Deposits = sendToLockA + sendToLockC
    console.log('user 1 deposits:' + user1Deposits)
  }

  console.log(await chainDateFmt() + ' User 1 details:')
  await allThe_userThings(user1.address)
  // console.log(await chainDateFmt() + ' User 2 details:')
  // await allThe_userThings(user2.address, timelockContract2, timelockRewardsReserveContract)


  console.log('............. Section 2: Claim Eligible / Accept Incoming .............\n')

  const ready = await timelockRewardsReserveContract.connect(user1).claimTimelockRewards()

  // still not sure I understand what the point of this is.
  console.log(await chainDateFmt() + ' User 2 details: > claim eligible amount, balance moves from eligibleAmount to untakenIncomingBalance')
  await allThe_userThings(user1.address)

  // It appears that you want to call this as soon as you are finished making deposits because otherwise 
  // it is a thousand day wait after you make this call
  const accept = await timelockContract2.connect(user1).acceptIncomingTokens()
  console.log(await chainDateFmt() + ' User 2: After accept incoming tokens, balance moves from untakenIncoming to Incoming')
  await allThe_userThings(user1.address)

  console.log('............. Section 3: Fast Forward  .............\n')

  console.log(await chainDateFmt() + ' Fast forward -> Day Before')
  await helpers.mine(1000, { interval: 86400 }) // 1 block per day for 1000 days

  await allTheGlobalThings()
  await allThe_userThings(user1.address)

  console.log(await chainDateFmt() + ' Day After: User able to withdrawal 100 tokens from either account')
  await helpers.mine(2, { interval: 86400 })

  await allTheGlobalThings()
  await allThe_userThings(user1.address)


  console.log('............. Section 4: Withdrawals .............\n')

  // can only withdrawal 100 tokens per day after 1000 days has elapsed
  const withdrawal1 = 100 * 10**8
  await timelockContract2.connect(user1).withdraw(withdrawal1, true)

  console.log(await chainDateFmt() + ' After Withdrawal 1: Balances')
  await allTheGlobalThings()
  await allThe_userThings(user1.address)


  // can only withdrawal 100 tokens per day after 1000 days has elapsed
  const withdrawal2 = 100 * 10 ** 8
  await timelockContract2.connect(user1).withdraw(withdrawal2, false)

  console.log(await chainDateFmt() + ' After Withdrawal 2: Balances')
  await allTheGlobalThings()
  await allThe_userThings(user1.address)

  

  console.log('............. Section 5: Weekly Withdrawals continued (takes a bit to simulate).............\n')

  // can only withdrawal 100 tokens per week after 1000 days has elapsed
  let elapsedHours = 0
  for (let i = 0; i < 1003; i++) {
    await helpers.mine(170, { interval: 3600 }) // A week and two hours later
    const a = timelockContract2.connect(user1).withdraw(100 * 10 ** 8, true)
    const b =  timelockContract2.connect(user1).withdraw(100 * 10 ** 8, false)
    await Promise.all([a,b])
    elapsedHours += 170
  }
  const days = elapsedHours / 24
  console.log('Time Elapsed withdrawaling from fund: ' + days + ' days.\n')

  await allThe_userThings(user1.address)

  // remaining issues:

  // update to lv of solidity will solve a security issue with maths. (replace now with block.timestamp)
  // the naming of a lot of these functions is ambiguous and hard to understand
  // theres too many steps to get to where this is going
  // a user who forgot to claimTimelockRewards and acceptIncomingTokens would have to wait an additional 1000 days before they can collect rewards, imajin waiting 1k dayss and then this
  // can a user withdrawal early at all?
  // the duration of the withdrawal season is entirely disproportionate to the staking period
  // what are the realistic amounts people will deposit?
  // what happens if the balance of the contract runs out?
  // Why would someone who made a large deposit have to take longer to withdrawal than a person who made a small deposit?
  // the fees for a withdrawal of 100 BSOV on eth mainnet would negate any value of the tokens being withdrawn
  // havent even started on fees and optimization

}

const chainDateFmt = async () => {
  return timeFmtDb(await chainDate())
}

const chainDate = async () => {
  const blockTimestamp = (await provider.getBlock()).timestamp
  return blockTimestamp * 1000
}

const allTheGlobalThings = async () => {

  const date = await chainDate()

  const bsovBalance = await bsovContract.balanceOf(timelockRewardsReserveContract)
  console.log('  BSOV balance (rewards)'.padEnd(30), d(bsovBalance.toString(), bsovDecimals))

  console.log('Globals:')
  // "Regular Account"
  const getTimeLeft = await timelockContract2.getTimeLeft()
  const GTLDisp = getTimeLeft > 0 ? timeFmtDb(date + parseInt(getTimeLeft) * 1000) : 0
  console.log('  getTimeLeft'.padEnd(30), GTLDisp)
  console.log('')

}

const allThe_userThings = async (user) => {

  console.log('User Parameters:')

  const date = await chainDate()
  const bsovBalance = await bsovContract.balanceOf(user)
  console.log('  BSOV balance'.padEnd(30), d(bsovBalance.toString(), bsovDecimals))

  const ea1 = await timelockRewardsReserveContract.eligibleAmount(user)
  const eligibleAmount = d(ea1.toString(), bsovDecimals)
  console.log('  eligibleAmount'.padEnd(30), eligibleAmount)

  const pi = await timelockContract2.pendingIncoming(user)
  piDisplay = d(pi.toString(), bsovDecimals)
  console.log('  pendingIncoming'.padEnd(30), piDisplay)
  
  const userBalance = await timelockContract2.getBalance(user)
  userBalanceDisp = d(userBalance.toString(), bsovDecimals)
  console.log('  userbalance'.padEnd(30), userBalanceDisp)

  const gliaw = await timelockContract2.getLastIncomingAccountWithdrawal(user)
  
  // cant prograp a future date into getTimeAgo harumph
  const LIAWDisp = gliaw > 0 ? timeFmtDb(parseInt(gliaw) * 1000) : 'never'
  console.log('  getLastIncAccountWithdrawal'.padEnd(30), LIAWDisp)

  const getLastWithdrawal = await timelockContract2.getLastWithdrawal(user)
  const GLWDisp = getLastWithdrawal > 0 ? timeFmtDb(parseInt(getLastWithdrawal) * 1000) : 'never'
  console.log('  getLastWithdrawal'.padEnd(30), GLWDisp)

  const getIncomingAccountTimeLeft = await timelockContract2.getIncomingAccountTimeLeft(user)
  const IATLDisp = timeFmtDb(date + parseInt(getIncomingAccountTimeLeft) * 1000)
  console.log('  getIncomingAccountTimeLeft'.padEnd(30), IATLDisp)

  const getUntakenIncomingBalance = await timelockContract2.getUntakenIncomingBalance(user)
  console.log('  getUntakenIncomingBalance'.padEnd(30), d(getUntakenIncomingBalance.toString(), bsovDecimals))

  const getIncomingAccountBalance = await timelockContract2.getIncomingAccountBalance(user)
  console.log('  getIncomingAccountBalance'.padEnd(30), d(getIncomingAccountBalance.toString(), bsovDecimals))
  console.log()
}

const getFunds = async (whale, owner) => {
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

const extraJunk = async () => {

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