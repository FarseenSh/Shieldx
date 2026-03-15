# @shieldx/sdk

> MEV protection for your DeFi protocol in 3 lines of code.

## Install

```bash
npm install @shieldx/sdk ethers
```

## Quick Start

```javascript
const { ShieldX } = require("@shieldx/sdk");
const { ethers } = require("ethers");

// Connect to ShieldX
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
const shieldx = new ShieldX(ROUTER_ADDRESS, signer);

// Submit a MEV-protected order
const { commitHash, txHash } = await shieldx.submitProtectedOrder(
  "BUY",                                    // order type
  ethers.ZeroAddress,                        // tokenIn (native PAS)
  "0x0000000000000000000000000000000001",    // tokenOut (USDC)
  ethers.parseEther("100"),                  // amount
  0,                                         // minAmountOut
  ethers.parseEther("1.05")                  // maxPrice
);

console.log(`Order committed: ${commitHash}`);
// Order details are HIDDEN on-chain until reveal phase
```

## DEX Integration

Add MEV protection to any swap function:

```javascript
const { ShieldX } = require("@shieldx/sdk");

async function protectedSwap(wallet, tokenIn, tokenOut, amount, maxPrice) {
  const shieldx = new ShieldX(ROUTER_ADDRESS, wallet);

  // 1. Submit hidden order
  const result = await shieldx.submitProtectedOrder(
    "BUY", tokenIn, tokenOut, amount, 0, maxPrice
  );
  console.log("Order committed. MEV protection active.");

  // 2. Auto-reveal when epoch ends
  const status = await shieldx.getEpochStatus();
  if (status.phase === "reveal") {
    await shieldx.revealPendingOrders();
  }

  // 3. Check savings after settlement
  const savings = await shieldx.getOrderSurplus(status.epochId);
  console.log(`MEV saved: ${savings.surplus} PAS`);
}
```

## API Reference

### `new ShieldX(routerAddress, signer)`

Create a new ShieldX instance connected to a deployed router contract.

### `submitProtectedOrder(orderType, tokenIn, tokenOut, amountIn, minAmountOut, maxPrice)`

Submit a commit-reveal protected order. Returns `{ commitHash, txHash }`.

- `orderType` — `'BUY'` or `'SELL'` (or `0`/`1`)
- `tokenIn` — Token to sell (use `ethers.ZeroAddress` for native PAS/DOT)
- `tokenOut` — Token to buy
- `amountIn` — Amount in wei (18 decimals)
- `minAmountOut` — Minimum output (slippage protection)
- `maxPrice` — Limit price in wei

### `revealPendingOrders()`

Reveal all pending orders. Call during the reveal phase. Returns array of tx hashes.

### `getEpochStatus()`

Get current epoch phase and timing. Returns:
```javascript
{ epochId, phase, timeRemaining, totalCommitments, settled }
```

### `getOrderSurplus(epochId)`

Get MEV savings for the connected wallet in a settled epoch. Returns:
```javascript
{ surplus: "1.5", surplusWei: 1500000000000000000n }
```

### `getProtocolStats()`

Get cumulative protocol statistics. Returns:
```javascript
{ totalOrders, totalVolume, totalMEVSaved, totalFees }
```

### `onEpochSettled(callback)`

Listen for epoch settlement events.

### `onMEVSaved(callback)`

Listen for individual MEV savings events.

## Network Config

| Network | Chain ID | Router |
|---------|----------|--------|
| Polkadot Hub TestNet | 420420417 | See deployment output |
| Hardhat Local | 31337 | `0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9` |

## License

MIT
