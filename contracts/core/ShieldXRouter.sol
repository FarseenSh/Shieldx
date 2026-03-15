// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../libraries/OrderLib.sol";
import "../libraries/EpochLib.sol";
import "../interfaces/IShieldXEngine.sol";
import "./ShieldXVault.sol";
import "./ShieldXSettlement.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/// @title ShieldXRouter
/// @notice Main entry point for the ShieldX MEV-protected batch auction protocol
/// @dev Manages the commit-reveal-settle lifecycle for order batches within epochs.
///      Uses OpenZeppelin AccessControl for RBAC and Pausable for emergency circuit breaker.
contract ShieldXRouter is AccessControl, Pausable {
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

    /// @notice Role for settling epochs
    bytes32 public constant SETTLER_ROLE = keccak256("SETTLER_ROLE");

    /// @notice Role for pausing/unpausing the protocol
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    /// @notice MEV surplus saved per user per epoch
    mapping(uint256 => mapping(address => uint256)) public userSurplus;

    /// @notice Total MEV surplus saved across all users in an epoch
    mapping(uint256 => uint256) public epochTotalSurplus;

    /// @notice Protocol fee in basis points (10 = 0.1%)
    uint256 public protocolFeeBps = 10;

    /// @notice Cumulative protocol fees collected across all epochs
    uint256 public totalProtocolFees;

    /// @notice Cumulative count of filled orders across all epochs
    uint256 public totalOrdersProtected;

    /// @notice Cumulative volume of all filled orders across all epochs
    uint256 public totalVolumeProtected;

    /// @notice Cumulative MEV surplus saved across all epochs
    uint256 public totalMEVSaved;

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
        uint256 matchedOrders,
        uint256 totalSurplus
    );

    /// @notice Emitted when a new epoch is created
    event EpochAdvanced(uint256 indexed newEpochId, uint256 startTime, uint256 endTime);

    /// @notice Emitted when MEV surplus is saved for a trader
    event MEVSaved(uint256 indexed epochId, address indexed trader, uint256 surplus);

    /// @notice Emitted when protocol fees are collected from an epoch
    event ProtocolFeeCollected(uint256 indexed epochId, uint256 feeAmount);

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
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(SETTLER_ROLE, msg.sender);
        _grantRole(PAUSER_ROLE, msg.sender);

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
    function commitOrder(bytes32 commitHash) external payable whenNotPaused {
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
    ) external whenNotPaused {
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
        require(epochOrders[epochId].length > 0, "ShieldXRouter: no orders to settle");

        // _settleAndFill stores clearingPrice, surplus, and emits EpochSettled
        _settleAndFill(epochId);
        epoch.settled = true;
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

    /// @dev Split orders, call engine, execute fills, compute surplus, emit event
    function _settleAndFill(uint256 epochId) internal {
        RevealedOrder[] storage orders = epochOrders[epochId];
        (OrderLib.Order[] memory buyOrders, OrderLib.Order[] memory sellOrders,
         uint256[] memory buyIdx, uint256[] memory sellIdx) = _splitOrders(orders);

        IShieldXEngine.BatchResult memory r = settlement.computeBatchSettlement(buyOrders, sellOrders);
        epochs[epochId].clearingPrice = r.clearingPrice;

        uint256 matched;
        uint256 surplus;
        for (uint256 i = 0; i < buyOrders.length; i++) {
            if (r.buyFills[i] > 0) {
                _executeFill(orders[buyIdx[i]], r.clearingPrice, r.buyFills[i]);
                matched++;
                surplus += _recordSurplus(epochId, orders[buyIdx[i]], r.clearingPrice, r.buyFills[i]);
            }
        }
        for (uint256 i = 0; i < sellOrders.length; i++) {
            if (r.sellFills[i] > 0) {
                _executeFill(orders[sellIdx[i]], r.clearingPrice, r.sellFills[i]);
                matched++;
                surplus += _recordSurplus(epochId, orders[sellIdx[i]], r.clearingPrice, r.sellFills[i]);
            }
        }
        // Calculate protocol fees on total volume
        uint256 totalVolume = r.totalBuyFill + r.totalSellFill;
        uint256 epochFees = totalVolume * protocolFeeBps / 10000;

        // Accumulate protocol stats
        epochTotalSurplus[epochId] = surplus;
        totalProtocolFees += epochFees;
        totalOrdersProtected += matched;
        totalVolumeProtected += totalVolume;
        totalMEVSaved += surplus;

        emit EpochSettled(epochId, r.clearingPrice, r.totalBuyFill, r.totalSellFill, matched, surplus);
        if (epochFees > 0) {
            emit ProtocolFeeCollected(epochId, epochFees);
        }
    }

    /// @dev Split revealed orders into buy/sell arrays with original index tracking
    function _splitOrders(RevealedOrder[] storage orders) internal view returns (
        OrderLib.Order[] memory buyOrders, OrderLib.Order[] memory sellOrders,
        uint256[] memory buyIdx, uint256[] memory sellIdx
    ) {
        uint256 n = orders.length;
        uint256 buyCount;
        for (uint256 i = 0; i < n; i++) {
            if (orders[i].orderType == OrderLib.OrderType.BUY) buyCount++;
        }
        buyOrders = new OrderLib.Order[](buyCount);
        sellOrders = new OrderLib.Order[](n - buyCount);
        buyIdx = new uint256[](buyCount);
        sellIdx = new uint256[](n - buyCount);
        uint256 bi;
        uint256 si;
        for (uint256 i = 0; i < n; i++) {
            OrderLib.Order memory o = OrderLib.Order(
                orders[i].orderType, orders[i].tokenIn, orders[i].tokenOut,
                orders[i].amountIn, orders[i].minAmountOut, orders[i].maxPrice
            );
            if (orders[i].orderType == OrderLib.OrderType.BUY) {
                buyOrders[bi] = o;
                buyIdx[bi++] = i;
            } else {
                sellOrders[si] = o;
                sellIdx[si++] = i;
            }
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

    /// @dev Calculate and record MEV surplus for a filled order
    function _recordSurplus(
        uint256 epochId,
        RevealedOrder memory order,
        uint256 clearingPrice,
        uint256 fillAmount
    ) internal returns (uint256 surplus) {
        if (clearingPrice == 0) return 0;

        if (order.orderType == OrderLib.OrderType.BUY && order.maxPrice > clearingPrice) {
            surplus = (order.maxPrice - clearingPrice) * fillAmount / clearingPrice;
        } else if (order.orderType == OrderLib.OrderType.SELL && clearingPrice > order.maxPrice) {
            surplus = (clearingPrice - order.maxPrice) * fillAmount / clearingPrice;
        }

        if (surplus > 0) {
            userSurplus[epochId][order.trader] += surplus;
            emit MEVSaved(epochId, order.trader, surplus);
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

    /// @notice Get the MEV surplus saved for a user in a specific epoch
    /// @param epochId The epoch to query
    /// @param user The user address
    /// @return The surplus amount (18 decimals)
    function getUserSurplus(uint256 epochId, address user) external view returns (uint256) {
        return userSurplus[epochId][user];
    }

    /// @notice Get the total MEV surplus saved across all users in an epoch
    /// @param epochId The epoch to query
    /// @return The total surplus amount (18 decimals)
    function getEpochTotalSurplus(uint256 epochId) external view returns (uint256) {
        return epochTotalSurplus[epochId];
    }

    /// @notice Get cumulative protocol statistics
    /// @return orders Total filled orders across all epochs
    /// @return volume Total volume of all filled orders
    /// @return mevSaved Total MEV surplus saved for users
    /// @return fees Total protocol fees collected
    function getProtocolStats() external view returns (
        uint256 orders, uint256 volume, uint256 mevSaved, uint256 fees
    ) {
        return (totalOrdersProtected, totalVolumeProtected, totalMEVSaved, totalProtocolFees);
    }

    /// @notice Set the protocol fee in basis points
    /// @dev Only callable by DEFAULT_ADMIN_ROLE. Maximum 100 bps (1%).
    /// @param newFeeBps New fee in basis points (1 bps = 0.01%)
    function setProtocolFee(uint256 newFeeBps) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(newFeeBps <= 100, "ShieldXRouter: fee cannot exceed 1%");
        protocolFeeBps = newFeeBps;
    }

    // ═══════════════════════════════════════════════════════════
    // EMERGENCY CONTROLS
    // ═══════════════════════════════════════════════════════════

    /// @notice Pause the protocol — blocks new commits and reveals
    /// @dev Only callable by accounts with PAUSER_ROLE. Settlement still works when paused.
    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    /// @notice Unpause the protocol — re-enables commits and reveals
    /// @dev Only callable by accounts with PAUSER_ROLE
    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }
}
