// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

/// @title ShieldXVault
/// @notice Collateral vault for ShieldX commit-reveal batch auction protocol
/// @dev Holds native PAS collateral during commit phase. Uses OpenZeppelin AccessControl
///      with ROUTER_ROLE for authorized operations. ReentrancyGuard on all transfers.
contract ShieldXVault is ReentrancyGuard, AccessControl {
    /// @notice Role identifier for the authorized router contract
    bytes32 public constant ROUTER_ROLE = keccak256("ROUTER_ROLE");

    /// @notice Address of the treasury that receives slashed collateral
    address public treasury;

    /// @notice Total collateral balance per user address
    mapping(address => uint256) public collateral;

    /// @notice Collateral amount per commitment hash
    mapping(bytes32 => uint256) public commitCollateral;

    /// @notice Emitted when collateral is locked for a user's commitment
    event CollateralLocked(address indexed user, bytes32 indexed commitHash, uint256 amount);

    /// @notice Emitted when collateral is returned to a user
    event CollateralReturned(address indexed user, bytes32 indexed commitHash, uint256 amount);

    /// @notice Emitted when collateral is slashed to the treasury
    event CollateralSlashed(address indexed user, bytes32 indexed commitHash, uint256 amount);

    /// @notice Emitted when fill proceeds are released to a user
    event FillReleased(address indexed user, uint256 amount);

    /// @notice Initialize the vault with a treasury address
    /// @dev The deployer gets DEFAULT_ADMIN_ROLE and ROUTER_ROLE (updated via setRouter later)
    /// @param _treasury Address that receives slashed collateral
    constructor(address _treasury) {
        require(_treasury != address(0), "ShieldXVault: treasury cannot be zero address");
        treasury = _treasury;
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ROUTER_ROLE, msg.sender);
    }

    /// @notice Update the authorized router address
    /// @dev Only callable by admin. Grants ROUTER_ROLE to new router.
    /// @param _router New router address
    function setRouter(address _router) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_router != address(0), "ShieldXVault: router cannot be zero address");
        _grantRole(ROUTER_ROLE, _router);
    }

    /// @notice Lock collateral for a user's commitment during commit phase
    /// @param user Address of the user locking collateral
    /// @param commitHash The commitment hash to associate this collateral with
    function lockCollateral(address user, bytes32 commitHash) external payable onlyRole(ROUTER_ROLE) {
        require(msg.value > 0, "ShieldXVault: collateral amount must be greater than zero");
        collateral[user] += msg.value;
        commitCollateral[commitHash] = msg.value;
        emit CollateralLocked(user, commitHash, msg.value);
    }

    /// @notice Return collateral for a specific commitment after successful settlement
    /// @param user Address of the user receiving returned collateral
    /// @param commitHash The commitment hash whose collateral to return
    function returnCollateral(address user, bytes32 commitHash) external onlyRole(ROUTER_ROLE) nonReentrant {
        uint256 amount = commitCollateral[commitHash];
        require(amount > 0, "ShieldXVault: no collateral to return");

        commitCollateral[commitHash] = 0;
        collateral[user] -= amount;

        (bool success, ) = payable(user).call{value: amount}("");
        require(success, "ShieldXVault: collateral return transfer failed");

        emit CollateralReturned(user, commitHash, amount);
    }

    /// @notice Slash collateral for a specific commitment to the treasury
    /// @param user Address of the user being slashed
    /// @param commitHash The commitment hash whose collateral to slash
    function slashCollateral(address user, bytes32 commitHash) external onlyRole(ROUTER_ROLE) nonReentrant {
        uint256 amount = commitCollateral[commitHash];
        require(amount > 0, "ShieldXVault: no collateral to slash");

        commitCollateral[commitHash] = 0;
        collateral[user] -= amount;

        (bool success, ) = payable(treasury).call{value: amount}("");
        require(success, "ShieldXVault: collateral slash transfer failed");

        emit CollateralSlashed(user, commitHash, amount);
    }

    /// @notice Release fill proceeds to a user after execution
    /// @param user Address of the user receiving fill proceeds
    /// @param amount Amount of PAS to release (18 decimals)
    function releaseFill(address user, uint256 amount) external onlyRole(ROUTER_ROLE) nonReentrant {
        require(amount > 0, "ShieldXVault: release amount must be greater than zero");
        require(address(this).balance >= amount, "ShieldXVault: insufficient vault balance");

        (bool success, ) = payable(user).call{value: amount}("");
        require(success, "ShieldXVault: fill release transfer failed");

        emit FillReleased(user, amount);
    }

    /// @notice Accept native PAS deposits directly
    receive() external payable {}
}
