// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title EpochLib
/// @notice Epoch management utilities for ShieldX batch auction timing
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

    /// @notice Check if epoch is in commit phase
    /// @param epoch The epoch to check
    /// @return True if current time is before epoch end
    function isCommitPhase(Epoch storage epoch) internal view returns (bool) {
        return block.timestamp <= epoch.endTime;
    }

    /// @notice Check if epoch is in reveal phase
    /// @param epoch The epoch to check
    /// @param revealWindow Duration of the reveal window in seconds
    /// @return True if current time is in the reveal window
    function isRevealPhase(Epoch storage epoch, uint256 revealWindow) internal view returns (bool) {
        return block.timestamp > epoch.endTime &&
               block.timestamp <= epoch.endTime + revealWindow;
    }

    /// @notice Check if epoch is ready for settlement
    /// @param epoch The epoch to check
    /// @param revealWindow Duration of the reveal window in seconds
    /// @return True if reveal window has passed and epoch is not yet settled
    function isSettleReady(Epoch storage epoch, uint256 revealWindow) internal view returns (bool) {
        return block.timestamp > epoch.endTime + revealWindow && !epoch.settled;
    }
}
