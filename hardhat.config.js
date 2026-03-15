require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// NOTE: For PVM compilation, use @parity/hardhat-polkadot plugin instead.
// This config is for EVM-compatible deployment and testing.
// PVM compilation: npm install --save-dev @parity/hardhat-polkadot@0.2.7 @parity/resolc@1.0.0

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: { enabled: true, runs: 200 },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    // Polkadot Hub TestNet
    // Chain ID: 420420417 (verified: docs.polkadot.com/polkadot-protocol/smart-contract-basics/networks)
    // Currency: PAS (testnet token, get from faucet.polkadot.io)
    polkadotTestnet: {
      url: process.env.POLKADOT_RPC || "https://eth-rpc-testnet.polkadot.io/",
      chainId: 420420417,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
  },
  etherscan: {
    apiKey: {
      polkadotTestnet: "no-api-key-needed",
    },
    customChains: [
      {
        network: "polkadotTestnet",
        chainId: 420420417,
        urls: {
          apiURL: "https://blockscout-testnet.polkadot.io/api",
          browserURL: "https://blockscout-testnet.polkadot.io/",
        },
      },
    ],
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
