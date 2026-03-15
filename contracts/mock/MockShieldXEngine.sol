// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IShieldXEngine.sol";
import "../libraries/OrderLib.sol";

/// @title MockShieldXEngine
/// @notice Solidity implementation of the ShieldX batch auction engine
/// @dev This contract mirrors the Rust PVM contract logic exactly.
///      Used for EVM-mode testing and as a fallback when PVM is unavailable.
///      All functions are pure (no state reads) but implement the view interface.
///      MUST produce identical results to the Rust PVM contract (lib.rs).
contract MockShieldXEngine is IShieldXEngine {
    /// @notice Threshold score above which manipulation is flagged
    uint256 public constant MANIPULATION_THRESHOLD = 50;

    /// @notice Wash trading detection threshold — percentage of volume from repeated addresses
    uint256 public constant WASH_TRADE_THRESHOLD = 30;

    /// @notice Spoofing detection threshold — percentage of volume from a single address
    uint256 public constant SPOOF_THRESHOLD = 50;

    /// @notice Market impact threshold — single order moving price by this percentage
    uint256 public constant IMPACT_THRESHOLD = 10;

    /// @inheritdoc IShieldXEngine
    /// @dev Pure override of view interface. Sorts buys descending, sells ascending,
    ///      finds crossing point, computes uniform clearing price and per-order fills.
    function computeBatchAuction(
        OrderLib.Order[] calldata buyOrders,
        OrderLib.Order[] calldata sellOrders
    ) external pure override returns (BatchResult memory result) {
        // Handle empty batches
        if (buyOrders.length == 0 || sellOrders.length == 0) {
            result.buyFills = new uint256[](buyOrders.length);
            result.sellFills = new uint256[](sellOrders.length);

            // If only buys, clearing price is best bid; if only sells, best ask; if both empty, 0
            if (buyOrders.length > 0) {
                uint256 bestBid = 0;
                for (uint256 i = 0; i < buyOrders.length; i++) {
                    if (buyOrders[i].maxPrice > bestBid) {
                        bestBid = buyOrders[i].maxPrice;
                    }
                }
                result.clearingPrice = bestBid;
            } else if (sellOrders.length > 0) {
                uint256 bestAsk = type(uint256).max;
                for (uint256 i = 0; i < sellOrders.length; i++) {
                    if (sellOrders[i].maxPrice < bestAsk) {
                        bestAsk = sellOrders[i].maxPrice;
                    }
                }
                result.clearingPrice = bestAsk;
            }
            return result;
        }

        // Copy and sort buy orders descending by maxPrice
        uint256[] memory buyPrices = new uint256[](buyOrders.length);
        uint256[] memory buyAmounts = new uint256[](buyOrders.length);
        uint256[] memory buyIndices = new uint256[](buyOrders.length);
        for (uint256 i = 0; i < buyOrders.length; i++) {
            buyPrices[i] = buyOrders[i].maxPrice;
            buyAmounts[i] = buyOrders[i].amountIn;
            buyIndices[i] = i;
        }
        _sortDescending(buyPrices, buyAmounts, buyIndices);

        // Copy and sort sell orders ascending by maxPrice
        uint256[] memory sellPrices = new uint256[](sellOrders.length);
        uint256[] memory sellAmounts = new uint256[](sellOrders.length);
        uint256[] memory sellIndices = new uint256[](sellOrders.length);
        for (uint256 i = 0; i < sellOrders.length; i++) {
            sellPrices[i] = sellOrders[i].maxPrice;
            sellAmounts[i] = sellOrders[i].amountIn;
            sellIndices[i] = i;
        }
        _sortAscending(sellPrices, sellAmounts, sellIndices);

        // Find crossing point
        uint256 crossBuyIdx = 0;
        uint256 crossSellIdx = 0;
        bool hasCrossing = false;

        while (crossBuyIdx < buyPrices.length && crossSellIdx < sellPrices.length) {
            if (buyPrices[crossBuyIdx] >= sellPrices[crossSellIdx]) {
                hasCrossing = true;
                crossBuyIdx++;
                crossSellIdx++;
            } else {
                break;
            }
        }

        // Compute clearing price
        if (hasCrossing) {
            // Clearing price is midpoint of last crossing buy and sell
            result.clearingPrice = (buyPrices[crossBuyIdx - 1] + sellPrices[crossSellIdx - 1]) / 2;
        } else {
            // No crossing — use midpoint of best bid and best ask as fallback
            result.clearingPrice = (buyPrices[0] + sellPrices[0]) / 2;
        }

        // Compute fills
        result.buyFills = new uint256[](buyOrders.length);
        result.sellFills = new uint256[](sellOrders.length);

        // Fill buy orders that are at or above clearing price
        for (uint256 i = 0; i < buyPrices.length; i++) {
            if (buyPrices[i] >= result.clearingPrice) {
                uint256 origIdx = buyIndices[i];
                result.buyFills[origIdx] = buyAmounts[i];
                result.totalBuyFill += buyAmounts[i];
            }
        }

        // Fill sell orders that are at or below clearing price
        for (uint256 i = 0; i < sellPrices.length; i++) {
            if (sellPrices[i] <= result.clearingPrice) {
                uint256 origIdx = sellIndices[i];
                result.sellFills[origIdx] = sellAmounts[i];
                result.totalSellFill += sellAmounts[i];
            }
        }

        return result;
    }

    /// @inheritdoc IShieldXEngine
    /// @dev Checks three manipulation patterns in order of severity:
    ///      1. Wash trading (score 70) — repeated addresses on both sides
    ///      2. Spoofing (score 60) — single address dominates volume
    ///      3. Market impact (score 50) — single order exceeds impact threshold
    ///      Returns the highest-severity match found, or clean (score 0) if none.
    function detectManipulation(
        OrderLib.Order[] calldata orders,
        uint256 clearingPrice
    ) external pure override returns (ManipulationResult memory result) {
        // Need at least 3 orders for meaningful manipulation detection
        if (orders.length < 3) {
            return ManipulationResult(false, 0, 0);
        }

        // Check 1: Wash trading — same tokenIn appearing as both buy and sell
        uint256 buyCount = 0;
        uint256 sellCount = 0;
        uint256 totalAmount = 0;

        for (uint256 i = 0; i < orders.length; i++) {
            totalAmount += orders[i].amountIn;
            if (orders[i].orderType == OrderLib.OrderType.BUY) {
                buyCount++;
            } else {
                sellCount++;
            }
        }

        // Wash trading: if there are matching buy/sell pairs with similar amounts
        if (buyCount > 0 && sellCount > 0) {
            uint256 matchingVolume = 0;
            for (uint256 i = 0; i < orders.length; i++) {
                if (orders[i].orderType == OrderLib.OrderType.BUY) {
                    for (uint256 j = 0; j < orders.length; j++) {
                        if (orders[j].orderType == OrderLib.OrderType.SELL &&
                            orders[i].tokenIn == orders[j].tokenOut &&
                            orders[i].tokenOut == orders[j].tokenIn) {
                            // Check if amounts are within 10% of each other
                            uint256 diff = orders[i].amountIn > orders[j].amountIn
                                ? orders[i].amountIn - orders[j].amountIn
                                : orders[j].amountIn - orders[i].amountIn;
                            if (diff * 100 <= orders[i].amountIn * 10) {
                                matchingVolume += orders[i].amountIn;
                            }
                        }
                    }
                }
            }

            if (totalAmount > 0 && matchingVolume * 100 / totalAmount >= WASH_TRADE_THRESHOLD) {
                return ManipulationResult(true, 70, 1);
            }
        }

        // Check 2: Spoofing — single token address dominates order volume
        if (totalAmount > 0) {
            for (uint256 i = 0; i < orders.length; i++) {
                if (orders[i].amountIn * 100 / totalAmount >= SPOOF_THRESHOLD) {
                    return ManipulationResult(true, 60, 2);
                }
            }
        }

        // Check 3: Market impact — single order price deviates significantly from clearing price
        if (clearingPrice > 0) {
            for (uint256 i = 0; i < orders.length; i++) {
                uint256 priceDiff = orders[i].maxPrice > clearingPrice
                    ? orders[i].maxPrice - clearingPrice
                    : clearingPrice - orders[i].maxPrice;
                if (priceDiff * 100 / clearingPrice >= IMPACT_THRESHOLD) {
                    return ManipulationResult(false, 50, 3);
                }
            }
        }

        return ManipulationResult(false, 0, 0);
    }

    /// @inheritdoc IShieldXEngine
    /// @dev Computes sum(price[i] * weight[i]) / sum(weight[i]).
    ///      Returns 0 if total weight is 0 or arrays are empty.
    function computeTWAP(
        uint256[] calldata prices,
        uint256[] calldata weights
    ) external pure override returns (uint256 twap) {
        require(prices.length == weights.length, "MockShieldXEngine: prices and weights length mismatch");

        if (prices.length == 0) {
            return 0;
        }

        uint256 weightedSum = 0;
        uint256 totalWeight = 0;

        for (uint256 i = 0; i < prices.length; i++) {
            weightedSum += prices[i] * weights[i];
            totalWeight += weights[i];
        }

        if (totalWeight == 0) {
            return 0;
        }

        return weightedSum / totalWeight;
    }

    /// @notice Sort arrays in descending order by price (stable insertion sort)
    /// @dev Sorts prices, amounts, and indices together maintaining correspondence
    /// @param prices Array of prices to sort (modified in place)
    /// @param amounts Array of amounts sorted alongside prices
    /// @param indices Array of original indices sorted alongside prices
    function _sortDescending(
        uint256[] memory prices,
        uint256[] memory amounts,
        uint256[] memory indices
    ) internal pure {
        for (uint256 i = 1; i < prices.length; i++) {
            uint256 keyPrice = prices[i];
            uint256 keyAmount = amounts[i];
            uint256 keyIndex = indices[i];
            int256 j = int256(i) - 1;

            while (j >= 0 && prices[uint256(j)] < keyPrice) {
                prices[uint256(j + 1)] = prices[uint256(j)];
                amounts[uint256(j + 1)] = amounts[uint256(j)];
                indices[uint256(j + 1)] = indices[uint256(j)];
                j--;
            }
            prices[uint256(j + 1)] = keyPrice;
            amounts[uint256(j + 1)] = keyAmount;
            indices[uint256(j + 1)] = keyIndex;
        }
    }

    /// @notice Sort arrays in ascending order by price (stable insertion sort)
    /// @dev Sorts prices, amounts, and indices together maintaining correspondence
    /// @param prices Array of prices to sort (modified in place)
    /// @param amounts Array of amounts sorted alongside prices
    /// @param indices Array of original indices sorted alongside prices
    function _sortAscending(
        uint256[] memory prices,
        uint256[] memory amounts,
        uint256[] memory indices
    ) internal pure {
        for (uint256 i = 1; i < prices.length; i++) {
            uint256 keyPrice = prices[i];
            uint256 keyAmount = amounts[i];
            uint256 keyIndex = indices[i];
            int256 j = int256(i) - 1;

            while (j >= 0 && prices[uint256(j)] > keyPrice) {
                prices[uint256(j + 1)] = prices[uint256(j)];
                amounts[uint256(j + 1)] = amounts[uint256(j)];
                indices[uint256(j + 1)] = indices[uint256(j)];
                j--;
            }
            prices[uint256(j + 1)] = keyPrice;
            amounts[uint256(j + 1)] = keyAmount;
            indices[uint256(j + 1)] = keyIndex;
        }
    }
}
