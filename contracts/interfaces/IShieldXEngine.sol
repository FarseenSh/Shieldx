// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../libraries/OrderLib.sol";

/// @title IShieldXEngine
/// @notice Interface for the ShieldX batch auction engine (Rust PVM contract + Solidity mock)
/// @dev The engine computes clearing prices via batch auction, detects manipulation,
///      and calculates time-weighted average prices. The Rust PVM contract and
///      MockShieldXEngine.sol must produce identical results for all inputs.
interface IShieldXEngine {
    /// @notice Result of a batch auction computation
    /// @param clearingPrice The uniform clearing price for the batch (18 decimals)
    /// @param totalBuyFill Total buy-side volume filled at clearing price
    /// @param totalSellFill Total sell-side volume filled at clearing price
    /// @param buyFills Per-order fill amounts for buy orders (same index as input)
    /// @param sellFills Per-order fill amounts for sell orders (same index as input)
    struct BatchResult {
        uint256 clearingPrice;
        uint256 totalBuyFill;
        uint256 totalSellFill;
        uint256[] buyFills;
        uint256[] sellFills;
    }

    /// @notice Result of manipulation detection analysis
    /// @param isManipulated Whether manipulation was detected above threshold
    /// @param manipulationScore Score from 0-100 indicating manipulation severity
    /// @param manipulationType 0=clean, 1=wash trading, 2=spoofing, 3=market impact
    struct ManipulationResult {
        bool isManipulated;
        uint256 manipulationScore;
        uint256 manipulationType;
    }

    /// @notice Compute uniform clearing price for a batch of buy and sell orders
    /// @dev Uses a sorted intersection algorithm: sort buys descending by maxPrice,
    ///      sells ascending by maxPrice, find crossing point for clearing price.
    ///      If no crossing exists, uses midpoint of best bid/ask as fallback.
    /// @param buyOrders Array of buy orders in the batch
    /// @param sellOrders Array of sell orders in the batch
    /// @return result The batch auction result with clearing price and per-order fills
    function computeBatchAuction(
        OrderLib.Order[] calldata buyOrders,
        OrderLib.Order[] calldata sellOrders
    ) external view returns (BatchResult memory result);

    /// @notice Detect potential market manipulation in a batch of orders
    /// @dev Checks for wash trading (same address on both sides), spoofing
    ///      (large orders from single address dominating volume), and market impact
    ///      (single order moving price beyond threshold). Returns highest-severity match.
    /// @param orders Array of all orders (buys and sells) in the batch
    /// @param clearingPrice The computed clearing price for reference
    /// @return result Manipulation detection result with score and type
    function detectManipulation(
        OrderLib.Order[] calldata orders,
        uint256 clearingPrice
    ) external view returns (ManipulationResult memory result);

    /// @notice Compute time-weighted average price from a series of observations
    /// @dev Each observation is a (price, weight) pair where weight represents the
    ///      time duration or volume at that price. Returns weighted average.
    /// @param prices Array of observed prices (18 decimals)
    /// @param weights Array of time weights corresponding to each price
    /// @return twap The time-weighted average price (18 decimals)
    function computeTWAP(
        uint256[] calldata prices,
        uint256[] calldata weights
    ) external pure returns (uint256 twap);
}
