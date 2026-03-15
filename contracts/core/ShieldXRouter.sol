// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../libraries/OrderLib.sol";
import "../libraries/EpochLib.sol";
import "../interfaces/IShieldXEngine.sol";
import "./ShieldXVault.sol";
import "./ShieldXSettlement.sol";

/// @title ShieldXRouter
/// @notice Main entry point for the ShieldX MEV-protected batch auction protocol
/// @dev Manages the commit-reveal-settle lifecycle for order batches within epochs.
///      Users commit hidden orders with collateral, reveal after epoch ends,
///      then settlement computes uniform clearing price via the engine contract.
contract ShieldXRouter {
    using OrderLib for OrderLib.Order;

    // ═══════════════════════════════════════════════════════════
    // STRUCTS
    // ═══════════════════════════════════════════════════════════

    /// @notice A hidden order commitment with associated metadata
    struct Commitment {
        bytes32 commitHash;
        address committer;
        uint256 collateral;
        uint256 epochId;
        uint64 timestamp;
        bool revealed;
        bool settled;
    }

    /// @notice A revealed order with full order details
    struct RevealedOrder {
        address trader;
        OrderLib.OrderType orderType;
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;
        uint256 maxPrice;
        bytes32 salt;
    }

    // ═══════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════

    /// @notice Current active epoch ID
    uint256 public currentEpochId;

    /// @notice Duration of each epoch's commit phase in seconds
    uint256 public epochDuration;

    /// @notice Duration of the reveal window after epoch ends, in seconds
    uint256 public revealWindow;

    /// @notice Minimum collateral required per order commitment (18 decimals)
    uint256 public minCollateral;

    /// @notice Epoch data by epoch ID
    mapping(uint256 => EpochLib.Epoch) public epochs;

    /// @notice Commitment data by commit hash
    mapping(bytes32 => Commitment) public commitments;

    /// @notice List of commit hashes per epoch
    mapping(uint256 => bytes32[]) internal epochCommitments;

    /// @notice List of revealed orders per epoch
    mapping(uint256 => RevealedOrder[]) internal epochOrders;

    /// @notice Collateral vault contract
    ShieldXVault public vault;

    /// @notice Settlement contract (bridge to engine)
    ShieldXSettlement public settlement;

    /// @notice Contract owner
    address public owner;

    // ═══════════════════════════════════════════════════════════
    // EVENTS
    // ═══════════════════════════════════════════════════════════

    /// @notice Emitted when an order commitment is submitted
    event OrderCommitted(
        bytes32 indexed commitHash,
        address indexed trader,
        uint256 indexed epochId,
        uint256 collateral
    );

    /// @notice Emitted when a committed order is revealed
    event OrderRevealed(
        bytes32 indexed commitHash,
        address indexed trader,
        uint256 indexed epochId,
        OrderLib.OrderType orderType,
        uint256 amountIn
    );

    /// @notice Emitted when an epoch is settled with a clearing price
    event EpochSettled(
        uint256 indexed epochId,
        uint256 clearingPrice,
        uint256 totalBuyVolume,
        uint256 totalSellVolume,
        uint256 matchedOrders
    );

    /// @notice Emitted when a new epoch is created
    event EpochAdvanced(uint256 indexed newEpochId, uint256 startTime, uint256 endTime);

    /// @notice Emitted when unrevealed collateral is slashed
    event UnrevealedSlashed(
        uint256 indexed epochId,
        address indexed trader,
        bytes32 indexed commitHash,
        uint256 amount
    );

    // ═══════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════

    /// @notice Initialize the router with epoch parameters and contract references
    /// @param _epochDuration Duration of commit phase in seconds
    /// @param _revealWindow Duration of reveal window in seconds
    /// @param _minCollateral Minimum collateral per order (18 decimals)
    /// @param _vault Address of the ShieldXVault contract
    /// @param _settlement Address of the ShieldXSettlement contract
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
        vault = ShieldXVault(payable(_vault));
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
    /// @dev Requires minimum collateral and unique commitment hash.
    ///      Auto-advances epoch if current one has fully expired.
    /// @param commitHash keccak256(abi.encodePacked(orderType, tokenIn, tokenOut, amountIn, minAmountOut, maxPrice, salt))
    function commitOrder(bytes32 commitHash) external payable {
        require(msg.value >= minCollateral, "ShieldXRouter: insufficient collateral");
        require(commitments[commitHash].committer == address(0), "ShieldXRouter: duplicate commitment");

        // Auto-advance epoch if needed
        _advanceEpochIfNeeded();

        EpochLib.Epoch storage epoch = epochs[currentEpochId];
        require(block.timestamp <= epoch.endTime, "ShieldXRouter: epoch not in commit phase");

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
    /// @dev The hash of revealed params must match the original commitment.
    ///      Must be called during the reveal window (after epoch ends, before settle).
    /// @param orderType BUY or SELL
    /// @param tokenIn Address of token being sold
    /// @param tokenOut Address of token being bought
    /// @param amountIn Amount of tokenIn (18 decimals)
    /// @param minAmountOut Minimum acceptable output
    /// @param maxPrice Maximum price (buys) or minimum price (sells)
    /// @param salt Random salt used in the original commitment
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
        bytes32 commitHash = OrderLib.computeCommitHash(
            orderType, tokenIn, tokenOut, amountIn, minAmountOut, maxPrice, salt
        );

        Commitment storage commitment = commitments[commitHash];
        require(commitment.committer == msg.sender, "ShieldXRouter: not your commitment");
        require(!commitment.revealed, "ShieldXRouter: already revealed");

        uint256 epochId = commitment.epochId;
        EpochLib.Epoch storage epoch = epochs[epochId];

        // Must be in reveal phase
        require(
            block.timestamp > epoch.endTime &&
            block.timestamp <= epoch.endTime + revealWindow,
            "ShieldXRouter: not in reveal window"
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
    // PHASE 3: SETTLE
    // ═══════════════════════════════════════════════════════════

    /// @notice Settle a completed epoch — calls engine for batch matching
    /// @dev Can be called by anyone after the reveal window closes.
    ///      Splits orders into buy/sell, calls settlement, executes fills.
    /// @param epochId The epoch to settle
    function settleEpoch(uint256 epochId) external {
        EpochLib.Epoch storage epoch = epochs[epochId];
        require(!epoch.settled, "ShieldXRouter: already settled");
        require(
            block.timestamp > epoch.endTime + revealWindow,
            "ShieldXRouter: reveal window still open"
        );

        RevealedOrder[] storage orders = epochOrders[epochId];
        require(orders.length > 0, "ShieldXRouter: no orders to settle");

        // Split into buy and sell order arrays for the engine
        uint256 buyCount;
        uint256 sellCount;
        for (uint256 i = 0; i < orders.length; i++) {
            if (orders[i].orderType == OrderLib.OrderType.BUY) {
                buyCount++;
            } else {
                sellCount++;
            }
        }

        OrderLib.Order[] memory buyOrders = new OrderLib.Order[](buyCount);
        OrderLib.Order[] memory sellOrders = new OrderLib.Order[](sellCount);
        uint256[] memory buyOrigIdx = new uint256[](buyCount);
        uint256[] memory sellOrigIdx = new uint256[](sellCount);

        uint256 bi;
        uint256 si;
        for (uint256 i = 0; i < orders.length; i++) {
            OrderLib.Order memory order = OrderLib.Order({
                orderType: orders[i].orderType,
                tokenIn: orders[i].tokenIn,
                tokenOut: orders[i].tokenOut,
                amountIn: orders[i].amountIn,
                minAmountOut: orders[i].minAmountOut,
                maxPrice: orders[i].maxPrice
            });

            if (orders[i].orderType == OrderLib.OrderType.BUY) {
                buyOrders[bi] = order;
                buyOrigIdx[bi] = i;
                bi++;
            } else {
                sellOrders[si] = order;
                sellOrigIdx[si] = i;
                si++;
            }
        }

        // Call settlement (which calls engine)
        IShieldXEngine.BatchResult memory result = settlement.computeBatchSettlement(
            buyOrders,
            sellOrders
        );

        // Execute fills — map engine results back to original order indices
        uint256 matchedCount;
        for (uint256 i = 0; i < buyCount; i++) {
            if (result.buyFills[i] > 0) {
                _executeFill(orders[buyOrigIdx[i]], result.clearingPrice, result.buyFills[i]);
                matchedCount++;
            }
        }
        for (uint256 i = 0; i < sellCount; i++) {
            if (result.sellFills[i] > 0) {
                _executeFill(orders[sellOrigIdx[i]], result.clearingPrice, result.sellFills[i]);
                matchedCount++;
            }
        }

        epoch.clearingPrice = result.clearingPrice;
        epoch.settled = true;

        emit EpochSettled(
            epochId,
            result.clearingPrice,
            result.totalBuyFill,
            result.totalSellFill,
            matchedCount
        );

        // Return collateral for all revealed orders
        _returnCollateral(epochId);
    }

    // ═══════════════════════════════════════════════════════════
    // PHASE 4: SLASH
    // ═══════════════════════════════════════════════════════════

    /// @notice Slash collateral of users who committed but didn't reveal
    /// @dev Can be called by anyone after the reveal window closes
    /// @param epochId The epoch to check for unrevealed commitments
    function slashUnrevealed(uint256 epochId) external {
        EpochLib.Epoch storage epoch = epochs[epochId];
        require(
            block.timestamp > epoch.endTime + revealWindow,
            "ShieldXRouter: reveal window still open"
        );

        bytes32[] storage commits = epochCommitments[epochId];
        for (uint256 i = 0; i < commits.length; i++) {
            Commitment storage c = commitments[commits[i]];
            if (!c.revealed && !c.settled) {
                c.settled = true;
                vault.slashCollateral(c.committer, commits[i]);
                emit UnrevealedSlashed(epochId, c.committer, commits[i], c.collateral);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════════

    /// @dev Auto-advance to a new epoch if the current one has fully expired
    function _advanceEpochIfNeeded() internal {
        EpochLib.Epoch storage current = epochs[currentEpochId];
        if (block.timestamp > current.endTime + revealWindow) {
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

    /// @dev Execute a single fill for a matched order
    function _executeFill(
        RevealedOrder memory order,
        uint256 clearingPrice,
        uint256 fillAmount
    ) internal {
        if (order.tokenOut == address(0)) {
            // Native PAS fill — transfer from vault
            vault.releaseFill(order.trader, fillAmount);
        } else {
            // ERC20 or cross-chain fill — route via settlement
            settlement.executeFill(order.trader, order.tokenOut, clearingPrice, fillAmount);
        }
    }

    /// @dev Return collateral for all revealed+unsettled commitments in an epoch
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

    /// @notice Get the current active epoch data
    /// @return The current epoch struct
    function getCurrentEpoch() external view returns (EpochLib.Epoch memory) {
        return epochs[currentEpochId];
    }

    /// @notice Get all revealed orders for an epoch
    /// @param epochId The epoch to query
    /// @return Array of revealed orders
    function getEpochOrders(uint256 epochId) external view returns (RevealedOrder[] memory) {
        return epochOrders[epochId];
    }

    /// @notice Get the number of commitments in an epoch
    /// @param epochId The epoch to query
    /// @return Number of commitment hashes
    function getEpochCommitmentCount(uint256 epochId) external view returns (uint256) {
        return epochCommitments[epochId].length;
    }

    /// @notice Check if the current epoch is in the commit phase
    /// @return True if block.timestamp is before epoch endTime
    function isInCommitPhase() external view returns (bool) {
        return block.timestamp <= epochs[currentEpochId].endTime;
    }

    /// @notice Check if the current epoch is in the reveal phase
    /// @return True if block.timestamp is in the reveal window
    function isInRevealPhase() external view returns (bool) {
        EpochLib.Epoch storage epoch = epochs[currentEpochId];
        return block.timestamp > epoch.endTime &&
               block.timestamp <= epoch.endTime + revealWindow;
    }
}
