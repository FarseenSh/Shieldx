// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title OrderLib
/// @notice Order data structures and commitment hash computation for ShieldX
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

    /// @notice Generate commitment hash from order params + salt
    /// @dev The salt must be random and kept secret until reveal phase
    /// @param orderType BUY or SELL
    /// @param tokenIn Address of token being sold (address(0) for native PAS/DOT)
    /// @param tokenOut Address of token being bought (address(0) for native PAS/DOT)
    /// @param amountIn Amount of tokenIn (18 decimals)
    /// @param minAmountOut Minimum acceptable output (slippage protection)
    /// @param maxPrice Max price willing to pay (buys) or min price willing to accept (sells)
    /// @param salt Random bytes32 salt for commitment hiding
    /// @return commitHash The keccak256 hash used as the commitment
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
