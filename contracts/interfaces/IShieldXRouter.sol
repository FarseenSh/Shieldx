// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../libraries/OrderLib.sol";
import "../libraries/EpochLib.sol";

/// @title IShieldXRouter
/// @notice Public interface for external protocols to integrate ShieldX MEV protection
/// @dev Import this interface to interact with a deployed ShieldXRouter contract.
///      See docs/INTEGRATION_GUIDE.md for usage examples.
interface IShieldXRouter {
    /// @notice Submit a hidden order commitment with collateral
    /// @dev Requires msg.value >= minCollateral. Order details are hidden until reveal.
    /// @param commitHash keccak256(abi.encodePacked(orderType, tokenIn, tokenOut, amountIn, minAmountOut, maxPrice, salt))
    function commitOrder(bytes32 commitHash) external payable;

    /// @notice Reveal a previously committed order
    /// @dev Must be called during the reveal window. Hash of params must match commitment.
    /// @param orderType BUY (0) or SELL (1)
    /// @param tokenIn Address of token being sold (address(0) for native PAS)
    /// @param tokenOut Address of token being bought
    /// @param amountIn Amount of tokenIn (18 decimals)
    /// @param minAmountOut Minimum acceptable output (slippage protection)
    /// @param maxPrice Maximum price for buys, minimum price for sells
    /// @param salt Random bytes32 salt used when creating the commitment
    function revealOrder(
        OrderLib.OrderType orderType,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        uint256 maxPrice,
        bytes32 salt
    ) external;

    /// @notice Settle a completed epoch at uniform clearing price
    /// @dev Callable by anyone after the reveal window closes
    /// @param epochId The epoch to settle
    function settleEpoch(uint256 epochId) external;

    /// @notice Get the current active epoch data
    /// @return The current epoch struct with timing, counts, and settlement info
    function getCurrentEpoch() external view returns (EpochLib.Epoch memory);

    /// @notice Check if the current epoch is accepting new commitments
    /// @return True if the current epoch is in the commit phase
    function isInCommitPhase() external view returns (bool);

    /// @notice Check if the current epoch is in the reveal window
    /// @return True if the current epoch is in the reveal phase
    function isInRevealPhase() external view returns (bool);

    /// @notice Get the MEV surplus saved for a user in a specific epoch
    /// @param epochId The epoch to query
    /// @param user The user address
    /// @return The surplus amount saved (18 decimals)
    function getUserSurplus(uint256 epochId, address user) external view returns (uint256);

    /// @notice Get the total MEV surplus saved across all users in an epoch
    /// @param epochId The epoch to query
    /// @return The total surplus amount (18 decimals)
    function getEpochTotalSurplus(uint256 epochId) external view returns (uint256);

    /// @notice Get the number of commitments in an epoch
    /// @param epochId The epoch to query
    /// @return Number of commitment hashes
    function getEpochCommitmentCount(uint256 epochId) external view returns (uint256);
}
