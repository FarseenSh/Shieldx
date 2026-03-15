const ROUTER_ABI = [
  "function commitOrder(bytes32 commitHash) payable",
  "function revealOrder(uint8 orderType, address tokenIn, address tokenOut, uint256 amountIn, uint256 minAmountOut, uint256 maxPrice, bytes32 salt)",
  "function settleEpoch(uint256 epochId)",
  "function getCurrentEpoch() view returns (tuple(uint256 id, uint256 startTime, uint256 endTime, uint8 status, uint256 totalCommitments, uint256 totalRevealed, uint256 clearingPrice, bool settled))",
  "function isInCommitPhase() view returns (bool)",
  "function isInRevealPhase() view returns (bool)",
  "function currentEpochId() view returns (uint256)",
  "function epochDuration() view returns (uint256)",
  "function revealWindow() view returns (uint256)",
  "function minCollateral() view returns (uint256)",
  "function getUserSurplus(uint256 epochId, address user) view returns (uint256)",
  "function getEpochTotalSurplus(uint256 epochId) view returns (uint256)",
  "function getProtocolStats() view returns (uint256 orders, uint256 volume, uint256 mevSaved, uint256 fees)",
  "event EpochSettled(uint256 indexed epochId, uint256 clearingPrice, uint256 totalBuyVolume, uint256 totalSellVolume, uint256 matchedOrders, uint256 totalSurplus)",
  "event MEVSaved(uint256 indexed epochId, address indexed trader, uint256 surplus)",
];

const CHAIN_CONFIG = {
  testnet: {
    chainId: 420420417,
    rpc: "https://eth-rpc-testnet.polkadot.io/",
    explorer: "https://blockscout-testnet.polkadot.io/",
  },
  localhost: {
    chainId: 31337,
    rpc: "http://127.0.0.1:8545/",
  },
};

module.exports = { ROUTER_ABI, CHAIN_CONFIG };
