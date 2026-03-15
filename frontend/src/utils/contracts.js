export const CHAIN_CONFIG = {
  chainId: 420420417,
  chainIdHex: "0x190F1B41",
  name: "Polkadot Hub TestNet",
  currency: { name: "PAS", symbol: "PAS", decimals: 18 },
  rpc: "https://eth-rpc-testnet.polkadot.io/",
  explorer: "https://blockscout-testnet.polkadot.io/",
  faucet: "https://faucet.polkadot.io/",
};

// Placeholder addresses — update after testnet deployment (Day 5)
export const CONTRACT_ADDRESSES = {
  router: "0x0000000000000000000000000000000000000000",
  vault: "0x0000000000000000000000000000000000000000",
  settlement: "0x0000000000000000000000000000000000000000",
  engine: "0x0000000000000000000000000000000000000000",
  executor: "0x0000000000000000000000000000000000000000",
};

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
  "event OrderCommitted(bytes32 indexed commitHash, address indexed trader, uint256 indexed epochId, uint256 collateral)",
  "event OrderRevealed(bytes32 indexed commitHash, address indexed trader, uint256 indexed epochId, uint8 orderType, uint256 amountIn)",
  "event EpochSettled(uint256 indexed epochId, uint256 clearingPrice, uint256 totalBuyVolume, uint256 totalSellVolume, uint256 matchedOrders)",
  "event EpochAdvanced(uint256 indexed newEpochId, uint256 startTime, uint256 endTime)",
];

export const VAULT_ABI = [
  "function collateral(address) view returns (uint256)",
  "function commitCollateral(bytes32) view returns (uint256)",
];

export const TOKEN_PAIRS = [
  { label: "PAS / USDC", tokenIn: "0x0000000000000000000000000000000000000000", tokenOut: "0x0000000000000000000000000000000000000001" },
  { label: "PAS / vDOT", tokenIn: "0x0000000000000000000000000000000000000000", tokenOut: "0x0000000000000000000000000000000000000002" },
];
