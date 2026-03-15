# ShieldX: MEV-Protected Cross-Chain Intent Execution on Polkadot

**Version 0.1 — March 2026**

## Abstract

ShieldX is a commit-reveal batch auction protocol for MEV-protected trade execution on Polkadot Hub. It combines cryptographic order hiding, uniform clearing price settlement, and XCM cross-chain routing to eliminate sandwich attacks, front-running, and all ordering-based MEV extraction. The protocol's settlement engine runs as a native Rust PVM contract on PolkaVM (RISC-V), providing O(N log N) batch matching with on-chain manipulation detection. In testing, ShieldX reduces MEV extraction from $3.00 per trade to $0.00 — a 100% reduction — while adding only 0.1% protocol fee on settled volume.

---

## 1. Problem Statement

### The MEV Tax on DeFi Users

Maximal Extractable Value (MEV) is the profit extractable from users by reordering, inserting, or censoring transactions within a block. On Ethereum, MEV extraction costs DeFi users over **$500 million annually** (source: Flashbots MEV-Explore). The most common attack — the **sandwich attack** — works as follows:

1. A user submits a swap: "Buy 100 DOT with USDC at market price"
2. An MEV searcher sees this pending transaction in the mempool
3. The searcher **front-runs**: buys DOT before the user, pushing the price up 3%
4. The user's swap executes at the inflated price — receiving 97 USDC worth of DOT instead of 100
5. The searcher **back-runs**: sells DOT at the higher price, extracting ~$2.85 profit

The user loses $3.00. The searcher profits $2.85. The remaining $0.15 goes to the block producer as a priority fee bribe. This is a pure wealth transfer from users to sophisticated actors.

### MEV on Polkadot Hub

As DeFi grows on Polkadot Hub — with native DOT trading, vDOT liquid staking (Bifrost), and stablecoin swaps via Asset Hub — the same MEV dynamics will emerge. Polkadot Hub's EVM-compatible environment (pallet-revive) uses a public mempool, making pending transactions visible to searchers.

The Polkadot community has recognized this threat. A [Polkadot Forum discussion on encrypted mempools](https://forum.polkadot.network/t/encrypted-mempools-turning-polkadots-mev-leak-into-treasury-revenue/15817) proposed turning MEV leakage into treasury revenue — but no concrete smart contract implementation existed until ShieldX.

### Prior Art

**No Sandwich Swap** (3rd place, Polkadot Hackathon Bangkok 2024) demonstrated demand for MEV protection on Polkadot. However, their approach used delayed execution without batch pricing — orders still executed sequentially, preserving ordering-based MEV. ShieldX advances beyond this by introducing **uniform clearing price settlement**, where all orders in a batch execute at the same price, making order sequencing irrelevant.

---

## 2. Protocol Design

### Core Insight

> A sandwich attacker who buys before and sells after a victim's trade profits from the price movement between their two transactions. If all orders — including the attacker's buy and sell — execute at the **same uniform price**, the attacker's profit is exactly zero.

ShieldX enforces this property through a four-phase epoch lifecycle:

### Phase 1: Commit

Users submit a cryptographic commitment hiding their order details:

```
commitHash = keccak256(orderType, tokenIn, tokenOut, amountIn, minAmountOut, maxPrice, salt)
```

The `salt` is a random 32-byte value generated client-side and never revealed until Phase 2. The commitment is submitted on-chain with a collateral bond (minimum 0.01 PAS). During this phase, order details are invisible — no searcher can see what any user intends to trade.

### Phase 2: Reveal

After the epoch's commit window closes (configurable, 30 seconds on testnet), users reveal their original order parameters and salt. The contract verifies that `keccak256(revealed params) == stored commitHash`. Users who fail to reveal within the reveal window forfeit their collateral to the protocol treasury.

### Phase 3: Settle

All revealed orders are passed to the **batch auction engine** (a Rust PVM contract running on PolkaVM). The engine:

1. Separates orders into buy and sell arrays
2. Sorts buys descending by price (highest bid first), sells ascending (lowest ask first)
3. Walks both arrays to find the **crossing point** where demand meets supply
4. Sets the **clearing price** as the midpoint of the last crossing pair
5. Fills all buy orders at or above the clearing price, all sell orders at or below it

Every filled order executes at the **same uniform clearing price**. This is the key property that eliminates MEV: there is no price difference to extract between any two orders in the same batch.

The engine also runs three **manipulation detection** algorithms:
- **Wash trading** (severity 70/100): Detects price clustering patterns
- **Spoofing** (severity 60/100): Detects single orders dominating volume
- **Market impact** (severity 50/100): Detects extreme price spread

### Phase 4: Execute

Filled orders are distributed:
- **Native PAS fills** are transferred directly from the collateral vault
- **Cross-chain fills** are routed via the XCM precompile to target parachains (Hydration DEX, Bifrost, Acala)
- Collateral is returned to all users who revealed, slashed for those who didn't

### MEV Surplus Tracking

For each filled order, the protocol computes the **surplus** — the difference between the user's limit price and the clearing price. For a buy order at limit price 110 that clears at 100, the surplus is (110-100) * fillAmount / 100. This surplus represents MEV that would have been extracted on a traditional DEX but was saved by the batch auction mechanism. The protocol tracks cumulative surplus per user, per epoch, and across all epochs.

---

## 3. Polkadot-Native Architecture

ShieldX is architecturally impossible on any single-VM chain. It requires four Polkadot primitives simultaneously:

### Why PVM (PolkaVM)

The batch auction engine is computationally intensive: sorting N orders, finding the demand-supply intersection, computing fills, and running manipulation detection algorithms. The **Rust PVM contract** compiles to RISC-V for native execution on PolkaVM, providing:
- **Stable insertion sort** matching the Solidity reference implementation exactly
- **Overflow-safe u128 arithmetic** for price/amount calculations
- **no_std compatibility** for minimal binary size (LTO + opt-level "z")

The Solidity `MockShieldXEngine` provides identical logic for EVM-mode testing. Both implementations produce identical results for all inputs — verified by 38 Rust tests and 37 Solidity tests using the same test vectors.

### Why XCM

After batch settlement, fills for cross-chain assets (vDOT from Bifrost, USDC from Asset Hub) are routed via the **XCM precompile** at `0x00000000000000000000000000000000000a0000`. The XCM message follows the standard `WithdrawAsset + BuyExecution + DepositAsset` pattern (XCM v4), enabling trustless asset transfer without bridges.

Supported parachains: Hydration (2034), Bifrost (2030), Acala (2000), Asset Hub (1000).

### Why Shared Security

Cross-chain settlement via XCM is trustless because all Polkadot parachains share the relay chain's validator set. A fill routed from Polkadot Hub to Hydration has the same security guarantees as a fill executed locally — no bridge trust assumptions.

### Cross-VM Interoperability

ShieldX uses **Solidity for the user-facing interface** (familiar developer tooling, MetaMask compatibility) and **Rust for heavy computation** (batch matching, manipulation detection). Polkadot Hub's dual-VM architecture (REVM + PolkaVM) enables this composition natively.

---

## 4. Economic Model

### Protocol Fee

A configurable fee (default 0.1% = 10 basis points, maximum 1% = 100 basis points) is charged on total settled volume per epoch. The fee is set by the `DEFAULT_ADMIN_ROLE` holder and accrues to the protocol treasury.

Example: An epoch with $10,000 total volume generates $10 in protocol fees.

### Collateral Bond

Each order commitment requires a minimum collateral bond (0.01 PAS default). This serves two purposes:
1. **Anti-spam**: Prevents costless griefing via mass commitments
2. **Incentive alignment**: Users who commit must reveal or lose their bond

Collateral is returned in full after successful revelation and settlement. Unrevealed commitments are slashed to the treasury.

### Surplus Distribution

MEV surplus — the difference between a user's limit price and the actual clearing price — is returned entirely to users. The protocol does not capture surplus; it only charges the explicit fee on volume. This aligns incentives: users are strictly better off using ShieldX than a traditional DEX for any trade where MEV would have been extracted.

### Revenue Projections

| Daily Volume | Fee Rate | Daily Revenue | Annual Revenue |
|-------------|----------|--------------|----------------|
| $100K | 0.1% | $100 | $36,500 |
| $1M | 0.1% | $1,000 | $365,000 |
| $10M | 0.1% | $10,000 | $3,650,000 |

---

## 5. Roadmap

| Phase | Timeline | Deliverable | Status |
|-------|----------|------------|--------|
| **Hackathon MVP** | Q1 2026 | Testnet deployment, 238 tests, React frontend, sandwich demo | Done |
| **Security Audit** | Q2 2026 | Third-party audit via Polkadot Assurance Legion subsidy | Planned |
| **Mainnet Launch** | Q3 2026 | Production deployment on Polkadot Hub (Chain ID 420420419) | Planned |
| **SDK Release** | Q3 2026 | `@shieldx/sdk` npm package for 3-line integration | Planned |
| **Solver Network** | Q4 2026 | Competitive batch settlement with solver incentives (similar to CoW Protocol) | Research |
| **Multi-Ecosystem** | Q1 2027 | Expansion to Kusama, EVM L2s via cross-chain messaging | Research |

---

## References

1. Flashbots. "MEV-Explore." https://explore.flashbots.net/
2. Daian, P. et al. "Flash Boys 2.0: Frontrunning in Decentralized Exchanges." IEEE S&P 2020.
3. CoW Protocol. "Batch Auctions as a Solution to MEV." https://docs.cow.fi/
4. Polkadot Forum. "Encrypted Mempools: Turning Polkadot's MEV Leak into Treasury Revenue." https://forum.polkadot.network/t/encrypted-mempools-turning-polkadots-mev-leak-into-treasury-revenue/15817
5. Polkadot Documentation. "Smart Contract Precompiles: XCM." https://docs.polkadot.com/smart-contracts/precompiles/xcm/

---

*ShieldX is open source under the MIT license. GitHub: [github.com/FarseenSh/Shieldx](https://github.com/FarseenSh/Shieldx)*
