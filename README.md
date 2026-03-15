# ShieldX — MEV-Protected Cross-Chain Intent Execution Protocol

> The first MEV protection infrastructure on Polkadot Hub

**Built for the Polkadot Solidity Hackathon 2026 — Track 2: PVM Smart Contracts**

## The Problem

Every DeFi swap on Polkadot Hub is vulnerable to sandwich attacks and front-running. On Ethereum, MEV extracts $500M+ per year from users. As DeFi grows on Polkadot, this problem follows — and there is **zero protection infrastructure** today.

## The Solution

ShieldX is a commit-reveal batch auction protocol that makes MEV extraction impossible:

1. **COMMIT** — Users submit encrypted order commitments with PAS collateral. Order details are invisible on-chain.
2. **REVEAL** — After the epoch window closes, users reveal their orders. Hashes are verified against commitments.
3. **SETTLE** — A Rust PVM contract (running natively on PolkaVM/RISC-V) computes a uniform clearing price via batch auction matching. All orders in a batch execute at the **same price** — no sandwich attacks possible.
4. **EXECUTE** — Matched fills are distributed. Cross-chain fills route via XCM to parachains (Hydration, Bifrost, Acala).

## Why Only Polkadot

This architecture is impossible on any other chain. It requires all four Polkadot primitives simultaneously:

| Primitive | Role in ShieldX |
|-----------|----------------|
| **PolkaVM (PVM)** | Rust PVM contract for batch auction computation in native RISC-V |
| **XCM** | Cross-chain order routing to parachain DEXs without bridges |
| **Shared Security** | Trustless cross-chain settlement via relay chain validators |
| **Dual-VM** | Solidity interface + Rust heavy computation in the same protocol |

## Track 2 Category Coverage

### 1. PVM Experiments — Rust from Solidity
The `ShieldXEngine` Rust PVM contract handles batch auction matching (O(N log N)), manipulation detection (wash trading, spoofing, market impact), and TWAP computation — all compiled to RISC-V for native PolkaVM execution.

### 2. Applications Using Polkadot Native Assets
Users trade native PAS/DOT (not wrapped), vDOT from Bifrost, and Asset Hub stablecoins (USDC, USDT). Collateral bonds paid in native tokens.

### 3. Polkadot Native Functionality — Precompiles
XCM precompile (`0x00000000000000000000000000000000000a0000`) used for cross-chain order routing via `weighMessage()`, `execute()`, and `send()`.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Smart Contracts | Solidity 0.8.20 → PolkaVM (pallet-revive) |
| PVM Contract | Rust (RISC-V, no_std) |
| Cross-Chain | XCM v4 via precompile |
| Testing | Hardhat 2.27+ / Foundry / Cargo |
| Frontend | React 18 + Vite + ethers.js v6 |
| Network | Polkadot Hub TestNet (Chain ID: 420420417) |

## Quick Start

```bash
git clone https://github.com/YOUR_USERNAME/shieldx.git
cd shieldx

# Install dependencies
npm install

# Run tests (uses Hardhat local network)
npx hardhat test

# Run Rust PVM contract tests
cd contracts/precompile && cargo test && cd ../..

# Deploy to Polkadot Hub TestNet
# 1. Get PAS test tokens from https://faucet.polkadot.io/
# 2. Set your private key
cp .env.example .env
# Edit .env with your testnet private key
npx hardhat run scripts/deploy.js --network polkadotTestnet

# Start frontend
cd frontend && npm install && npm run dev
```

## Deployed Contracts (Polkadot Hub TestNet — Chain ID 420420417)

| Contract | Address |
|----------|---------|
| MockShieldXEngine | `TBD` |
| ShieldXVault | `TBD` |
| ShieldXSettlement | `TBD` |
| ShieldXRouter | `TBD` |
| ShieldXExecutor | `TBD` |

## Test Coverage

| Layer | Framework | Tests |
|-------|-----------|-------|
| Smart Contracts | Hardhat + Foundry | 80+ |
| Rust Precompile | Cargo | 30+ |
| Integration | Hardhat scripts | 20+ |
| Frontend E2E | Playwright | 20+ |
| **Total** | | **150+** |

## License

MIT

---

*ShieldX — Build Once. Shield Everywhere.*
