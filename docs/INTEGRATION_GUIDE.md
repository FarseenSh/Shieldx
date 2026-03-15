# How to Add ShieldX MEV Protection to Your Protocol

## 1. Why Integrate

MEV (Maximal Extractable Value) costs DeFi users over $500M annually on Ethereum alone. As DeFi grows on Polkadot Hub, sandwich attacks, front-running, and back-running will follow. Every swap your users make on an AMM is vulnerable to MEV extraction by searchers monitoring the mempool.

ShieldX eliminates MEV at the execution layer. Instead of executing trades one at a time (where order matters), ShieldX collects orders in time-bounded epochs, hides them via commit-reveal cryptography, and settles all orders at a single uniform clearing price. This means no trader gets a better price by seeing another trader's order first.

Integrating ShieldX into your protocol gives your users automatic MEV protection on every trade. The integration is lightweight: wrap your swap logic in a ShieldX commitment, and settlement happens automatically via the batch auction engine.

## 2. Quick Start

### Step 1: Import the Interface

```solidity
import {IShieldXRouter} from "./interfaces/IShieldXRouter.sol";

IShieldXRouter public shieldx;

constructor(address _shieldxRouter) {
    shieldx = IShieldXRouter(_shieldxRouter);
}
```

### Step 2: Submit Protected Orders

When a user wants to trade, compute the commitment hash client-side and call `commitOrder`:

```solidity
// Client-side (JavaScript):
const salt = crypto.getRandomValues(new Uint8Array(32));
const commitHash = ethers.solidityPackedKeccak256(
    ["uint8", "address", "address", "uint256", "uint256", "uint256", "bytes32"],
    [orderType, tokenIn, tokenOut, amountIn, minAmountOut, maxPrice, salt]
);

// On-chain:
await router.commitOrder(commitHash, { value: collateral });
```

### Step 3: Reveal and Settle

After the epoch ends, reveal the order with the original parameters and salt. Settlement is automatic and permissionless:

```solidity
await router.revealOrder(orderType, tokenIn, tokenOut, amountIn, minAmountOut, maxPrice, salt);
// Anyone can call settleEpoch() after the reveal window closes
await router.settleEpoch(epochId);
```

## 3. Solidity Integration Example

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IShieldXRouter.sol";

/// @title MEV-Protected Swap Wrapper
/// @notice Wraps any swap in ShieldX MEV protection
contract ProtectedSwap {
    IShieldXRouter public router;

    constructor(address _router) {
        router = IShieldXRouter(_router);
    }

    /// @notice Submit a protected swap order
    /// @param commitHash Pre-computed commitment hash (keccak256 of order params + salt)
    function protectedSwap(bytes32 commitHash) external payable {
        router.commitOrder{value: msg.value}(commitHash);
    }

    /// @notice Check if the current epoch is accepting orders
    function canSubmitOrders() external view returns (bool) {
        return router.isInCommitPhase();
    }

    /// @notice Check how much MEV a user saved in a given epoch
    function checkSavings(uint256 epochId, address user) external view returns (uint256) {
        return router.getUserSurplus(epochId, user);
    }
}
```

## 4. Supported Assets

| Asset | Type | Source | Status |
|-------|------|--------|--------|
| PAS/DOT | Native | Polkadot Hub | Supported |
| vDOT | Liquid Staking | Bifrost (paraId 2030) | Supported via XCM |
| USDC | Stablecoin | Asset Hub (paraId 1000) | Supported via XCM |
| USDT | Stablecoin | Asset Hub (paraId 1000) | Supported via XCM |

All assets use 18 decimal precision (PAS standard on Polkadot Hub).

## 5. XCM Cross-Chain Routing

After batch settlement, ShieldX routes fills to the best execution venue across Polkadot parachains via the XCM precompile at `0x00000000000000000000000000000000000a0000`.

**Supported parachains:**
- **Hydration** (paraId 2034) — primary DEX for DOT/stablecoin pairs
- **Bifrost** (paraId 2030) — vDOT liquid staking token swaps
- **Acala** (paraId 2000) — aUSD stablecoin ecosystem
- **Asset Hub** (paraId 1000) — native USDC/USDT transfers

XCM messages follow the `WithdrawAsset + BuyExecution + DepositAsset` pattern (XCM v4), ensuring trustless cross-chain asset transfer without bridges.

## 6. Ecosystem Alignment

ShieldX aligns directly with the Polkadot community's vision for MEV protection. The Polkadot Forum has actively discussed encrypted mempools as a mechanism for turning MEV leakage into treasury revenue (see: [Encrypted Mempools: Turning Polkadot's MEV Leak into Treasury Revenue](https://forum.polkadot.network/t/encrypted-mempools-turning-polkadots-mev-leak-into-treasury-revenue/15817)).

ShieldX is a concrete implementation of this vision at the smart contract layer:
- **Commit-reveal** provides the functional equivalent of an encrypted mempool
- **Batch auctions** eliminate ordering-based MEV entirely
- **Uniform clearing price** ensures all participants get fair execution
- **XCM integration** extends protection across the entire Polkadot ecosystem

By building on Polkadot Hub's dual-VM architecture (Solidity + Rust via PolkaVM), ShieldX demonstrates that MEV protection can be implemented efficiently without protocol-level changes.

## 7. Roadmap to Production

| Phase | Timeline | Deliverables |
|-------|----------|-------------|
| **TestNet** | Now | Deployed on Polkadot Hub TestNet (Chain ID 420420417) |
| **Audit** | Q3 2026 | Security audit of all Solidity and Rust contracts |
| **Mainnet** | Q4 2026 | Deploy to Polkadot Hub Mainnet (Chain ID 420420419) |
| **SDK** | Q1 2027 | npm package `@shieldx/sdk` for one-line integration |
| **Governance** | Q2 2027 | Propose as default MEV protection for Polkadot Hub DEXs |

**Contract addresses (TestNet):** See `scripts/deploy.js` for latest deployment.

**Get test tokens:** https://faucet.polkadot.io/
