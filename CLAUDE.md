# CLAUDE.md

ShieldX is an MEV-protected cross-chain intent execution protocol for Polkadot Hub. Built for the Polkadot Solidity Hackathon 2026, Track 2 — PVM Smart Contracts. The goal is to win 1st prize.

## Tech Stack

- Solidity 0.8.20 (verified working on PolkaVM — used by VeritasXCM, a live Track 2 project)
- For PVM compilation: `@parity/hardhat-polkadot@0.2.7` + `@parity/resolc@1.0.0` (resolc supports Solidity 0.8.0+)
- Rust (no_std, RISC-V target for PolkaVM smart contract)
- Hardhat 2.27.0+ for testing and deployment
- Foundry (forge) for fuzz testing — works for EVM-mode unit tests only, NOT for PVM compilation
- React 18 + Vite + ethers.js v6 for frontend
- TailwindCSS for styling

## Network Details (VERIFIED from docs.polkadot.com — last updated Feb 26, 2026)

### Polkadot Hub TestNet
- Chain ID: 420420417
- Currency: PAS (NOT DOT — DOT is mainnet only)
- RPC URL (Parity): https://eth-rpc-testnet.polkadot.io/
- RPC URL (OpsLayer): https://services.polkadothub-rpc.com/testnet/
- Block Explorer (Blockscout): https://blockscout-testnet.polkadot.io/
- Block Explorer (Routescan): https://polkadot.testnet.routescan.io/
- Get test tokens: https://faucet.polkadot.io/

### Polkadot Hub Mainnet (for reference only)
- Chain ID: 420420419
- Currency: DOT
- RPC URL: https://eth-rpc.polkadot.io/

## Commands

- `npx hardhat compile` — Compile Solidity (EVM mode with standard solc)
- `npx hardhat test` — Run Hardhat unit tests
- `npx hardhat test test/unit/ShieldXVault.test.js` — Run a single test file
- `forge test` — Run Foundry fuzz tests (EVM mode only)
- `cd contracts/precompile && cargo test` — Run Rust PVM contract tests
- `npx hardhat run scripts/deploy.js --network polkadotTestnet` — Deploy to testnet
- `cd frontend && npm run dev` — Start frontend dev server

## Architecture

```
contracts/
├── interfaces/          # IShieldXRouter, IShieldXEngine, IShieldXExecutor, IXCM
├── core/                # ShieldXRouter, ShieldXVault, ShieldXSettlement, ShieldXExecutor
├── libraries/           # OrderLib, EpochLib, PriceLib
├── mock/                # MockShieldXEngine (Solidity mirror of Rust PVM contract)
└── precompile/src/      # lib.rs (Rust PVM contract for RISC-V/PolkaVM)

frontend/src/
├── components/          # React components
├── hooks/               # useShieldX, useEpoch, useWallet
├── utils/               # commitHash, contracts, xcm encoding
└── constants/           # tokens, chains

scripts/                 # Hardhat deploy scripts
test/
├── unit/                # Hardhat unit tests per contract
├── integration/         # Full flow tests on testnet
└── e2e/                 # Playwright browser tests
```

## Core Protocol Flow

1. COMMIT — User submits keccak256(order + salt) with PAS collateral. Order details hidden.
2. REVEAL — After epoch ends, user reveals order params. Hash verified against commitment.
3. SETTLE — Rust PVM contract (deployed via PolkaVM, callable from Solidity via cross-VM) computes uniform clearing price via batch auction. Manipulation detection runs. NOTE: Custom precompile registration is NOT available on Polkadot Hub as of March 2026. We deploy a Rust smart contract, not a precompile. MockShieldXEngine.sol provides identical Solidity logic for EVM-mode deployment.
4. EXECUTE — Matched fills distributed. Cross-chain fills routed via XCM precompile to parachains.

## Conventions

- Use named exports in all JavaScript files
- Solidity contracts use NatSpec documentation on all public/external functions
- All contract functions that modify state must emit events
- Error messages must be descriptive (not just "fail")
- Variable names: camelCase in Solidity and JS, snake_case in Rust
- Constants in SCREAMING_SNAKE_CASE

## Rules

- NEVER modify deployed contract addresses without updating ALL references
- Solidity must target 0.8.20 — this is verified working on PolkaVM by existing Track 2 projects
- MockShieldXEngine.sol MUST produce identical results to Rust PVM contract lib.rs
- XCM precompile address is always `0x00000000000000000000000000000000000a0000`
- Rust PVM contract must be `no_std` compatible — no standard library imports
- All user-facing amounts use 18 decimals (PAS precision on testnet)
- Every new function needs a test before merging
- Git commits use conventional format: `feat:`, `fix:`, `test:`, `docs:`

## IMPORTANT: Hardhat Testing Limitations on Polkadot Hub

From official docs: `@nomicfoundation/hardhat-toolbox/network-helpers` is NOT fully compatible with Polkadot Hub. Specifically:
- `time.increase()` — DOES NOT WORK on Polkadot nodes
- `loadFixture` — DOES NOT WORK on Polkadot nodes
- Use manual block mining or wait for real time passage in integration tests
- For unit tests, use Hardhat's local network (hardhat node) where these DO work
- For testnet integration tests, use real time delays

## XCM Integration (VERIFIED from docs.polkadot.com/smart-contracts/precompiles/xcm/)

The XCM precompile at `0x00000000000000000000000000000000000a0000` implements IXcm:
- `weighMessage(bytes calldata message) → Weight(refTime, proofSize)` — estimate execution cost
- `execute(bytes calldata message, Weight calldata weight)` — execute XCM locally (main entrypoint)
- `send(bytes calldata destination, bytes calldata message)` — send cross-chain

All XCM messages must be SCALE-encoded. Call `weighMessage` first, then `execute` with the returned weight.

## Parachain IDs (VERIFIED from polkadot.subscan.io)

- Hydration: 2034
- Bifrost: 2030
- Acala: 2000
- Asset Hub (system chain): 1000

## Key Types

Core domain types in `contracts/libraries/OrderLib.sol`:
- `OrderType` — enum: BUY or SELL
- `Order` — struct with orderType, tokenIn, tokenOut, amountIn, minAmountOut, maxPrice

Epoch management in `contracts/libraries/EpochLib.sol`:
- `EpochStatus` — enum: COMMIT, REVEAL, SETTLE, COMPLETED
- `Epoch` — struct with id, startTime, endTime, status, totalCommitments, clearingPrice

## Testing

- Unit tests: Hardhat on local network (where time helpers work), one test file per contract
- Fuzz tests: Foundry forge for property-based testing of batch auction math (EVM mode)
- Rust PVM contract tests: cargo test in `contracts/precompile/`
- Integration tests: full flow against live Polkadot Hub TestNet (no time helpers)
- E2E tests: Playwright
- Target: 150+ tests total

## Environment

Required env vars (see `.env.example`):
- `PRIVATE_KEY` — deployer wallet private key (testnet only, fund with PAS from faucet)
- `POLKADOT_RPC` — RPC URL for Polkadot Hub TestNet

Do NOT read or output contents of `.env` files.

## Git Rules
- Do NOT add Co-authored-by trailers to commit messages
- Do NOT add any author attribution in commits
- Use only conventional commit format: feat:, fix:, test:, docs:

## Deployment Order

Deploy in this exact sequence:
1. MockShieldXEngine
2. ShieldXVault (treasury = deployer)
3. ShieldXSettlement (engineAddress = step 1)
4. ShieldXRouter (vault = step 2, settlement = step 3)
5. ShieldXExecutor
6. Call vault.setRouter(router address)
7. Call settlement.setRouter(router address)
8. Call settlement.setXcmExecutor(executor address)

## Hackathon Context

Polkadot Solidity Hackathon 2026, Track 2 — PVM Smart Contracts.
Organized by OpenGuild + Web3 Foundation. Hosted on DoraHacks.

Track 2 categories (must cover all 3):
1. PVM Experiments — Call Rust/C++ libraries from Solidity (our Rust PVM contract, callable via cross-VM interop)
2. Applications using Polkadot native Assets (native PAS/DOT, vDOT, USDC)
3. Accessing Polkadot native functionality — precompiles (XCM precompile)

Judging: Technical implementation, Use of Polkadot Hub features, Innovation & impact, UX and adoption potential, Team execution and presentation.

Submission deadline: March 20, 2026. Demo Day: March 24-25, 2026.
Must present on Demo Day with camera on to be eligible to win.
Submission requires: Open-source GitHub repo, project description, 1-3 min demo video, pitch deck (recommended).
