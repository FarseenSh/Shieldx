// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IShieldXEngine.sol";
import "../libraries/OrderLib.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title ShieldXSettlement
/// @notice Batch settlement bridge between ShieldXRouter and the batch auction engine
/// @dev Uses OpenZeppelin AccessControl with ROUTER_ROLE for authorized operations.
contract ShieldXSettlement is AccessControl {
    /// @notice Role identifier for the authorized router contract
    bytes32 public constant ROUTER_ROLE = keccak256("ROUTER_ROLE");

    /// @notice Address of the batch auction engine (MockShieldXEngine or Rust PVM contract)
    address public engineAddress;

    /// @notice Address of the XCM executor for cross-chain fills
    address public xcmExecutor;

    /// @notice Emitted when a batch is settled via the engine
    event BatchSettled(uint256 clearingPrice, uint256 buyOrderCount, uint256 sellOrderCount);

    /// @notice Emitted when a fill is executed
    event FillExecuted(address indexed trader, address indexed tokenOut, uint256 clearingPrice, uint256 fillAmount);

    /// @notice Emitted when the router address is updated
    event RouterUpdated(address indexed oldRouter, address indexed newRouter);

    /// @notice Emitted when the XCM executor address is updated
    event XcmExecutorUpdated(address indexed oldExecutor, address indexed newExecutor);

    /// @notice Initialize the settlement with the engine address
    /// @param _engineAddress Address of the batch auction engine contract
    constructor(address _engineAddress) {
        require(_engineAddress != address(0), "ShieldXSettlement: engine cannot be zero address");
        engineAddress = _engineAddress;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ROUTER_ROLE, msg.sender);
    }

    /// @notice Compute batch settlement by forwarding orders to the engine
    /// @param buyOrders Array of buy orders as OrderLib.Order structs
    /// @param sellOrders Array of sell orders as OrderLib.Order structs
    /// @return result The BatchResult from the engine with clearing price and fills
    function computeBatchSettlement(
        OrderLib.Order[] memory buyOrders,
        OrderLib.Order[] memory sellOrders
    ) external onlyRole(ROUTER_ROLE) returns (IShieldXEngine.BatchResult memory result) {
        IShieldXEngine engine = IShieldXEngine(engineAddress);
        result = engine.computeBatchAuction(buyOrders, sellOrders);
        emit BatchSettled(result.clearingPrice, buyOrders.length, sellOrders.length);
        return result;
    }

    /// @notice Execute a single fill after batch settlement
    /// @param trader Address receiving the fill
    /// @param tokenOut Output token address
    /// @param clearingPrice The clearing price used for this fill
    /// @param fillAmount The amount to fill
    function executeFill(
        address trader,
        address tokenOut,
        uint256 clearingPrice,
        uint256 fillAmount
    ) external onlyRole(ROUTER_ROLE) {
        emit FillExecuted(trader, tokenOut, clearingPrice, fillAmount);
    }

    /// @notice Update the authorized router address
    /// @param _router New router address
    function setRouter(address _router) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_router != address(0), "ShieldXSettlement: router cannot be zero address");
        _grantRole(ROUTER_ROLE, _router);
        emit RouterUpdated(address(0), _router);
    }

    /// @notice Set the XCM executor address for cross-chain fills
    /// @param _executor New executor address
    function setXcmExecutor(address _executor) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_executor != address(0), "ShieldXSettlement: executor cannot be zero address");
        address oldExecutor = xcmExecutor;
        xcmExecutor = _executor;
        emit XcmExecutorUpdated(oldExecutor, _executor);
    }
}
