export const CHAIN_CONFIG = {
  chainId: 420420417,
  chainIdHex: "0x190F1B41",
  name: "Polkadot Hub TestNet",
  currency: { name: "PAS", symbol: "PAS", decimals: 18 },
  rpc: "https://eth-rpc-testnet.polkadot.io/",
  explorer: "https://blockscout-testnet.polkadot.io/",
  faucet: "https://faucet.polkadot.io/",
};

export const LOCALHOST_CONFIG = {
  chainId: 31337,
  chainIdHex: "0x7A69",
  name: "Hardhat Local",
  currency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpc: "http://127.0.0.1:8545/",
  explorer: "",
};

// Testnet addresses — update after testnet deployment
const TESTNET_ADDRESSES = {
  router: "0x0000000000000000000000000000000000000000",
  vault: "0x0000000000000000000000000000000000000000",
  settlement: "0x0000000000000000000000000000000000000000",
  engine: "0x0000000000000000000000000000000000000000",
  executor: "0x0000000000000000000000000000000000000000",
};

// Localhost addresses — auto-populated by deploy script output
// Run: npx hardhat run scripts/deploy.js --network localhost
// Then paste addresses here
const LOCALHOST_ADDRESSES = {
  engine: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  vault: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  settlement: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
  router: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
  executor: "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9",
};

export function getAddresses(chainId) {
  if (chainId === 31337) return LOCALHOST_ADDRESSES;
  return TESTNET_ADDRESSES;
}

// Default export for backwards compatibility
export const CONTRACT_ADDRESSES = LOCALHOST_ADDRESSES;

export const ROUTER_ABI = [
  "function commitOrder(bytes32 commitHash) payable",
  "function revealOrder(uint8 orderType, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, uint256 maxPrice, bytes32 salt)",
  "function settleEpoch(uint256 epochId)",
  "function slashUnrevealed(uint256 epochId)",
  "function getCurrentEpoch() view returns (tuple(uint256 id, uint256 startTime, uint256 endTime, uint8 status, uint256 totalCommitments, uint256 totalRevealed, uint256 clearingPrice, bool settled))",
  "function getEpochOrders(uint256 epochId) view returns (tuple(address trader, uint8 orderType, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, uint256 maxPrice, bytes32 salt)[])",
  "function getEpochCommitmentCount(uint256 epochId) view returns (uint256)",
  "function isInCommitPhase() view returns (bool)",
  "function isInRevealPhase() view returns (bool)",
  "function currentEpochId() view returns (uint256)",
  "function epochDuration() view returns (uint256)",
  "function revealWindow() view returns (uint256)",
  "function minCollateral() view returns (uint256)",
  "function getUserSurplus(uint256 epochId, address user) view returns (uint256)",
  "function getEpochTotalSurplus(uint256 epochId) view returns (uint256)",
  "function protocolFeeBps() view returns (uint256)",
  "function getProtocolStats() view returns (uint256 orders, uint256 volume, uint256 mevSaved, uint256 fees)",
  "event OrderCommitted(bytes32 indexed commitHash, address indexed trader, uint256 indexed epochId, uint256 collateral)",
  "event OrderRevealed(bytes32 indexed commitHash, address indexed trader, uint256 indexed epochId, uint8 orderType, uint256 amountIn)",
  "event EpochSettled(uint256 indexed epochId, uint256 clearingPrice, uint256 totalBuyVolume, uint256 totalSellVolume, uint256 matchedOrders, uint256 totalSurplus)",
  "event EpochAdvanced(uint256 indexed newEpochId, uint256 startTime, uint256 endTime)",
  "event MEVSaved(uint256 indexed epochId, address indexed trader, uint256 surplus)",
  "event ProtocolFeeCollected(uint256 indexed epochId, uint256 feeAmount)",
];

export const VAULT_ABI = [
  "function collateral(address) view returns (uint256)",
  "function commitCollateral(bytes32) view returns (uint256)",
];

export const TOKEN_PAIRS = [
  { label: "PAS / USDC", tokenIn: "0x0000000000000000000000000000000000000000", tokenOut: "0x0000000000000000000000000000000000000001" },
  { label: "PAS / vDOT", tokenIn: "0x0000000000000000000000000000000000000000", tokenOut: "0x0000000000000000000000000000000000000002" },
];
