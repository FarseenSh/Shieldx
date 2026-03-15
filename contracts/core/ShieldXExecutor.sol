// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "../interfaces/IXCM.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title ShieldXExecutor
/// @notice XCM cross-chain execution module for ShieldX protocol
/// @dev Routes matched fills to target parachains via the XCM precompile.
///      Uses OpenZeppelin AccessControl with ROUTER_ROLE and ADMIN_ROLE.
contract ShieldXExecutor is AccessControl {
    /// @notice Role identifier for the authorized router
    bytes32 public constant ROUTER_ROLE = keccak256("ROUTER_ROLE");

    /// @notice Role identifier for admin operations (parachain registration)
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    /// @notice XCM precompile interface
    IXcm public xcm;

    /// @notice Parachain routing table: paraId => SCALE-encoded destination
    mapping(uint32 => bytes) public parachainDestinations;

    /// @notice Emitted when an order is routed to a parachain via XCM
    /// @param paraId The target parachain ID
    /// @param trader The address whose fill is being routed
    /// @param amount The fill amount being sent
    /// @param orderHash Hash identifying this specific fill
    event XcmOrderRouted(
        uint32 indexed paraId,
        address indexed trader,
        uint256 amount,
        bytes32 orderHash
    );

    /// @notice Emitted when a parachain is registered in the routing table
    /// @param paraId The registered parachain ID
    event ParachainRegistered(uint32 indexed paraId);

    /// @notice Initialize the executor
    /// @dev Sets deployer as admin and router. Connects to XCM precompile.
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ADMIN_ROLE, msg.sender);
        _grantRole(ROUTER_ROLE, msg.sender);
        xcm = IXcm(XCM_PRECOMPILE_ADDRESS);
    }

    /// @notice Update the authorized router address
    /// @param _router New router address
    function setRouter(address _router) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_router != address(0), "ShieldXExecutor: router cannot be zero address");
        _grantRole(ROUTER_ROLE, _router);
    }

    /// @notice Register a parachain destination for order routing
    /// @param paraId The parachain ID (e.g., 2034 for Hydration, 2030 for Bifrost)
    /// @param destination SCALE-encoded destination MultiLocation
    function registerParachain(uint32 paraId, bytes calldata destination) external onlyRole(ADMIN_ROLE) {
        require(destination.length > 0, "ShieldXExecutor: empty destination");
        parachainDestinations[paraId] = destination;
        emit ParachainRegistered(paraId);
    }

    /// @notice Execute a cross-chain fill via XCM
    /// @dev Routes the matched order to the target parachain for execution.
    ///      Builds XCM message, weighs it, then executes via precompile.
    /// @param trader Address of the trader receiving the fill
    /// @param tokenOut The output token address (used to determine target parachain)
    /// @param fillAmount The amount to transfer cross-chain
    function executeXcmFill(
        address trader,
        address tokenOut,
        uint256 fillAmount
    ) external onlyRole(ROUTER_ROLE) {
        uint32 targetPara = _getTargetParachain(tokenOut);
        bytes memory destination = parachainDestinations[targetPara];
        require(destination.length > 0, "ShieldXExecutor: parachain not registered");

        // Build XCM message for asset transfer
        bytes memory xcmMessage = _buildXcmTransferMessage(trader, tokenOut, fillAmount);

        // Weigh the message first, then execute
        IXcm.Weight memory weight = xcm.weighMessage(xcmMessage);
        xcm.execute(xcmMessage, weight);

        bytes32 orderHash = keccak256(abi.encodePacked(trader, tokenOut, fillAmount));
        emit XcmOrderRouted(targetPara, trader, fillAmount, orderHash);
    }

    /// @notice Send a cross-chain message to query prices from parachain DEXs
    /// @dev Sends an XCM message to the target parachain's DEX
    /// @param paraId Target parachain ID
    /// @param tokenA First token in the pair
    /// @param tokenB Second token in the pair
    /// @return queryMessage The XCM message that was sent
    function queryParachainPrice(
        uint32 paraId,
        address tokenA,
        address tokenB
    ) external returns (bytes memory queryMessage) {
        bytes memory destination = parachainDestinations[paraId];
        require(destination.length > 0, "ShieldXExecutor: parachain not registered");

        queryMessage = _buildPriceQueryMessage(tokenA, tokenB);
        xcm.send(destination, queryMessage);
        return queryMessage;
    }

    /// @notice Get the registered destination for a parachain
    /// @param paraId The parachain ID to look up
    /// @return The SCALE-encoded destination (empty bytes if not registered)
    function getParachainDestination(uint32 paraId) external view returns (bytes memory) {
        return parachainDestinations[paraId];
    }

    /// @notice Determine which parachain to route a token to
    /// @dev Returns default parachain ID based on token address.
    ///      In production, this would use a registry lookup.
    /// @param token The token address to route
    /// @return paraId The target parachain ID
    function getTargetParachain(address token) external pure returns (uint32) {
        return _getTargetParachain(token);
    }

    /// @notice Build a SCALE-encoded XCM transfer message
    /// @dev Encodes WithdrawAsset + BuyExecution + DepositAsset pattern (XCM v4)
    /// @param beneficiary Address to receive the assets on the target chain
    /// @param token Token address being transferred
    /// @param amount Amount to transfer
    /// @return The encoded XCM message
    function buildXcmTransferMessage(
        address beneficiary,
        address token,
        uint256 amount
    ) external pure returns (bytes memory) {
        return _buildXcmTransferMessage(beneficiary, token, amount);
    }

    // ═══════════════════════════════════════════════════════════
    // INTERNAL HELPERS
    // ═══════════════════════════════════════════════════════════

    function _buildXcmTransferMessage(
        address beneficiary,
        address,
        uint256
    ) internal pure returns (bytes memory) {
        // SCALE-encoded XCM v4 message:
        // WithdrawAsset + BuyExecution + DepositAsset
        // NOTE: Simplified encoding for hackathon. Production would use PAPI.
        bytes memory prefix = abi.encodePacked(
            uint8(0x05),  // XCM version prefix (v4)
            uint8(0x0c),  // number of instructions (3)
            uint8(0x00), uint8(0x04), uint8(0x01), uint8(0x00), // WithdrawAsset
            uint8(0x00), uint8(0x03), uint8(0x00),               // BuyExecution
            uint8(0x0d), uint8(0x01), uint8(0x01), uint8(0x00)  // DepositAsset
        );
        return abi.encodePacked(prefix, bytes20(beneficiary));
    }

    function _buildPriceQueryMessage(
        address tokenA,
        address tokenB
    ) internal pure returns (bytes memory) {
        return abi.encodePacked(
            uint8(0x05),  // version
            bytes20(tokenA),
            bytes20(tokenB)
        );
    }

    function _getTargetParachain(address) internal pure returns (uint32) {
        // Default to Hydration DEX (paraId 2034)
        // In production, would be a registry lookup
        return 2034;
    }
}
