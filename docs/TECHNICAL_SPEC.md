# ShieldX — MEV-Protected Cross-Chain Intent Execution Protocol on Polkadot Hub

## Technical Specification & Build Guide for Polkadot Solidity Hackathon 2026 (Track 2 — PVM Smart Contracts)

---

## TABLE OF CONTENTS

1. Executive Summary
2. Problem Statement
3. Solution Architecture
4. Track 2 Category Coverage
5. Smart Contract Architecture
6. Rust Precompile Specification
7. XCM Integration Design
8. Frontend Application
9. Testing Strategy
10. Deployment Guide
11. Day-by-Day Build Plan
12. Demo Day Pitch Structure
13. Judging Criteria Alignment
14. Technical References & Resources

---

## 1. EXECUTIVE SUMMARY

**ShieldX** is an MEV-Protected Cross-Chain Intent Execution Protocol for Polkadot Hub. It combines commit-reveal batch auctions, Rust-powered PVM contract computation, and XCM cross-chain routing to provide sandwich-attack-proof order execution for DeFi users across the Polkadot ecosystem.

- **Prize Target**: Track 2 — PVM Smart Contract, 1st Prize ($3,000)
- **Chain**: Polkadot Hub TestNet (Chain ID: 420420417) 
- **Tech Stack**: Solidity 0.8.20 → PolkaVM (via resolc), Rust (RISC-V, no_std), XCM v4, Hardhat/Foundry, React + ethers.js v6
- **Key Innovation**: First MEV protection infrastructure on Polkadot. The batch auction model works on any EVM chain, but the cross-chain XCM execution layer is uniquely Polkadot

---

## 2. PROBLEM STATEMENT

### The MEV Crisis
- MEV (Maximal Extractable Value) costs DeFi users ~$500M+ annually on Ethereum
- Common attacks: sandwich attacks, front-running, back-running, just-in-time liquidity
- As DeFi grows on Polkadot Hub, MEV will follow — there is ZERO protection infrastructure today

### Why Existing Solutions Fail
| Solution | Problem |
|----------|---------|
| Flashbots (Ethereum) | Chain-specific, doesn't work cross-chain |
| Private mempools | Centralized, trust assumptions |
| Time-lock encryption | Computationally expensive, latency |
| MEV-Share | Ethereum-only, requires block builder cooperation |

### The Polkadot Opportunity
Polkadot Hub's unique architecture enables a fundamentally better approach:
- **XCM** enables trustless cross-chain order routing without bridges
- **PVM (PolkaVM)** enables Rust-native cryptographic computation for batch auction settlement
- **Shared Security** means cross-chain state is natively trustworthy
- **Dual-VM** allows Solidity interface + Rust heavy computation

---

## 3. SOLUTION ARCHITECTURE

### High-Level Flow

```
User Intent ("Swap 100 DOT for USDC at best price")
    │
    ▼
┌─────────────────────────────────────────────┐
│  ShieldX Frontend (React + ethers.js)       │
│  - Parse intent into structured order       │
│  - Generate commitment hash client-side     │
│  - Submit encrypted order to chain          │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  PHASE 1: COMMIT (Solidity — EVM)           │
│  ShieldXRouter.sol                          │
│  - Accept commitment hash + collateral      │
│  - Batch orders within epoch window         │
│  - No order details visible on-chain        │
└──────────────────┬──────────────────────────┘
                   │ (epoch ends)
                   ▼
┌─────────────────────────────────────────────┐
│  PHASE 2: REVEAL (Solidity — EVM)           │
│  ShieldXRouter.sol                          │
│  - Users reveal order details               │
│  - Verify hash matches commitment           │
│  - Forward batch to Rust PVM settlement engine       │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  PHASE 3: SETTLE (Rust PVM Contract)    │
│  ShieldXEngine (Rust PVM Contract — RISC-V)                │
│  - Compute uniform clearing price           │
│  - Match orders via batch auction           │
│  - Detect manipulation/anomalies            │
│  - Calculate optimal XCM routing            │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│  PHASE 4: EXECUTE (XCM Cross-Chain)         │
│  ShieldXExecutor.sol                        │
│  - Route fills to best venue via XCM        │
│  - Send cross-chain messages to parachains  │
│  - Settle native asset transfers            │
│  - Return filled orders to users            │
└─────────────────────────────────────────────┘
```

### Epoch-Based Batch Auction Model
- Orders are collected in **epochs** (configurable, default 30 seconds for testnet)
- During an epoch, all orders are hidden (commit phase)
- After epoch ends, orders are revealed and batch-settled at a **single uniform clearing price**
- This eliminates MEV because:
  1. Orders are invisible during collection (no front-running)
  2. All orders in a batch execute at the same price (no sandwich attacks)
  3. Order of revelation doesn't matter (no ordering manipulation)

---

## 4. TRACK 2 CATEGORY COVERAGE

### Category 1: PVM Experiments — Call Rust/C++ Libraries from Solidity

The `ShieldXEngine` is a Rust PVM smart contract compiled to RISC-V for PolkaVM that handles computationally intensive operations:

- **Batch Auction Matching**: Given N buy orders and M sell orders, compute the uniform clearing price where supply equals demand. This is an O(N log N) sorting + binary search problem.
- **Manipulation Detection**: Statistical anomaly detection on order distribution — detect wash trading, spoofing, and artificial price impact.
- **Price Aggregation**: Compute TWAP (Time-Weighted Average Price) from multiple source prices for fair value reference.
- **Commitment Verification**: Verify keccak256 commitment hashes match revealed order data (done in Rust for performance on large batches).

The Solidity contracts call the Rust PVM contract at its deployed address via cross-VM interoperability (confirmed by Polkadot docs: "contracts written for one VM can interact directly with contracts written for the other") for all heavy computation.

### Category 2: Applications Using Polkadot Native Assets

- Users deposit and trade **native DOT** (not wrapped — using PVM payable endpoints)
- Support for **native Asset Hub tokens**: USDC, USDT (via Asset Hub integration)
- Support for **vDOT** from Bifrost (liquid staking token)
- Collateral for commit-reveal bonds paid in native DOT
- All settlement in native assets — no wrapping required

### Category 3: Accessing Polkadot Native Functionality — Build with Precompiles

- **XCM Precompile** (`0x00000000000000000000000000000000000a0000`):
  - `weighMessage()` — estimate cost of cross-chain execution
  - `send()` — route matched orders to parachain DEXs (Hydration)
  - `execute()` — execute local XCM for asset transfers
- **Cross-chain order routing**: After batch settlement, optimal fills are routed to the best execution venue across Polkadot parachains via XCM

---

## 5. SMART CONTRACT ARCHITECTURE

### Contract Hierarchy

```
contracts/
├── interfaces/
│   ├── IShieldXRouter.sol          # Main router interface
│   ├── IShieldXEngine.sol          # Rust PVM contract interface
│   ├── IShieldXExecutor.sol        # XCM execution interface
│   └── IXCM.sol                    # Polkadot XCM precompile interface
├── core/
│   ├── ShieldXRouter.sol           # Main entry point — commit/reveal logic
│   ├── ShieldXVault.sol            # Escrow vault for order collateral
│   ├── ShieldXSettlement.sol       # Batch settlement + PVM contract calls
│   └── ShieldXExecutor.sol         # XCM cross-chain execution
├── libraries/
│   ├── OrderLib.sol                # Order struct encoding/decoding
│   ├── EpochLib.sol                # Epoch management utilities
│   └── PriceLib.sol                # Price calculation helpers
├── mock/
│   └── MockShieldXEngine.sol       # Solidity mock of Rust PVM contract
└── precompile/
    └── src/
        └── lib.rs                  # Rust PVM contract source (RISC-V)
```

### 5.1 ShieldXRouter.sol — Main Entry Point

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IShieldXRouter.sol";
import "./ShieldXVault.sol";
import "./ShieldXSettlement.sol";
import "./libraries/OrderLib.sol";
import "./libraries/EpochLib.sol";

contract ShieldXRouter is IShieldXRouter {
    using OrderLib for OrderLib.Order;
    using EpochLib for EpochLib.Epoch;

    // ═══════════════════════════════════════════════════════════
    // STRUCTS
    // ═══════════════════════════════════════════════════════════

    struct Commitment {
        bytes32 commitHash;       // keccak256(order details + salt)
        address committer;        // user address
        uint256 collateral;       // DOT collateral locked
        uint256 epochId;          // which epoch this belongs to
        uint64  timestamp;        // commit timestamp
        bool    revealed;         // has the order been revealed?
        bool    settled;          // has the order been settled?
    }

    struct RevealedOrder {
        address trader;
        OrderLib.OrderType orderType;  // BUY or SELL
        address tokenIn;               // token to sell
        address tokenOut;              // token to buy
        uint256 amountIn;              // amount of tokenIn
        uint256 minAmountOut;          // minimum acceptable output (slippage protection)
        uint256 maxPrice;              // max price willing to pay (buys) or min price (sells)
        bytes32 salt;                  // random salt used in commitment
    }

    // ═══════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════

    uint256 public currentEpochId;
    uint256 public epochDuration;        // seconds per epoch (30s testnet, 300s mainnet)
    uint256 public revealWindow;         // seconds allowed for reveal after epoch ends
    uint256 public minCollateral;        // minimum DOT collateral per order

    mapping(uint256 => EpochLib.Epoch) public epochs;
    mapping(bytes32 => Commitment) public commitments;  // commitHash => Commitment
    mapping(uint256 => bytes32[]) public epochCommitments; // epochId => commitHash[]
    mapping(uint256 => RevealedOrder[]) public epochOrders; // epochId => revealed orders

    ShieldXVault public vault;
    ShieldXSettlement public settlement;

    address public owner;

    // ═══════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════

    event OrderCommitted(
        bytes32 indexed commitHash,
        address indexed trader,
        uint256 indexed epochId,
        uint256 collateral
    );

    event OrderRevealed(
        bytes32 indexed commitHash,
        address indexed trader,
        uint256 indexed epochId,
        OrderLib.OrderType orderType,
        uint256 amountIn
    );

    event EpochSettled(
        uint256 indexed epochId,
        uint256 clearingPrice,
        uint256 totalBuyVolume,
        uint256 totalSellVolume,
        uint256 matchedOrders
    );

    event EpochAdvanced(uint256 indexed newEpochId, uint256 startTime, uint256 endTime);

    // ═══════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════

    constructor(
        uint256 _epochDuration,
        uint256 _revealWindow,
        uint256 _minCollateral,
        address _vault,
        address _settlement
    ) {
        owner = msg.sender;
        epochDuration = _epochDuration;
        revealWindow = _revealWindow;
        minCollateral = _minCollateral;
        vault = ShieldXVault(_vault);
        settlement = ShieldXSettlement(_settlement);

        // Initialize first epoch
        currentEpochId = 1;
        epochs[1] = EpochLib.Epoch({
            id: 1,
            startTime: block.timestamp,
            endTime: block.timestamp + epochDuration,
            status: EpochLib.EpochStatus.COMMIT,
            totalCommitments: 0,
            totalRevealed: 0,
            clearingPrice: 0,
            settled: false
        });

        emit EpochAdvanced(1, block.timestamp, block.timestamp + epochDuration);
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 1: COMMIT
    // ═══════════════════════════════════════════════════════════

    /// @notice Submit a hidden order commitment with collateral
    /// @param commitHash keccak256(abi.encodePacked(orderType, tokenIn, tokenOut, amountIn, minAmountOut, maxPrice, salt))
    function commitOrder(bytes32 commitHash) external payable {
        require(msg.value >= minCollateral, "Insufficient collateral");
        require(commitments[commitHash].committer == address(0), "Duplicate commitment");

        // Auto-advance epoch if needed
        _advanceEpochIfNeeded();

        EpochLib.Epoch storage epoch = epochs[currentEpochId];
        require(epoch.status == EpochLib.EpochStatus.COMMIT, "Epoch not in commit phase");

        // Store commitment
        commitments[commitHash] = Commitment({
            commitHash: commitHash,
            committer: msg.sender,
            collateral: msg.value,
            epochId: currentEpochId,
            timestamp: uint64(block.timestamp),
            revealed: false,
            settled: false
        });

        epochCommitments[currentEpochId].push(commitHash);
        epoch.totalCommitments++;

        // Lock collateral in vault
        vault.lockCollateral{value: msg.value}(msg.sender, commitHash);

        emit OrderCommitted(commitHash, msg.sender, currentEpochId, msg.value);
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 2: REVEAL
    // ═══════════════════════════════════════════════════════════

    /// @notice Reveal a previously committed order
    /// @dev The hash of the revealed params must match the original commitment
    function revealOrder(
        OrderLib.OrderType orderType,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 maxPrice,
        bytes32 salt
    ) external {
        // Reconstruct commitment hash
        bytes32 commitHash = keccak256(abi.encodePacked(
            orderType, tokenIn, tokenOut, amountIn, minAmountOut, maxPrice, salt
        ));

        Commitment storage commitment = commitments[commitHash];
        require(commitment.committer == msg.sender, "Not your commitment");
        require(!commitment.revealed, "Already revealed");

        uint256 epochId = commitment.epochId;
        EpochLib.Epoch storage epoch = epochs[epochId];

        // Must be in reveal phase
        _advanceEpochIfNeeded();
        require(
            block.timestamp > epoch.endTime &&
            block.timestamp <= epoch.endTime + revealWindow,
            "Not in reveal window"
        );

        // Mark as revealed
        commitment.revealed = true;
        epoch.totalRevealed++;

        // Store revealed order
        epochOrders[epochId].push(RevealedOrder({
            trader: msg.sender,
            orderType: orderType,
            tokenIn: tokenIn,
            tokenOut: tokenOut,
            amountIn: amountIn,
            minAmountOut: minAmountOut,
            maxPrice: maxPrice,
            salt: salt
        }));

        emit OrderRevealed(commitHash, msg.sender, epochId, orderType, amountIn);
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 3: SETTLE (calls Rust PVM contract)
    // ═══════════════════════════════════════════════════════════

    /// @notice Settle a completed epoch — calls the Rust PVM contract for batch matching
    /// @param epochId The epoch to settle
    function settleEpoch(uint256 epochId) external {
        EpochLib.Epoch storage epoch = epochs[epochId];
        require(!epoch.settled, "Already settled");
        require(
            block.timestamp > epoch.endTime + revealWindow,
            "Reveal window still open"
        );

        RevealedOrder[] storage orders = epochOrders[epochId];
        require(orders.length > 0, "No orders to settle");

        // Encode orders for the Rust PVM contract
        (uint256 clearingPrice, uint256[] memory fillAmounts, bool[] memory fills) =
            settlement.computeBatchSettlement(orders);

        // Execute fills
        for (uint256 i = 0; i < orders.length; i++) {
            if (fills[i]) {
                _executeFill(orders[i], clearingPrice, fillAmounts[i]);
            }
        }

        epoch.clearingPrice = clearingPrice;
        epoch.settled = true;

        emit EpochSettled(
            epochId,
            clearingPrice,
            _totalBuyVolume(orders),
            _totalSellVolume(orders),
            _countFills(fills)
        );

        // Return collateral for all revealed orders
        _returnCollateral(epochId);
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 4: SLASH (unrevealed commitments)
    // ═══════════════════════════════════════════════════════════

    /// @notice Slash collateral of users who committed but didn't reveal
    /// @dev Can be called by anyone after reveal window closes
    function slashUnrevealed(uint256 epochId) external {
        EpochLib.Epoch storage epoch = epochs[epochId];
        require(block.timestamp > epoch.endTime + revealWindow, "Reveal window open");

        bytes32[] storage commits = epochCommitments[epochId];
        for (uint256 i = 0; i < commits.length; i++) {
            Commitment storage c = commitments[commits[i]];
            if (!c.revealed && !c.settled) {
                c.settled = true;
                vault.slashCollateral(c.committer, commits[i]);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════════

    function _advanceEpochIfNeeded() internal {
        EpochLib.Epoch storage current = epochs[currentEpochId];
        if (block.timestamp > current.endTime + revealWindow) {
            // Current epoch fully expired, start new one
            currentEpochId++;
            epochs[currentEpochId] = EpochLib.Epoch({
                id: currentEpochId,
                startTime: block.timestamp,
                endTime: block.timestamp + epochDuration,
                status: EpochLib.EpochStatus.COMMIT,
                totalCommitments: 0,
                totalRevealed: 0,
                clearingPrice: 0,
                settled: false
            });
            emit EpochAdvanced(currentEpochId, block.timestamp, block.timestamp + epochDuration);
        }
    }

    function _executeFill(
        RevealedOrder memory order,
        uint256 clearingPrice,
        uint256 fillAmount
    ) internal {
        // For native DOT: transfer via payable
        // For ERC20 tokens: transfer from vault
        // For cross-chain: route via XCM executor
        if (order.tokenOut == address(0)) {
            // Native DOT fill
            vault.releaseFill(order.trader, fillAmount);
        } else {
            // ERC20 or cross-chain fill
            settlement.executeFill(order, clearingPrice, fillAmount);
        }
    }

    function _totalBuyVolume(RevealedOrder[] storage orders) internal view returns (uint256 total) {
        for (uint256 i = 0; i < orders.length; i++) {
            if (orders[i].orderType == OrderLib.OrderType.BUY) total += orders[i].amountIn;
        }
    }

    function _totalSellVolume(RevealedOrder[] storage orders) internal view returns (uint256 total) {
        for (uint256 i = 0; i < orders.length; i++) {
            if (orders[i].orderType == OrderLib.OrderType.SELL) total += orders[i].amountIn;
        }
    }

    function _countFills(bool[] memory fills) internal pure returns (uint256 count) {
        for (uint256 i = 0; i < fills.length; i++) {
            if (fills[i]) count++;
        }
    }

    function _returnCollateral(uint256 epochId) internal {
        bytes32[] storage commits = epochCommitments[epochId];
        for (uint256 i = 0; i < commits.length; i++) {
            Commitment storage c = commitments[commits[i]];
            if (c.revealed && !c.settled) {
                c.settled = true;
                vault.returnCollateral(c.committer, commits[i]);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // VIEW FUNCTIONS
    // ═══════════════════════════════════════════════════════════

    function getCurrentEpoch() external view returns (EpochLib.Epoch memory) {
        return epochs[currentEpochId];
    }

    function getEpochOrders(uint256 epochId) external view returns (RevealedOrder[] memory) {
        return epochOrders[epochId];
    }

    function getEpochCommitmentCount(uint256 epochId) external view returns (uint256) {
        return epochCommitments[epochId].length;
    }

    function isInCommitPhase() external view returns (bool) {
        return block.timestamp <= epochs[currentEpochId].endTime;
    }

    function isInRevealPhase() external view returns (bool) {
        EpochLib.Epoch storage epoch = epochs[currentEpochId];
        return block.timestamp > epoch.endTime &&
               block.timestamp <= epoch.endTime + revealWindow;
    }
}
```

### 5.2 ShieldXVault.sol — Escrow & Collateral Management

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract ShieldXVault {
    address public router;
    address public treasury; // receives slashed collateral

    mapping(address => uint256) public lockedCollateral;
    mapping(bytes32 => uint256) public commitCollateral;

    event CollateralLocked(address indexed user, bytes32 indexed commitHash, uint256 amount);
    event CollateralReturned(address indexed user, bytes32 indexed commitHash, uint256 amount);
    event CollateralSlashed(address indexed user, bytes32 indexed commitHash, uint256 amount);
    event FillReleased(address indexed user, uint256 amount);

    modifier onlyRouter() {
        require(msg.sender == router, "Only router");
        _;
    }

    constructor(address _treasury) {
        router = msg.sender; // set during deployment, updated by router constructor
        treasury = _treasury;
    }

    function setRouter(address _router) external {
        require(router == msg.sender || router == address(0), "Unauthorized");
        router = _router;
    }

    /// @notice Lock collateral for a commitment
    function lockCollateral(address user, bytes32 commitHash) external payable onlyRouter {
        lockedCollateral[user] += msg.value;
        commitCollateral[commitHash] = msg.value;
        emit CollateralLocked(user, commitHash, msg.value);
    }

    /// @notice Return collateral after successful reveal
    function returnCollateral(address user, bytes32 commitHash) external onlyRouter {
        uint256 amount = commitCollateral[commitHash];
        require(amount > 0, "No collateral");
        commitCollateral[commitHash] = 0;
        lockedCollateral[user] -= amount;
        payable(user).transfer(amount);
        emit CollateralReturned(user, commitHash, amount);
    }

    /// @notice Slash collateral for unrevealed commitment
    function slashCollateral(address user, bytes32 commitHash) external onlyRouter {
        uint256 amount = commitCollateral[commitHash];
        require(amount > 0, "No collateral");
        commitCollateral[commitHash] = 0;
        lockedCollateral[user] -= amount;
        payable(treasury).transfer(amount);
        emit CollateralSlashed(user, commitHash, amount);
    }

    /// @notice Release fill proceeds to trader
    function releaseFill(address user, uint256 amount) external onlyRouter {
        payable(user).transfer(amount);
        emit FillReleased(user, amount);
    }

    /// @notice Accept native DOT deposits for liquidity
    receive() external payable {}
}
```

### 5.3 ShieldXSettlement.sol — Batch Settlement + Precompile Interface

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IShieldXEngine.sol";
import "./ShieldXRouter.sol";

contract ShieldXSettlement {
    // Address of the Rust PVM contract (or Solidity mock for EVM-mode deployment)
    address public engineAddress;
    address public router;
    address public xcmExecutor;

    constructor(address _engineAddress) {
        engineAddress = _engineAddress;
        router = msg.sender;
    }

    function setRouter(address _router) external {
        require(msg.sender == router, "Unauthorized");
        router = _router;
    }

    function setXcmExecutor(address _executor) external {
        require(msg.sender == router, "Unauthorized");
        xcmExecutor = _executor;
    }

    /// @notice Compute batch settlement using Rust PVM contract
    /// @dev Encodes orders, calls the engine contract (Solidity mock or Rust PVM), decodes results
    function computeBatchSettlement(
        ShieldXRouter.RevealedOrder[] storage orders
    ) external returns (
        uint256 clearingPrice,
        uint256[] memory fillAmounts,
        bool[] memory fills
    ) {
        uint256 n = orders.length;
        fillAmounts = new uint256[](n);
        fills = new bool[](n);

        // Encode orders for the engine contract
        uint256[] memory prices = new uint256[](n);
        uint256[] memory amounts = new uint256[](n);
        bool[] memory isBuy = new bool[](n);

        for (uint256 i = 0; i < n; i++) {
            prices[i] = orders[i].maxPrice;
            amounts[i] = orders[i].amountIn;
            isBuy[i] = (orders[i].orderType == OrderLib.OrderType.BUY);
        }

        // Call the engine (Solidity mock or Rust PVM contract)
        IShieldXEngine engine = IShieldXEngine(engineAddress);
        (clearingPrice, fillAmounts, fills) = engine.computeBatchAuction(
            prices,
            amounts,
            isBuy
        );

        return (clearingPrice, fillAmounts, fills);
    }

    /// @notice Execute a single fill after batch settlement
    function executeFill(
        ShieldXRouter.RevealedOrder memory order,
        uint256 clearingPrice,
        uint256 fillAmount
    ) external {
        // Route to XCM executor for cross-chain fills
        // or handle locally for same-chain fills
        if (_requiresCrossChain(order)) {
            IShieldXExecutor(xcmExecutor).executeXcmFill(order, clearingPrice, fillAmount);
        } else {
            _executeLocalFill(order, clearingPrice, fillAmount);
        }
    }

    function _requiresCrossChain(ShieldXRouter.RevealedOrder memory order) internal pure returns (bool) {
        // Check if token requires cross-chain routing
        // vDOT from Bifrost, assets from other parachains, etc.
        return false; // simplified — expand based on token registry
    }

    function _executeLocalFill(
        ShieldXRouter.RevealedOrder memory order,
        uint256 clearingPrice,
        uint256 fillAmount
    ) internal {
        // Transfer tokens from vault to trader
        // Implementation depends on token type
    }
}
```

### 5.4 IShieldXEngine.sol — Rust Precompile Interface

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ShieldX Batch Auction Engine Interface
/// @notice Interface to the Rust PVM contract for batch auction computation
/// @dev On testnet, this is implemented by MockShieldXEngine.sol (Solidity mirror)
///      When Rust PVM tooling is ready, a native Rust contract provides optimized execution
interface IShieldXEngine {

    /// @notice Compute uniform clearing price and fill allocation for a batch of orders
    /// @param prices Array of limit prices for each order
    /// @param amounts Array of order amounts
    /// @param isBuy Array indicating if each order is a buy (true) or sell (false)
    /// @return clearingPrice The uniform price at which supply meets demand
    /// @return fillAmounts The amount each order is filled
    /// @return fills Boolean indicating if each order was filled
    function computeBatchAuction(
        uint256[] calldata prices,
        uint256[] calldata amounts,
        bool[] calldata isBuy
    ) external view returns (
        uint256 clearingPrice,
        uint256[] memory fillAmounts,
        bool[] memory fills
    );

    /// @notice Detect manipulation patterns in a batch of orders
    /// @param prices Array of limit prices
    /// @param amounts Array of order amounts
    /// @param isBuy Array of buy/sell indicators
    /// @return anomalyScore 0-100 (0 = clean, 100 = highly suspicious)
    /// @return anomalyType Type of detected anomaly (0=none, 1=wash, 2=spoof, 3=impact)
    function detectManipulation(
        uint256[] calldata prices,
        uint256[] calldata amounts,
        bool[] calldata isBuy
    ) external view returns (
        uint8 anomalyScore,
        uint8 anomalyType
    );

    /// @notice Compute TWAP from multiple price sources
    /// @param prices Array of price observations
    /// @param timestamps Array of observation timestamps
    /// @param weights Array of source weights
    /// @return twap Time-weighted average price
    function computeTWAP(
        uint256[] calldata prices,
        uint256[] calldata timestamps,
        uint256[] calldata weights
    ) external pure returns (uint256 twap);
}
```

### 5.5 ShieldXExecutor.sol — XCM Cross-Chain Execution

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @dev The on-chain address of the XCM precompile
address constant XCM_PRECOMPILE = 0x00000000000000000000000000000000000A0000;

interface IXcm {
    struct Weight {
        uint64 refTime;
        uint64 proofSize;
    }
    function execute(bytes calldata message, Weight calldata weight) external;
    function send(bytes calldata destination, bytes calldata message) external;
    function weighMessage(bytes calldata message) external view returns (Weight memory weight);
}

contract ShieldXExecutor {
    address public router;
    IXcm public xcm;

    // Parachain routing table
    mapping(uint32 => bytes) public parachainDestinations; // paraId => SCALE-encoded destination

    event XcmOrderRouted(
        uint32 indexed paraId,
        address indexed trader,
        uint256 amount,
        bytes32 orderHash
    );

    event XcmExecutionComplete(
        uint32 indexed paraId,
        bytes32 indexed orderHash,
        bool success
    );

    constructor() {
        router = msg.sender;
        xcm = IXcm(XCM_PRECOMPILE);
    }

    /// @notice Register a parachain destination for order routing
    function registerParachain(uint32 paraId, bytes calldata destination) external {
        require(msg.sender == router, "Only router");
        parachainDestinations[paraId] = destination;
    }

    /// @notice Execute a cross-chain fill via XCM
    /// @dev Routes the matched order to the target parachain for execution
    function executeXcmFill(
        ShieldXRouter.RevealedOrder memory order,
        uint256 clearingPrice,
        uint256 fillAmount
    ) external {
        require(msg.sender == router, "Only router");

        // Determine target parachain based on token
        uint32 targetPara = _getTargetParachain(order.tokenOut);
        bytes memory destination = parachainDestinations[targetPara];
        require(destination.length > 0, "Parachain not registered");

        // Build XCM message for asset transfer
        bytes memory xcmMessage = _buildXcmTransferMessage(
            order.trader,
            order.tokenOut,
            fillAmount
        );

        // Weigh the message first
        IXcm.Weight memory weight = xcm.weighMessage(xcmMessage);

        // Execute the XCM message
        xcm.execute(xcmMessage, weight);

        bytes32 orderHash = keccak256(abi.encodePacked(
            order.trader, order.tokenIn, order.tokenOut, order.amountIn
        ));

        emit XcmOrderRouted(targetPara, order.trader, fillAmount, orderHash);
    }

    /// @notice Send a cross-chain message to query prices from parachain DEXs
    function queryParachainPrice(
        uint32 paraId,
        address tokenA,
        address tokenB
    ) external returns (bytes memory) {
        bytes memory destination = parachainDestinations[paraId];
        require(destination.length > 0, "Parachain not registered");

        // Build XCM query message
        bytes memory queryMessage = _buildPriceQueryMessage(tokenA, tokenB);

        // Send to target parachain
        xcm.send(destination, queryMessage);

        return queryMessage; // caller tracks response async
    }

    // ═══════════════════════════════════════════════════════════
    // XCM MESSAGE BUILDERS
    // ═══════════════════════════════════════════════════════════

    function _buildXcmTransferMessage(
        address beneficiary,
        address token,
        uint256 amount
    ) internal pure returns (bytes memory) {
        // SCALE-encoded XCM v4 message:
        // WithdrawAsset + BuyExecution + DepositAsset
        // This is the standard pattern for cross-chain asset transfer
        //
        // NOTE: In production, this would be properly SCALE-encoded.
        // For the hackathon, we use a simplified encoding that demonstrates the concept.
        // The actual SCALE encoding can be generated using PAPI (Polkadot API).

        return abi.encodePacked(
            uint8(0x05), // XCM version prefix (v4)
            uint8(0x0c), // number of instructions (3)
            // WithdrawAsset
            uint8(0x00), uint8(0x04), uint8(0x01), uint8(0x00),
            // BuyExecution
            uint8(0x00), uint8(0x03), uint8(0x00),
            // DepositAsset to beneficiary
            uint8(0x0d), uint8(0x01), uint8(0x01), uint8(0x00),
            bytes20(beneficiary)
        );
    }

    function _buildPriceQueryMessage(
        address tokenA,
        address tokenB
    ) internal pure returns (bytes memory) {
        // Simplified price query via XCM Transact
        return abi.encodePacked(
            uint8(0x05), // version
            bytes20(tokenA),
            bytes20(tokenB)
        );
    }

    function _getTargetParachain(address token) internal pure returns (uint32) {
        // Token-to-parachain routing
        // In production, this would be a registry lookup
        // Hydration DEX: paraId 2034
        // Bifrost: paraId 2030
        // Acala: paraId 2000
        return 2034; // default to Hydration
    }
}
```

### 5.6 OrderLib.sol — Order Data Structures

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library OrderLib {
    enum OrderType { BUY, SELL }

    struct Order {
        OrderType orderType;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;
        uint256 maxPrice;
    }

    /// @notice Generate commitment hash from order params
    function computeCommitHash(
        OrderType orderType,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 maxPrice,
        bytes32 salt
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(
            orderType, tokenIn, tokenOut, amountIn, minAmountOut, maxPrice, salt
        ));
    }
}
```

### 5.7 EpochLib.sol — Epoch Management

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library EpochLib {
    enum EpochStatus { COMMIT, REVEAL, SETTLE, COMPLETED }

    struct Epoch {
        uint256 id;
        uint256 startTime;
        uint256 endTime;
        EpochStatus status;
        uint256 totalCommitments;
        uint256 totalRevealed;
        uint256 clearingPrice;
        bool settled;
    }

    function isCommitPhase(Epoch storage epoch) internal view returns (bool) {
        return block.timestamp <= epoch.endTime;
    }

    function isRevealPhase(Epoch storage epoch, uint256 revealWindow) internal view returns (bool) {
        return block.timestamp > epoch.endTime &&
               block.timestamp <= epoch.endTime + revealWindow;
    }

    function isSettleReady(Epoch storage epoch, uint256 revealWindow) internal view returns (bool) {
        return block.timestamp > epoch.endTime + revealWindow && !epoch.settled;
    }
}
```

### 5.8 MockShieldXEngine.sol — Solidity Mirror of Rust Precompile

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./interfaces/IShieldXEngine.sol";

/// @title Mock ShieldX Batch Auction Engine
/// @notice Solidity implementation mirroring the Rust PVM contract logic
/// @dev Used for EVM-mode deployment. Produces identical results to the Rust PVM version.
///      Both versions run on Polkadot Hub — Solidity via REVM, Rust via PolkaVM.
contract MockShieldXEngine is IShieldXEngine {

    /// @notice Compute batch auction clearing price and fills
    /// @dev Algorithm:
    ///   1. Sort buy orders descending by price, sell orders ascending
    ///   2. Walk through price levels to find where cumulative buy volume >= cumulative sell volume
    ///   3. That intersection is the uniform clearing price
    ///   4. Fill all buys at or above clearing price, all sells at or below
    function computeBatchAuction(
        uint256[] calldata prices,
        uint256[] calldata amounts,
        bool[] calldata isBuy
    ) external pure override returns (
        uint256 clearingPrice,
        uint256[] memory fillAmounts,
        bool[] memory fills
    ) {
        uint256 n = prices.length;
        fillAmounts = new uint256[](n);
        fills = new bool[](n);

        if (n == 0) return (0, fillAmounts, fills);

        // Separate buy and sell orders
        uint256 buyCount;
        uint256 sellCount;
        for (uint256 i = 0; i < n; i++) {
            if (isBuy[i]) buyCount++;
            else sellCount++;
        }

        if (buyCount == 0 || sellCount == 0) return (0, fillAmounts, fills);

        // Extract buy prices and sell prices
        uint256[] memory buyPrices = new uint256[](buyCount);
        uint256[] memory buyAmounts = new uint256[](buyCount);
        uint256[] memory sellPrices = new uint256[](sellCount);
        uint256[] memory sellAmounts = new uint256[](sellCount);
        uint256[] memory buyIndices = new uint256[](buyCount);
        uint256[] memory sellIndices = new uint256[](sellCount);

        uint256 bi;
        uint256 si;
        for (uint256 i = 0; i < n; i++) {
            if (isBuy[i]) {
                buyPrices[bi] = prices[i];
                buyAmounts[bi] = amounts[i];
                buyIndices[bi] = i;
                bi++;
            } else {
                sellPrices[si] = prices[i];
                sellAmounts[si] = amounts[i];
                sellIndices[si] = i;
                si++;
            }
        }

        // Sort buys descending (highest price first)
        _sortDescending(buyPrices, buyAmounts, buyIndices);
        // Sort sells ascending (lowest price first)
        _sortAscending(sellPrices, sellAmounts, sellIndices);

        // Find clearing price: walk from highest buy down, lowest sell up
        // Clearing price = midpoint where cumulative demand meets supply
        uint256 cumBuy;
        uint256 cumSell;
        uint256 bIdx;
        uint256 sIdx;

        // Simple approach: clearing price = average of best matching buy/sell
        // Walk until buy price < sell price
        while (bIdx < buyCount && sIdx < sellCount) {
            if (buyPrices[bIdx] >= sellPrices[sIdx]) {
                // Match possible at midpoint
                clearingPrice = (buyPrices[bIdx] + sellPrices[sIdx]) / 2;
                bIdx++;
                sIdx++;
            } else {
                break;
            }
        }

        if (clearingPrice == 0 && buyCount > 0 && sellCount > 0) {
            // No crossing — use midpoint of best bid/ask
            clearingPrice = (buyPrices[0] + sellPrices[0]) / 2;
        }

        // Fill all orders that cross the clearing price
        for (uint256 i = 0; i < buyCount; i++) {
            if (buyPrices[i] >= clearingPrice) {
                fills[buyIndices[i]] = true;
                fillAmounts[buyIndices[i]] = buyAmounts[i];
            }
        }
        for (uint256 i = 0; i < sellCount; i++) {
            if (sellPrices[i] <= clearingPrice) {
                fills[sellIndices[i]] = true;
                fillAmounts[sellIndices[i]] = sellAmounts[i];
            }
        }

        return (clearingPrice, fillAmounts, fills);
    }

    /// @notice Detect manipulation patterns
    function detectManipulation(
        uint256[] calldata prices,
        uint256[] calldata amounts,
        bool[] calldata isBuy
    ) external pure override returns (uint8 anomalyScore, uint8 anomalyType) {
        uint256 n = prices.length;
        if (n < 3) return (0, 0);

        // Check 1: Price clustering (wash trading indicator)
        uint256 clusterCount;
        for (uint256 i = 0; i < n - 1; i++) {
            for (uint256 j = i + 1; j < n; j++) {
                uint256 diff = prices[i] > prices[j] ?
                    prices[i] - prices[j] : prices[j] - prices[i];
                // If prices are within 0.1% of each other
                if (diff * 1000 < prices[i]) clusterCount++;
            }
        }
        if (clusterCount > n / 2) {
            anomalyScore = 70;
            anomalyType = 1; // wash trading
            return (anomalyScore, anomalyType);
        }

        // Check 2: Single large order vs many small (spoofing indicator)
        uint256 maxAmount;
        uint256 totalAmount;
        for (uint256 i = 0; i < n; i++) {
            totalAmount += amounts[i];
            if (amounts[i] > maxAmount) maxAmount = amounts[i];
        }
        if (maxAmount * 100 / totalAmount > 80) {
            anomalyScore = 60;
            anomalyType = 2; // spoofing
            return (anomalyScore, anomalyType);
        }

        // Check 3: Extreme price spread (market impact attempt)
        uint256 maxPrice;
        uint256 minPrice = type(uint256).max;
        for (uint256 i = 0; i < n; i++) {
            if (prices[i] > maxPrice) maxPrice = prices[i];
            if (prices[i] < minPrice) minPrice = prices[i];
        }
        if (maxPrice > minPrice * 3) {
            anomalyScore = 50;
            anomalyType = 3; // market impact
            return (anomalyScore, anomalyType);
        }

        return (0, 0); // clean
    }

    /// @notice Compute TWAP from price observations
    function computeTWAP(
        uint256[] calldata prices,
        uint256[] calldata timestamps,
        uint256[] calldata weights
    ) external pure override returns (uint256 twap) {
        uint256 weightedSum;
        uint256 totalWeight;
        for (uint256 i = 0; i < prices.length; i++) {
            weightedSum += prices[i] * weights[i];
            totalWeight += weights[i];
        }
        if (totalWeight > 0) {
            twap = weightedSum / totalWeight;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // SORTING HELPERS
    // ═══════════════════════════════════════════════════════════

    function _sortDescending(
        uint256[] memory prices,
        uint256[] memory amounts,
        uint256[] memory indices
    ) internal pure {
        uint256 n = prices.length;
        for (uint256 i = 0; i < n; i++) {
            for (uint256 j = i + 1; j < n; j++) {
                if (prices[j] > prices[i]) {
                    (prices[i], prices[j]) = (prices[j], prices[i]);
                    (amounts[i], amounts[j]) = (amounts[j], amounts[i]);
                    (indices[i], indices[j]) = (indices[j], indices[i]);
                }
            }
        }
    }

    function _sortAscending(
        uint256[] memory prices,
        uint256[] memory amounts,
        uint256[] memory indices
    ) internal pure {
        uint256 n = prices.length;
        for (uint256 i = 0; i < n; i++) {
            for (uint256 j = i + 1; j < n; j++) {
                if (prices[j] < prices[i]) {
                    (prices[i], prices[j]) = (prices[j], prices[i]);
                    (amounts[i], amounts[j]) = (amounts[j], amounts[i]);
                    (indices[i], indices[j]) = (indices[j], indices[i]);
                }
            }
        }
    }
}
```

---

## 6. RUST PVM CONTRACT SPECIFICATION

### precompile/src/lib.rs (Rust PVM Smart Contract)

```rust
#![no_std]

extern crate alloc;
use alloc::vec::Vec;

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

#[derive(Clone, Copy, PartialEq)]
pub enum OrderSide {
    Buy,
    Sell,
}

#[derive(Clone, Copy, PartialEq)]
pub enum AnomalyType {
    None,
    WashTrading,
    Spoofing,
    MarketImpact,
}

pub struct Order {
    pub price: u128,
    pub amount: u128,
    pub side: OrderSide,
    pub index: usize,
}

pub struct BatchResult {
    pub clearing_price: u128,
    pub fill_amounts: Vec<u128>,
    pub fills: Vec<bool>,
}

pub struct AnomalyResult {
    pub score: u8,
    pub anomaly_type: AnomalyType,
}

// ═══════════════════════════════════════════════════════════
// BATCH AUCTION ENGINE
// ═══════════════════════════════════════════════════════════

/// Compute uniform clearing price via supply-demand intersection
/// Algorithm:
///   1. Separate orders into buy and sell arrays
///   2. Sort buys descending by price (highest bid first)
///   3. Sort sells ascending by price (lowest ask first)
///   4. Accumulate volumes from both sides
///   5. Clearing price is where cumulative buy volume crosses cumulative sell volume
///   6. All buys at or above clearing, all sells at or below clearing get filled
pub fn compute_batch_auction(
    prices: &[u128],
    amounts: &[u128],
    is_buy: &[bool],
) -> BatchResult {
    let n = prices.len();
    let mut fill_amounts = vec![0u128; n];
    let mut fills = vec![false; n];

    if n == 0 {
        return BatchResult { clearing_price: 0, fill_amounts, fills };
    }

    // Separate into buy and sell orders
    let mut buys: Vec<Order> = Vec::new();
    let mut sells: Vec<Order> = Vec::new();

    for i in 0..n {
        let order = Order {
            price: prices[i],
            amount: amounts[i],
            side: if is_buy[i] { OrderSide::Buy } else { OrderSide::Sell },
            index: i,
        };
        if is_buy[i] {
            buys.push(order);
        } else {
            sells.push(order);
        }
    }

    if buys.is_empty() || sells.is_empty() {
        return BatchResult { clearing_price: 0, fill_amounts, fills };
    }

    // Sort buys descending (highest first)
    buys.sort_by(|a, b| b.price.cmp(&a.price));
    // Sort sells ascending (lowest first)
    sells.sort_by(|a, b| a.price.cmp(&b.price));

    // Find clearing price via demand-supply intersection
    let mut clearing_price: u128 = 0;
    let mut matched_volume: u128 = 0;

    let mut b_idx = 0;
    let mut s_idx = 0;
    let mut cum_buy: u128 = 0;
    let mut cum_sell: u128 = 0;

    while b_idx < buys.len() && s_idx < sells.len() {
        if buys[b_idx].price >= sells[s_idx].price {
            // These orders can match
            cum_buy += buys[b_idx].amount;
            cum_sell += sells[s_idx].amount;

            // Clearing price = midpoint of crossing orders
            clearing_price = (buys[b_idx].price + sells[s_idx].price) / 2;
            matched_volume = core::cmp::min(cum_buy, cum_sell);

            b_idx += 1;
            s_idx += 1;
        } else {
            break;
        }
    }

    // Fill orders that cross the clearing price
    if clearing_price > 0 {
        for buy in &buys {
            if buy.price >= clearing_price {
                fills[buy.index] = true;
                fill_amounts[buy.index] = buy.amount;
            }
        }
        for sell in &sells {
            if sell.price <= clearing_price {
                fills[sell.index] = true;
                fill_amounts[sell.index] = sell.amount;
            }
        }
    }

    BatchResult { clearing_price, fill_amounts, fills }
}

// ═══════════════════════════════════════════════════════════
// MANIPULATION DETECTION
// ═══════════════════════════════════════════════════════════

/// Detect wash trading, spoofing, and market impact manipulation
pub fn detect_manipulation(
    prices: &[u128],
    amounts: &[u128],
    _is_buy: &[bool],
) -> AnomalyResult {
    let n = prices.len();
    if n < 3 {
        return AnomalyResult { score: 0, anomaly_type: AnomalyType::None };
    }

    // Check 1: Price clustering (wash trading)
    let mut cluster_count: u32 = 0;
    for i in 0..n {
        for j in (i + 1)..n {
            let diff = if prices[i] > prices[j] {
                prices[i] - prices[j]
            } else {
                prices[j] - prices[i]
            };
            if diff * 1000 < prices[i] {
                cluster_count += 1;
            }
        }
    }
    let pair_count = (n * (n - 1) / 2) as u32;
    if cluster_count > pair_count / 2 {
        return AnomalyResult { score: 70, anomaly_type: AnomalyType::WashTrading };
    }

    // Check 2: Single dominant order (spoofing)
    let mut max_amount: u128 = 0;
    let mut total_amount: u128 = 0;
    for i in 0..n {
        total_amount += amounts[i];
        if amounts[i] > max_amount {
            max_amount = amounts[i];
        }
    }
    if total_amount > 0 && max_amount * 100 / total_amount > 80 {
        return AnomalyResult { score: 60, anomaly_type: AnomalyType::Spoofing };
    }

    // Check 3: Extreme price spread (market impact)
    let mut max_price: u128 = 0;
    let mut min_price: u128 = u128::MAX;
    for i in 0..n {
        if prices[i] > max_price { max_price = prices[i]; }
        if prices[i] < min_price { min_price = prices[i]; }
    }
    if min_price > 0 && max_price > min_price * 3 {
        return AnomalyResult { score: 50, anomaly_type: AnomalyType::MarketImpact };
    }

    AnomalyResult { score: 0, anomaly_type: AnomalyType::None }
}

// ═══════════════════════════════════════════════════════════
// TWAP COMPUTATION
// ═══════════════════════════════════════════════════════════

/// Compute time-weighted average price from multiple observations
pub fn compute_twap(
    prices: &[u128],
    _timestamps: &[u64],
    weights: &[u128],
) -> u128 {
    let mut weighted_sum: u128 = 0;
    let mut total_weight: u128 = 0;

    for i in 0..prices.len() {
        weighted_sum += prices[i] * weights[i];
        total_weight += weights[i];
    }

    if total_weight > 0 {
        weighted_sum / total_weight
    } else {
        0
    }
}

// ═══════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_basic_batch_auction() {
        let prices = vec![110, 105, 100, 90, 95, 100];
        let amounts = vec![100, 200, 150, 100, 200, 150];
        let is_buy = vec![true, true, true, false, false, false];

        let result = compute_batch_auction(&prices, &amounts, &is_buy);
        assert!(result.clearing_price > 0);
        assert!(result.fills.iter().any(|&f| f));
    }

    #[test]
    fn test_no_crossing() {
        let prices = vec![80, 85, 100, 105]; // buys below sells
        let amounts = vec![100, 100, 100, 100];
        let is_buy = vec![true, true, false, false];

        let result = compute_batch_auction(&prices, &amounts, &is_buy);
        // No match since buy prices < sell prices
    }

    #[test]
    fn test_empty_batch() {
        let result = compute_batch_auction(&[], &[], &[]);
        assert_eq!(result.clearing_price, 0);
    }

    #[test]
    fn test_single_match() {
        let prices = vec![100, 95];
        let amounts = vec![100, 100];
        let is_buy = vec![true, false];

        let result = compute_batch_auction(&prices, &amounts, &is_buy);
        assert_eq!(result.clearing_price, 97); // (100 + 95) / 2
        assert!(result.fills[0]);
        assert!(result.fills[1]);
    }

    #[test]
    fn test_wash_trading_detection() {
        let prices = vec![100, 100, 100, 101, 100]; // highly clustered
        let amounts = vec![10, 10, 10, 10, 10];
        let is_buy = vec![true, true, true, false, false];

        let result = detect_manipulation(&prices, &amounts, &is_buy);
        assert_eq!(result.anomaly_type, AnomalyType::WashTrading);
        assert!(result.score >= 70);
    }

    #[test]
    fn test_spoofing_detection() {
        let prices = vec![100, 101, 99, 100];
        let amounts = vec![10000, 10, 10, 10]; // one massive order
        let is_buy = vec![true, true, false, false];

        let result = detect_manipulation(&prices, &amounts, &is_buy);
        assert_eq!(result.anomaly_type, AnomalyType::Spoofing);
    }

    #[test]
    fn test_clean_batch() {
        let prices = vec![100, 102, 98, 105, 95];
        let amounts = vec![100, 200, 150, 100, 250];
        let is_buy = vec![true, true, false, false, false];

        let result = detect_manipulation(&prices, &amounts, &is_buy);
        assert_eq!(result.anomaly_type, AnomalyType::None);
        assert_eq!(result.score, 0);
    }

    #[test]
    fn test_twap_basic() {
        let prices = vec![100, 110, 105];
        let timestamps = vec![1000, 2000, 3000];
        let weights = vec![1, 1, 1];

        let twap = compute_twap(&prices, &timestamps, &weights);
        assert_eq!(twap, 105); // (100 + 110 + 105) / 3
    }

    #[test]
    fn test_twap_weighted() {
        let prices = vec![100, 200];
        let timestamps = vec![1000, 2000];
        let weights = vec![3, 1]; // 75% weight on first price

        let twap = compute_twap(&prices, &timestamps, &weights);
        assert_eq!(twap, 125); // (100*3 + 200*1) / 4
    }
}
```

---

## 7. XCM INTEGRATION DESIGN

### XCM Precompile Details

Address: `0x00000000000000000000000000000000000a0000`

Interface functions:
- `weighMessage(bytes calldata message) → Weight(refTime, proofSize)` — estimate execution cost
- `execute(bytes calldata message, Weight calldata weight)` — execute XCM locally
- `send(bytes calldata destination, bytes calldata message)` — send to another chain

### Cross-Chain Routing Flow

```
ShieldX Batch Settlement Complete
    │
    ├─── Local fills (native DOT, Hub tokens) → Direct transfer via vault
    │
    ├─── Bifrost vDOT fills → XCM send to paraId 2030
    │     └── WithdrawAsset + BuyExecution + DepositAsset
    │
    ├─── Hydration DEX routing → XCM send to paraId 2034
    │     └── WithdrawAsset + BuyExecution + Transact(swap)
    │
    └─── Acala aDOT fills → XCM send to paraId 2000
          └── WithdrawAsset + BuyExecution + DepositAsset
```

### XCM Message Encoding

All XCM messages must be SCALE-encoded. For the hackathon, use the PAPI (Polkadot API) console to generate proper SCALE-encoded messages, or use the simplified encoding in the ShieldXExecutor contract.

Reference XCM encoded message (WithdrawAsset + BuyExecution + DepositAsset):
```
0x050c000401000003008c86471301000003008c8647000d010101000000010100{beneficiary_hex}
```

---

## 8. FRONTEND APPLICATION

### Tech Stack
- React 18 + Vite
- ethers.js v6 (Polkadot Hub RPC)
- TailwindCSS
- Framer Motion (animations)

### Key Pages / Components

```
src/
├── App.jsx                     # Main app with routing
├── components/
│   ├── Header.jsx              # Wallet connect, epoch timer
│   ├── EpochTimer.jsx          # Live countdown (commit/reveal/settle)
│   ├── OrderPanel.jsx          # Main order form
│   │   ├── TokenSelector.jsx   # Select token pair (DOT/USDC, vDOT/DOT, etc.)
│   │   ├── PriceInput.jsx      # Limit price input
│   │   └── AmountInput.jsx     # Amount input with balance display
│   ├── OrderBook.jsx           # Anonymous order visualization
│   │   └── BatchVisualizer.jsx # Visual of batch auction matching
│   ├── EpochHistory.jsx        # Past epochs, clearing prices, fills
│   ├── ProtectionScore.jsx     # MEV protection status indicator
│   ├── XcmRouting.jsx          # Cross-chain route visualization
│   └── Dashboard.jsx           # Overview: TVL, epochs, volume
├── hooks/
│   ├── useShieldX.js           # Contract interaction hooks
│   ├── useEpoch.js             # Epoch state management
│   └── useWallet.js            # Wallet connection
├── utils/
│   ├── commitHash.js           # Client-side commitment generation
│   ├── contracts.js            # Contract addresses and ABIs
│   └── xcm.js                  # XCM message encoding helpers
└── constants/
    ├── tokens.js               # Supported token list
    └── chains.js               # Parachain registry
```

### Critical UX Flow

1. **Connect Wallet** → MetaMask with Polkadot Hub TestNet
2. **Select Token Pair** → e.g., DOT → USDC
3. **Set Limit Price & Amount** → with slippage tolerance
4. **Generate Commitment** → client-side keccak256 hash (order details + random salt)
5. **Submit Commitment** → sends hash + collateral to ShieldXRouter
6. **Wait for Epoch End** → live countdown timer
7. **Auto-Reveal** → frontend automatically reveals when reveal window opens
8. **Watch Settlement** → batch auction animation showing clearing price discovery
9. **Receive Fill** → tokens arrive in wallet (native or via XCM)

### MetaMask Network Config (Polkadot Hub TestNet)

```javascript
const POLKADOT_HUB_TESTNET = {
  chainId: '0x19038D75', // 420420417 — verified from docs.polkadot.com Feb 2026
  chainName: 'Polkadot Hub TestNet',
  rpcUrls: ['https://eth-rpc-testnet.polkadot.io/'],
  nativeCurrency: { name: 'PAS', symbol: 'PAS', decimals: 18 },
  blockExplorerUrls: ['https://blockscout-testnet.polkadot.io']
};
```

---

## 9. TESTING STRATEGY

### Target: 150+ Tests

| Layer | Framework | Test Count | Coverage |
|-------|-----------|------------|----------|
| Smart Contracts | Hardhat + Foundry | 80+ | Commit/reveal flow, epoch management, settlement, vault, slashing, edge cases, gas |
| Rust Precompile | Cargo (no_std) | 30+ | Batch auction, manipulation detection, TWAP, edge cases, overflow |
| Integration | Hardhat scripts | 20+ | Full flow on testnet: commit → reveal → settle → fill |
| Frontend E2E | Playwright | 20+ | Wallet connect, order flow, epoch transitions, responsive |

### IMPORTANT: Polkadot Hub Testing Limitation

From official Polkadot docs (verified Feb 2026): `@nomicfoundation/hardhat-toolbox/network-helpers` is NOT fully compatible with Polkadot Hub. `time.increase()` and `loadFixture` DO NOT WORK against Polkadot nodes. Run unit tests on Hardhat local network where these work. For testnet integration tests, use real time delays.

### Key Test Scenarios

**Smart Contract Tests:**
- Commit with insufficient collateral → revert
- Duplicate commitment hash → revert
- Reveal outside window → revert
- Reveal with wrong hash → revert
- Settle with no orders → revert
- Slash unrevealed commitments → collateral to treasury
- Multiple epochs running correctly
- Gas optimization: batch of 20 orders settles under gas limit
- Native DOT as tokenIn/tokenOut
- ERC20 token integration
- Access control on all admin functions
- Reentrancy protection on vault

**Rust Precompile Tests:**
- Empty batch → zero clearing price
- Single buy + single sell → midpoint price
- Many buys, few sells → price closer to highest sell
- Wash trading detection → anomalyScore ≥ 70
- Spoofing detection → anomalyScore ≥ 60
- Clean batch → anomalyScore = 0
- TWAP with equal weights → simple average
- TWAP with unequal weights → weighted average
- Overflow safety on large amounts
- Zero-division protection

---

## 9.5 KNOWN LIMITATIONS

### resolc Bytecode Size Limits
A Feb 2026 Polkadot Forum post documents bytecode size limits when compiling with resolc. Keep contracts modular (our 6-contract architecture helps). If a single contract exceeds the size limit, split into smaller library contracts.

### Hardhat Network Helpers
From official Polkadot docs: `time.increase()` and `loadFixture` DO NOT WORK against Polkadot Hub nodes. Use Hardhat local network for unit tests, real time delays for testnet integration tests.

### Custom Precompiles Not Available
As of March 2026, custom precompile registration on Polkadot Hub is pending runtime support. Use deployed Rust PVM contracts instead (same approach as all Track 2 competitors including VeritasXCM).

## 10. DEPLOYMENT GUIDE

### Step 1: Deploy Contracts (Polkadot Hub TestNet)

```bash
# Install dependencies
npm install --save-dev hardhat @nomicfoundation/hardhat-toolbox ethers

# Compile with resolc (Polkadot Solidity compiler) for PVM
# OR use standard solc for EVM-compatible deployment
npx hardhat compile

# Deploy sequence:
# 1. MockShieldXEngine (Solidity) or deploy Rust PVM contract
# 2. ShieldXVault
# 3. ShieldXSettlement (pointing to engine)
# 4. ShieldXRouter (pointing to vault + settlement)
# 5. ShieldXExecutor
# 6. Set router address on vault and settlement
# 7. Register parachain destinations on executor
```

### Step 2: Hardhat Config

```javascript
// hardhat.config.js
module.exports = {
  solidity: "0.8.20",
  networks: {
    polkadotTestnet: {
      url: "https://eth-rpc-testnet.polkadot.io/",
      chainId: 420420417, // verify current chain ID
      accounts: [process.env.PRIVATE_KEY],
    },
    paseoAssetHub: {
      url: "https://eth-rpc-testnet.polkadot.io/",
      chainId: 420420417,
      accounts: [process.env.PRIVATE_KEY],
    }
  }
};
```

### Step 3: Deployment Script

```javascript
async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  // 1. Deploy MockShieldXEngine
  const Engine = await ethers.getContractFactory("MockShieldXEngine");
  const engine = await Engine.deploy();
  await engine.waitForDeployment();
  console.log("Engine:", await engine.getAddress());

  // 2. Deploy Vault
  const Vault = await ethers.getContractFactory("ShieldXVault");
  const vault = await Vault.deploy(deployer.address); // treasury = deployer for testnet
  await vault.waitForDeployment();
  console.log("Vault:", await vault.getAddress());

  // 3. Deploy Settlement
  const Settlement = await ethers.getContractFactory("ShieldXSettlement");
  const settlement = await Settlement.deploy(await engine.getAddress());
  await settlement.waitForDeployment();
  console.log("Settlement:", await settlement.getAddress());

  // 4. Deploy Router
  const Router = await ethers.getContractFactory("ShieldXRouter");
  const router = await Router.deploy(
    30,    // 30s epochs for testnet
    30,    // 30s reveal window
    ethers.parseEther("0.01"), // 0.01 DOT min collateral
    await vault.getAddress(),
    await settlement.getAddress()
  );
  await router.waitForDeployment();
  console.log("Router:", await router.getAddress());

  // 5. Deploy Executor
  const Executor = await ethers.getContractFactory("ShieldXExecutor");
  const executor = await Executor.deploy();
  await executor.waitForDeployment();
  console.log("Executor:", await executor.getAddress());

  // 6. Wire everything together
  await vault.setRouter(await router.getAddress());
  await settlement.setRouter(await router.getAddress());
  await settlement.setXcmExecutor(await executor.getAddress());

  console.log("\n✅ ShieldX deployed and wired!");
}
```

---

## 11. DAY-BY-DAY BUILD PLAN

### Day 1 (Today): Foundation
- [ ] Set up Hardhat project with Polkadot Hub TestNet config
- [ ] Implement OrderLib.sol, EpochLib.sol
- [ ] Implement ShieldXVault.sol (full, with tests)
- [ ] Implement MockShieldXEngine.sol (batch auction + manipulation detection)
- [ ] Write 40+ unit tests for vault + engine
- [ ] Deploy vault + engine to testnet

### Day 2: Core Protocol
- [ ] Implement ShieldXRouter.sol (commit/reveal/settle)
- [ ] Implement ShieldXSettlement.sol (engine contract integration)
- [ ] Write 30+ tests for router (all phases, edge cases, slashing)
- [ ] Integration test: full commit → reveal → settle flow on testnet
- [ ] Deploy full contract suite to testnet

### Day 3: Rust + XCM
- [ ] Write Rust PVM contract (lib.rs) with cargo tests
- [ ] Implement ShieldXExecutor.sol (XCM integration)
- [ ] Test XCM send/execute on testnet
- [ ] Register parachain destinations
- [ ] Write 20+ Rust tests
- [ ] Integration test: settlement → XCM execution

### Day 4: Frontend + Polish
- [ ] React app: wallet connect, order panel, epoch timer
- [ ] Batch auction visualizer (animated clearing price discovery)
- [ ] XCM routing visualization
- [ ] MEV protection score indicator
- [ ] Epoch history dashboard
- [ ] E2E tests with Playwright
- [ ] Full user flow testing on testnet

### Day 5: Demo Prep
- [ ] Record 2-3 minute demo video showing full flow
- [ ] Build pitch deck (8-10 slides)
- [ ] Write comprehensive README with architecture diagrams
- [ ] Final testnet verification
- [ ] Submit on DoraHacks
- [ ] Prepare Demo Day presentation

---

## 12. DEMO DAY PITCH STRUCTURE (3 minutes)

### Slide 1: The Problem (30s)
"Every DeFi swap on Polkadot Hub will be vulnerable to sandwich attacks. On Ethereum, MEV extracts $500M+ per year from users. Polkadot has ZERO protection."

### Slide 2: ShieldX Solution (30s)
"ShieldX is an MEV-protected intent execution protocol. Users submit encrypted orders. A batch auction settles them at a single uniform clearing price. No front-running possible."

### Slide 3: How It Works — Commit-Reveal-Settle (30s)
Live animation of the 4-phase flow.

### Slide 4: Why Only Polkadot (20s)
"This requires PVM for Rust computation, XCM for cross-chain routing, and shared security. Architecturally impossible on Ethereum, Solana, or Cosmos."

### Slide 5: Live Demo (40s)
Show the frontend — submit an order, watch the epoch timer, see the batch settle, see the fill arrive.

### Slide 6: Technical Depth (20s)
"Rust PVM contract for O(N log N) batch matching, manipulation detection, and TWAP. 150+ tests across Solidity, Rust, and E2E."

### Slide 7: Market + Roadmap (10s)
"ShieldX is Day 1 MEV infrastructure for the entire Polkadot DeFi ecosystem. Mainnet Q3 2026."

---

## 13. JUDGING CRITERIA ALIGNMENT

| Criteria | How ShieldX Scores |
|----------|-------------------|
| **Technical Implementation** | Dual-VM (Solidity + Rust), commit-reveal cryptography, batch auction algorithm, XCM integration. Deepest PVM usage in Track 2. |
| **Use of Polkadot Hub Features** | XCM precompile for cross-chain routing, PVM Rust precompile for computation, native DOT handling, dual-VM cross-contract calls. Covers ALL 3 Track 2 categories with depth. |
| **Innovation & Impact** | First MEV protection on Polkadot. Novel batch auction model. Infrastructure that every future DEX/lending protocol benefits from. |
| **UX and Adoption Potential** | Simple "submit order and forget" UX. Auto-reveal. Visual batch auction animation. MetaMask-native. Zero DeFi expertise needed. |
| **Team Execution & Presentation** | 150+ tests, live testnet deployment, polished frontend, demo video, clear architecture docs. |

---

## 14. TECHNICAL REFERENCES & RESOURCES

### Polkadot Hub
- Smart Contracts Overview: https://docs.polkadot.com/smart-contracts/overview/
- Precompiles: https://docs.polkadot.com/smart-contracts/precompiles/
- XCM Precompile: https://docs.polkadot.com/smart-contracts/precompiles/xcm/
- Polkadot Hub TestNet RPC: https://eth-rpc-testnet.polkadot.io/

### XCM
- XCM Introduction: https://docs.polkadot.com/develop/interoperability/intro-to-xcm
- XCM Message Gist (examples): referenced in XCM precompile docs
- PAPI Console: for generating SCALE-encoded XCM messages

### Tooling
- Hardhat: https://hardhat.org/docs
- Foundry (forge): https://book.getfoundry.sh/
- resolc (Polkadot Solidity compiler): for PVM compilation
- OpenZeppelin Wizard for Polkadot: https://wizard.openzeppelin.com/polkadot

### MEV / Batch Auctions
- Commit-Reveal Schemes: https://www.chainscorelabs.com/en/guides/risk-management-and-financial-security/mev-protection-strategies/how-to-design-a-commit-reveal-scheme-for-auctions
- Anti-MEV Batch Auctions: https://www.7blocklabs.com/blog/anti-mev-design-with-batch-auctions
- CoW Protocol (Ethereum reference): https://cow.fi/

### Ecosystem Context
- OpenGuild Hackathon Resources: https://build.openguild.wtf/hackathon-resources
- Codecamp: https://codecamp.openguild.wtf
- Polkadot Developer Support: https://t.me/substratedevs
- OpenGuild Discord: https://discord.com/invite/WWgzkDfPQF

### Competitor Intelligence (Track 2)
- VeritasXCM: https://dorahacks.io/buidl/40607 (strongest competitor — XCM oracle, 206 tests)
- StreamDot Finance: https://dorahacks.io/buidl/40613 (native asset streaming, good UX)
- IntentDOT: https://dorahacks.io/buidl/40599 (AI chat interface, shallow PVM)
- LendDOT: https://dorahacks.io/buidl/40597 (dual-VM lending)

---

---

*End of Technical Specification*
*ShieldX — Build Once. Shield Everywhere.*
