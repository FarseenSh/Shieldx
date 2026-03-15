// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IShieldXEngine.sol";
import "../libraries/OrderLib.sol";

/// @title ShieldXSettlement
/// @notice Batch settlement bridge between ShieldXRouter and the batch auction engine
/// @dev Accepts split buy/sell order arrays from the Router, forwards to the engine
///      (MockShieldXEngine or Rust PVM contract), and returns the BatchResult.
contract ShieldXSettlement {
    /// @notice Address of the batch auction engine (MockShieldXEngine or Rust PVM contract)
    address public engineAddress;

    /// @notice Address of the authorized router contract
    address public router;

    /// @notice Address of the XCM executor for cross-chain fills
    address public xcmExecutor;

    /// @notice Address of the contract owner (deployer)
    address public owner;

    /// @notice Emitted when a batch is settled via the engine
    /// @param clearingPrice The computed uniform clearing price
    /// @param buyOrderCount Number of buy orders in the batch
    /// @param sellOrderCount Number of sell orders in the batch
    event BatchSettled(uint256 clearingPrice, uint256 buyOrderCount, uint256 sellOrderCount);

    /// @notice Emitted when a fill is executed
    /// @param trader The address receiving the fill
    /// @param tokenOut The output token address
    /// @param clearingPrice The clearing price used
    /// @param fillAmount The amount filled
    event FillExecuted(address indexed trader, address indexed tokenOut, uint256 clearingPrice, uint256 fillAmount);

    /// @notice Emitted when the router address is updated
    /// @param oldRouter Previous router address
    /// @param newRouter New router address
    event RouterUpdated(address indexed oldRouter, address indexed newRouter);

    /// @notice Emitted when the XCM executor address is updated
    /// @param oldExecutor Previous executor address
    /// @param newExecutor New executor address
    event XcmExecutorUpdated(address indexed oldExecutor, address indexed newExecutor);

    /// @notice Restricts function access to the authorized router
    modifier onlyRouter() {
        require(msg.sender == router, "ShieldXSettlement: caller is not the router");
        _;
    }

    /// @notice Restricts function access to the contract owner
    modifier onlyOwner() {
        require(msg.sender == owner, "ShieldXSettlement: caller is not the owner");
        _;
    }

    /// @notice Initialize the settlement with the engine address
    /// @dev Deployer becomes both owner and initial router (updated via setRouter later)
    /// @param _engineAddress Address of the batch auction engine contract
    constructor(address _engineAddress) {
        require(_engineAddress != address(0), "ShieldXSettlement: engine cannot be zero address");
        engineAddress = _engineAddress;
        owner = msg.sender;
        router = msg.sender;
    }

    /// @notice Compute batch settlement by forwarding orders to the engine
    /// @dev Called by the Router after splitting RevealedOrders into buy/sell arrays
    /// @param buyOrders Array of buy orders as OrderLib.Order structs
    /// @param sellOrders Array of sell orders as OrderLib.Order structs
    /// @return result The BatchResult from the engine with clearing price and fills
    function computeBatchSettlement(
        OrderLib.Order[] memory buyOrders,
        OrderLib.Order[] memory sellOrders
    ) external onlyRouter returns (IShieldXEngine.BatchResult memory result) {
        IShieldXEngine engine = IShieldXEngine(engineAddress);
        result = engine.computeBatchAuction(buyOrders, sellOrders);
        emit BatchSettled(result.clearingPrice, buyOrders.length, sellOrders.length);
        return result;
    }

    /// @notice Execute a single fill after batch settlement
    /// @dev Called by the Router for non-native token fills
    /// @param trader Address receiving the fill
    /// @param tokenOut Output token address
    /// @param clearingPrice The clearing price used for this fill
    /// @param fillAmount The amount to fill
    function executeFill(
        address trader,
        address tokenOut,
        uint256 clearingPrice,
        uint256 fillAmount
    ) external onlyRouter {
        emit FillExecuted(trader, tokenOut, clearingPrice, fillAmount);
    }

    /// @notice Update the authorized router address
    /// @dev Only callable by the contract owner
    /// @param _router New router address
    function setRouter(address _router) external onlyOwner {
        require(_router != address(0), "ShieldXSettlement: router cannot be zero address");
        address oldRouter = router;
        router = _router;
        emit RouterUpdated(oldRouter, _router);
    }

    /// @notice Set the XCM executor address for cross-chain fills
    /// @dev Only callable by the contract owner
    /// @param _executor New executor address
    function setXcmExecutor(address _executor) external onlyOwner {
        require(_executor != address(0), "ShieldXSettlement: executor cannot be zero address");
        address oldExecutor = xcmExecutor;
        xcmExecutor = _executor;
        emit XcmExecutorUpdated(oldExecutor, _executor);
    }
}
