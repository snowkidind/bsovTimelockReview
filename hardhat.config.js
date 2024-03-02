const env = require('node-env-file')
env(__dirname + '/.env')

require("@nomicfoundation/hardhat-toolbox");

const lastBlock = 19309115

// Note should use "0.8.21"

module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.5.9",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      }
    ]
  },
  networks: {
    hardhat: {
      accounts: { mnemonic: process.env.MNEMONIC },
      forking: {
        url: process.env.MAINNET_URL,
        blockNumber: lastBlock
      }
    },
    mainnet: {
      url: process.env.MAINNET_URL,
      accounts: { mnemonic: process.env.MNEMONIC }
    },
    goerli: {
      url: process.env.GOERLI_URL,
      accounts: { mnemonic: process.env.MNEMONIC }
    },
    sepolia: {
      url: process.env.SEPOLIA_URL,
      accounts: { mnemonic: process.env.MNEMONIC }
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY
  }
};
