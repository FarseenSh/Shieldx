// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

// Source: https://docs.polkadot.com/smart-contracts/precompiles/xcm/
// Verified March 2026

/// @dev The on-chain address of the XCM (Cross-Consensus Messaging) precompile.
address constant XCM_PRECOMPILE_ADDRESS = address(0xA0000);

/// @title XCM Precompile Interface
/// @notice A low-level interface for interacting with pallet_xcm on Polkadot Hub.
/// @dev All XCM messages must be SCALE-encoded.
/// @dev Call weighMessage() first, then execute() with the returned weight.
interface IXcm {
    /// @notice Weight v2 used for measurement for an XCM execution
    struct Weight {
        /// @custom:property The computational time used to execute some logic based on reference hardware.
        uint64 refTime;
        /// @custom:property The size of the proof needed to execute some logic.
        uint64 proofSize;
    }

    /// @notice Executes an XCM message locally on the current chain with the caller's origin.
    /// @dev Internally calls pallet_xcm::execute. This is the main entrypoint.
    /// @param message A SCALE-encoded Versioned XCM message.
    /// @param weight The maximum allowed Weight for execution.
    function execute(bytes calldata message, Weight calldata weight) external;

    /// @notice Sends an XCM message to another parachain or consensus system.
    /// @dev Internally calls pallet_xcm::send. Does not require weight param.
    /// @param destination SCALE-encoded destination MultiLocation.
    /// @param message SCALE-encoded Versioned XCM message.
    function send(bytes calldata destination, bytes calldata message) external;

    /// @notice Estimates the Weight required to execute a given XCM message.
    /// @param message SCALE-encoded Versioned XCM message to analyze.
    /// @return weight Struct containing estimated refTime and proofSize.
    function weighMessage(bytes calldata message) external view returns (Weight memory weight);
}
