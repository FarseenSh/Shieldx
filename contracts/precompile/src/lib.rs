#![cfg_attr(not(feature = "std"), no_std)]

extern crate alloc;
use alloc::vec;
use alloc::vec::Vec;

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════

/// Buy or sell side of an order
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum OrderSide {
    Buy,
    Sell,
}

/// Type of detected market manipulation
#[derive(Clone, Copy, PartialEq, Debug)]
pub enum AnomalyType {
    None,
    WashTrading,
    Spoofing,
    MarketImpact,
}

/// An order in the batch auction with tracking index
#[derive(Clone, Debug)]
pub struct Order {
    pub price: u128,
    pub amount: u128,
    pub side: OrderSide,
    pub index: usize,
}

/// Result of a batch auction computation
pub struct BatchResult {
    pub clearing_price: u128,
    pub fill_amounts: Vec<u128>,
    pub fills: Vec<bool>,
}

/// Result of manipulation detection analysis
pub struct AnomalyResult {
    pub score: u8,
    pub anomaly_type: AnomalyType,
}

// ═══════════════════════════════════════════════════════════
// BATCH AUCTION ENGINE
// ═══════════════════════════════════════════════════════════

/// Compute uniform clearing price via supply-demand intersection.
///
/// Algorithm:
///   1. Separate orders into buy and sell arrays
///   2. Sort buys descending by price (highest bid first)
///   3. Sort sells ascending by price (lowest ask first)
///   4. Walk both arrays to find crossing point
///   5. Clearing price is midpoint of last crossing pair
///   6. Fill all buys at/above clearing, sells at/below clearing
///
/// Returns a BatchResult with clearing price and per-order fills.
/// If no orders exist, returns zero clearing price and empty fills.
pub fn compute_batch_auction(
    prices: &[u128],
    amounts: &[u128],
    is_buy: &[bool],
) -> BatchResult {
    let n = prices.len();
    let mut fill_amounts = vec![0u128; n];
    let mut fills = vec![false; n];

    if n == 0 {
        return BatchResult {
            clearing_price: 0,
            fill_amounts,
            fills,
        };
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
        return BatchResult {
            clearing_price: 0,
            fill_amounts,
            fills,
        };
    }

    // Sort buys descending (highest price first) — stable insertion sort
    insertion_sort_descending(&mut buys);
    // Sort sells ascending (lowest price first) — stable insertion sort
    insertion_sort_ascending(&mut sells);

    // Find crossing point
    let mut b_idx: usize = 0;
    let mut s_idx: usize = 0;
    let mut has_crossing = false;

    while b_idx < buys.len() && s_idx < sells.len() {
        if buys[b_idx].price >= sells[s_idx].price {
            has_crossing = true;
            b_idx += 1;
            s_idx += 1;
        } else {
            break;
        }
    }

    // Compute clearing price
    let clearing_price = if has_crossing {
        // Midpoint of last crossing pair
        let last_buy = buys[b_idx.saturating_sub(1)].price;
        let last_sell = sells[s_idx.saturating_sub(1)].price;
        last_buy.saturating_add(last_sell) / 2
    } else {
        // No crossing — fallback to midpoint of best bid/ask
        buys[0].price.saturating_add(sells[0].price) / 2
    };

    // Fill orders that cross the clearing price
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

    BatchResult {
        clearing_price,
        fill_amounts,
        fills,
    }
}

// ═══════════════════════════════════════════════════════════
// MANIPULATION DETECTION
// ═══════════════════════════════════════════════════════════

/// Detect potential market manipulation in a batch of orders.
///
/// Checks three patterns in order of severity:
///   1. Wash trading (score 70, type WashTrading) — price clustering
///   2. Spoofing (score 60, type Spoofing) — single order dominates volume
///   3. Market impact (score 50, type MarketImpact) — extreme price spread
///
/// Returns the highest-severity match, or clean (score 0) if none.
/// Requires at least 3 orders for meaningful detection.
pub fn detect_manipulation(
    prices: &[u128],
    amounts: &[u128],
    _is_buy: &[bool],
) -> AnomalyResult {
    let n = prices.len();

    if n < 3 {
        return AnomalyResult {
            score: 0,
            anomaly_type: AnomalyType::None,
        };
    }

    // Check 1: Wash trading — price clustering
    // If more than n/2 price pairs are within 0.1% of each other
    let mut cluster_count: u128 = 0;
    for i in 0..n.saturating_sub(1) {
        for j in (i + 1)..n {
            let diff = if prices[i] > prices[j] {
                prices[i].saturating_sub(prices[j])
            } else {
                prices[j].saturating_sub(prices[i])
            };
            // Within 0.1%: diff * 1000 < price
            if prices[i] > 0 && diff.saturating_mul(1000) < prices[i] {
                cluster_count += 1;
            }
        }
    }
    let n_u128 = n as u128;
    if cluster_count > n_u128 / 2 {
        return AnomalyResult {
            score: 70,
            anomaly_type: AnomalyType::WashTrading,
        };
    }

    // Check 2: Spoofing — single order dominates volume (≥ 50%)
    let mut total_amount: u128 = 0;
    let mut max_amount: u128 = 0;
    for i in 0..n {
        total_amount = total_amount.saturating_add(amounts[i]);
        if amounts[i] > max_amount {
            max_amount = amounts[i];
        }
    }
    if total_amount > 0 {
        // max_amount * 100 / total_amount >= 50
        if max_amount.saturating_mul(100) / total_amount >= 50 {
            return AnomalyResult {
                score: 60,
                anomaly_type: AnomalyType::Spoofing,
            };
        }
    }

    // Check 3: Market impact — extreme price spread (max > min * 3)
    let mut max_price: u128 = 0;
    let mut min_price: u128 = u128::MAX;
    for i in 0..n {
        if prices[i] > max_price {
            max_price = prices[i];
        }
        if prices[i] < min_price {
            min_price = prices[i];
        }
    }
    if min_price > 0 && max_price > min_price.saturating_mul(3) {
        return AnomalyResult {
            score: 50,
            anomaly_type: AnomalyType::MarketImpact,
        };
    }

    AnomalyResult {
        score: 0,
        anomaly_type: AnomalyType::None,
    }
}

// ═══════════════════════════════════════════════════════════
// TWAP COMPUTATION
// ═══════════════════════════════════════════════════════════

/// Compute time-weighted average price from observations.
///
/// Each observation is a (price, weight) pair. Returns the weighted
/// average: sum(price * weight) / sum(weight).
/// Returns 0 if total weight is 0 or arrays are empty.
pub fn compute_twap(prices: &[u128], weights: &[u128]) -> u128 {
    if prices.is_empty() || weights.is_empty() {
        return 0;
    }

    let len = if prices.len() < weights.len() {
        prices.len()
    } else {
        weights.len()
    };

    let mut weighted_sum: u128 = 0;
    let mut total_weight: u128 = 0;

    for i in 0..len {
        weighted_sum = weighted_sum.saturating_add(
            prices[i].saturating_mul(weights[i])
        );
        total_weight = total_weight.saturating_add(weights[i]);
    }

    if total_weight == 0 {
        return 0;
    }

    weighted_sum / total_weight
}

// ═══════════════════════════════════════════════════════════
// SORTING HELPERS — Stable insertion sort
// ═══════════════════════════════════════════════════════════

/// Sort orders descending by price using stable insertion sort.
///
/// Maintains insertion order for equal prices, matching
/// the Solidity _sortDescending implementation exactly.
fn insertion_sort_descending(data: &mut Vec<Order>) {
    let n = data.len();
    for i in 1..n {
        let key = data[i].clone();
        let mut j = i;
        while j > 0 && data[j - 1].price < key.price {
            data[j] = data[j - 1].clone();
            j -= 1;
        }
        data[j] = key;
    }
}

/// Sort orders ascending by price using stable insertion sort.
///
/// Maintains insertion order for equal prices, matching
/// the Solidity _sortAscending implementation exactly.
fn insertion_sort_ascending(data: &mut Vec<Order>) {
    let n = data.len();
    for i in 1..n {
        let key = data[i].clone();
        let mut j = i;
        while j > 0 && data[j - 1].price > key.price {
            data[j] = data[j - 1].clone();
            j -= 1;
        }
        data[j] = key;
    }
}

// ═══════════════════════════════════════════════════════════
// TESTS
// ═══════════════════════════════════════════════════════════

#[cfg(test)]
mod tests {
    use super::*;

    // ── Batch Auction Tests ──

    #[test]
    fn test_basic_batch_auction() {
        let prices = [110, 105, 100, 95, 100, 108];
        let amounts = [10, 20, 15, 10, 20, 15];
        let is_buy = [true, true, true, false, false, false];

        let result = compute_batch_auction(&prices, &amounts, &is_buy);
        assert!(result.clearing_price > 0);
        assert!(result.fills.iter().any(|&f| f));
    }

    #[test]
    fn test_empty_batch() {
        let result = compute_batch_auction(&[], &[], &[]);
        assert_eq!(result.clearing_price, 0);
        assert!(result.fill_amounts.is_empty());
        assert!(result.fills.is_empty());
    }

    #[test]
    fn test_single_match() {
        let prices = [100, 90];
        let amounts = [10, 10];
        let is_buy = [true, false];

        let result = compute_batch_auction(&prices, &amounts, &is_buy);
        // Midpoint: (100 + 90) / 2 = 95
        assert_eq!(result.clearing_price, 95);
        assert!(result.fills[0]); // buy at 100 >= 95
        assert!(result.fills[1]); // sell at 90 <= 95
        assert_eq!(result.fill_amounts[0], 10);
        assert_eq!(result.fill_amounts[1], 10);
    }

    #[test]
    fn test_no_crossing() {
        // Buys at 50, sells at 100 — no crossing
        let prices = [50, 100];
        let amounts = [10, 10];
        let is_buy = [true, false];

        let result = compute_batch_auction(&prices, &amounts, &is_buy);
        // Fallback midpoint: (50 + 100) / 2 = 75
        assert_eq!(result.clearing_price, 75);
    }

    #[test]
    fn test_only_buys() {
        let prices = [100, 110];
        let amounts = [10, 20];
        let is_buy = [true, true];

        let result = compute_batch_auction(&prices, &amounts, &is_buy);
        assert_eq!(result.clearing_price, 0);
        assert!(!result.fills[0]);
        assert!(!result.fills[1]);
    }

    #[test]
    fn test_only_sells() {
        let prices = [90, 95];
        let amounts = [10, 20];
        let is_buy = [false, false];

        let result = compute_batch_auction(&prices, &amounts, &is_buy);
        assert_eq!(result.clearing_price, 0);
        assert!(!result.fills[0]);
        assert!(!result.fills[1]);
    }

    #[test]
    fn test_many_buys_few_sells() {
        let prices = [120, 115, 110, 105, 100, 95];
        let amounts = [5, 5, 5, 5, 5, 10];
        let is_buy = [true, true, true, true, true, false];

        let result = compute_batch_auction(&prices, &amounts, &is_buy);
        assert!(result.clearing_price > 0);
        // Sell at 95 should fill
        assert!(result.fills[5]);
        assert_eq!(result.fill_amounts[5], 10);
    }

    #[test]
    fn test_all_buys_fill() {
        // Buys well above the sell — all should cross clearing price
        let prices = [200, 150, 50];
        let amounts = [10, 10, 10];
        let is_buy = [true, true, false];

        let result = compute_batch_auction(&prices, &amounts, &is_buy);
        // Crossing: buy 200 >= sell 50, clearing = (200+50)/2 = 125
        // Then buy 150 >= sell — but only 1 sell, so crossing stops at 1 pair
        // clearing = (200+50)/2 = 125. Buy at 200 fills (>=125), buy at 150 fills (>=125)
        assert!(result.clearing_price > 0);
        assert!(result.fills[0]); // buy 200 >= clearing
        assert!(result.fills[1]); // buy 150 >= clearing
        assert!(result.fills[2]); // sell 50 <= clearing
    }

    #[test]
    fn test_all_sells_fill() {
        let prices = [200, 50, 60, 70];
        let amounts = [10, 10, 10, 10];
        let is_buy = [true, false, false, false];

        let result = compute_batch_auction(&prices, &amounts, &is_buy);
        // All sells at 50, 60, 70 should be below clearing
        assert!(result.fills[1]);
        assert!(result.fills[2]);
        assert!(result.fills[3]);
    }

    #[test]
    fn test_partial_fills() {
        // Buy at 110 crosses sell at 90. Buy at 80 does not.
        let prices = [110, 80, 90, 120];
        let amounts = [10, 5, 10, 5];
        let is_buy = [true, true, false, false];

        let result = compute_batch_auction(&prices, &amounts, &is_buy);
        // Clearing = (110 + 90) / 2 = 100
        assert_eq!(result.clearing_price, 100);
        assert!(result.fills[0]);   // buy at 110 >= 100
        assert!(!result.fills[1]);  // buy at 80 < 100
        assert!(result.fills[2]);   // sell at 90 <= 100
        assert!(!result.fills[3]);  // sell at 120 > 100
    }

    #[test]
    fn test_fill_amounts_match() {
        let prices = [100, 90];
        let amounts = [42, 37];
        let is_buy = [true, false];

        let result = compute_batch_auction(&prices, &amounts, &is_buy);
        assert_eq!(result.fill_amounts[0], 42);
        assert_eq!(result.fill_amounts[1], 37);
    }

    #[test]
    fn test_identical_prices() {
        let prices = [100, 100, 100, 100];
        let amounts = [10, 20, 15, 25];
        let is_buy = [true, true, false, false];

        let result = compute_batch_auction(&prices, &amounts, &is_buy);
        // All at same price → clearing = 100, all fill
        assert_eq!(result.clearing_price, 100);
        assert!(result.fills.iter().all(|&f| f));
    }

    #[test]
    fn test_single_buy_many_sells() {
        let prices = [100, 85, 90, 95];
        let amounts = [50, 10, 10, 10];
        let is_buy = [true, false, false, false];

        let result = compute_batch_auction(&prices, &amounts, &is_buy);
        assert!(result.clearing_price > 0);
        assert!(result.fills[0]); // buy fills
    }

    #[test]
    fn test_many_buys_single_sell() {
        let prices = [110, 105, 100, 90];
        let amounts = [10, 10, 10, 50];
        let is_buy = [true, true, true, false];

        let result = compute_batch_auction(&prices, &amounts, &is_buy);
        assert!(result.clearing_price > 0);
        assert!(result.fills[3]); // sell fills
    }

    #[test]
    fn test_clearing_price_is_midpoint() {
        let prices = [120, 80];
        let amounts = [10, 10];
        let is_buy = [true, false];

        let result = compute_batch_auction(&prices, &amounts, &is_buy);
        assert_eq!(result.clearing_price, (120 + 80) / 2);
        assert_eq!(result.clearing_price, 100);
    }

    #[test]
    fn test_large_numbers() {
        let big = 1_000_000_000_000_000_000u128; // 1e18
        let prices = [big * 100, big * 90];
        let amounts = [big * 10, big * 10];
        let is_buy = [true, false];

        let result = compute_batch_auction(&prices, &amounts, &is_buy);
        assert_eq!(result.clearing_price, big * 95);
    }

    #[test]
    fn test_sort_stability() {
        // Two buys at same price — original order should be preserved
        let prices = [100, 100, 80];
        let amounts = [10, 20, 10];
        let is_buy = [true, true, false];

        let result = compute_batch_auction(&prices, &amounts, &is_buy);
        // Both buys at 100 fill, sell at 80 fills
        assert!(result.fills[0]);
        assert!(result.fills[1]);
        assert_eq!(result.fill_amounts[0], 10);
        assert_eq!(result.fill_amounts[1], 20);
    }

    #[test]
    fn test_zero_amount_orders() {
        let prices = [100, 90];
        let amounts = [0, 0];
        let is_buy = [true, false];

        let result = compute_batch_auction(&prices, &amounts, &is_buy);
        assert_eq!(result.clearing_price, 95);
        // Zero-amount fills are still tracked
        assert_eq!(result.fill_amounts[0], 0);
    }

    #[test]
    fn test_maximum_u128_values() {
        // Values near u128 max should not panic with saturating arithmetic
        let half_max = u128::MAX / 4;
        let prices = [half_max, half_max / 2];
        let amounts = [100, 100];
        let is_buy = [true, false];

        let result = compute_batch_auction(&prices, &amounts, &is_buy);
        assert!(result.clearing_price > 0);
    }

    // ── Manipulation Detection Tests ──

    #[test]
    fn test_wash_trading_detection() {
        // All prices within 0.1% of each other → wash trading
        let prices = [1000, 1000, 1001, 1000];
        let amounts = [10, 10, 10, 10];
        let is_buy = [true, true, false, false];

        let result = detect_manipulation(&prices, &amounts, &is_buy);
        assert_eq!(result.score, 70);
        assert_eq!(result.anomaly_type, AnomalyType::WashTrading);
    }

    #[test]
    fn test_spoofing_detection() {
        // One order is 80% of total volume
        let prices = [100, 101, 102];
        let amounts = [800, 100, 100];
        let is_buy = [true, false, false];

        let result = detect_manipulation(&prices, &amounts, &is_buy);
        assert_eq!(result.score, 60);
        assert_eq!(result.anomaly_type, AnomalyType::Spoofing);
    }

    #[test]
    fn test_market_impact_detection() {
        // Max price > 3x min price
        let prices = [100, 110, 400];
        let amounts = [10, 10, 10];
        let is_buy = [true, false, true];

        let result = detect_manipulation(&prices, &amounts, &is_buy);
        assert_eq!(result.score, 50);
        assert_eq!(result.anomaly_type, AnomalyType::MarketImpact);
    }

    #[test]
    fn test_clean_batch() {
        // Normal orders — no manipulation
        let prices = [100, 120, 140];
        let amounts = [10, 10, 10];
        let is_buy = [true, false, true];

        let result = detect_manipulation(&prices, &amounts, &is_buy);
        assert_eq!(result.score, 0);
        assert_eq!(result.anomaly_type, AnomalyType::None);
    }

    #[test]
    fn test_few_orders_clean() {
        // < 3 orders → always clean
        let prices = [100, 90];
        let amounts = [10, 10];
        let is_buy = [true, false];

        let result = detect_manipulation(&prices, &amounts, &is_buy);
        assert_eq!(result.score, 0);
        assert_eq!(result.anomaly_type, AnomalyType::None);
    }

    #[test]
    fn test_manipulation_boundary_cases() {
        // Exactly at 50% spoofing threshold
        let prices = [100, 110, 120];
        let amounts = [50, 25, 25];
        let is_buy = [true, false, true];

        let result = detect_manipulation(&prices, &amounts, &is_buy);
        assert_eq!(result.score, 60);
        assert_eq!(result.anomaly_type, AnomalyType::Spoofing);
    }

    #[test]
    fn test_mixed_anomalies() {
        // Both clustered prices AND spoofing present
        // Wash trading: 3 pairs, all within 0.1% → cluster_count=3, n/2=1 → detected
        // But spoofing also: 800/1000 = 80% ≥ 50%
        // Wash trading is checked FIRST → should return score 70
        let prices = [1000, 1001, 1000];
        let amounts = [100, 100, 800];
        let is_buy = [true, false, true];

        let result = detect_manipulation(&prices, &amounts, &is_buy);
        // All 3 pairs are within 0.1% → cluster_count=3 > n/2=1 → wash trading
        assert_eq!(result.score, 70);
        assert_eq!(result.anomaly_type, AnomalyType::WashTrading);
    }

    // ── TWAP Tests ──

    #[test]
    fn test_twap_basic() {
        // Equal weights → simple average
        let prices = [100, 110, 120];
        let weights = [1, 1, 1];

        let twap = compute_twap(&prices, &weights);
        assert_eq!(twap, 110); // (100 + 110 + 120) / 3
    }

    #[test]
    fn test_twap_weighted() {
        let prices = [100, 200];
        let weights = [3, 1];

        let twap = compute_twap(&prices, &weights);
        assert_eq!(twap, 125); // (300 + 200) / 4
    }

    #[test]
    fn test_twap_zero_weight() {
        let prices = [100, 200];
        let weights = [0, 0];

        let twap = compute_twap(&prices, &weights);
        assert_eq!(twap, 0);
    }

    #[test]
    fn test_twap_single_observation() {
        let prices = [42];
        let weights = [1];

        let twap = compute_twap(&prices, &weights);
        assert_eq!(twap, 42);
    }
}
