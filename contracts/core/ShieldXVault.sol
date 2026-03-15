// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ShieldXVault
/// @notice Collateral vault for ShieldX commit-reveal batch auction protocol
/// @dev Holds native PAS collateral during commit phase. Only the router can
///      lock, return, slash, or release funds. Uses ReentrancyGuard on all
///      functions that transfer native currency. Tracks collateral per-commitment
///      via commitCollateral mapping for granular return/slash operations.
contract ShieldXVault is ReentrancyGuard {
    /// @notice Address of the treasury that receives slashed collateral
    address public treasury;

    /// @notice Address of the authorized router contract
    address public router;

    /// @notice Total collateral balance per user address
    mapping(address => uint256) public collateral;

    /// @notice Collateral amount per commitment hash
    mapping(bytes32 => uint256) public commitCollateral;

    /// @notice Emitted when collateral is locked for a user's commitment
    /// @param user The address whose collateral was locked
    /// @param commitHash The commitment hash this collateral is associated with
    /// @param amount The amount of PAS locked (18 decimals)
    event CollateralLocked(address indexed user, bytes32 indexed commitHash, uint256 amount);

    /// @notice Emitted when collateral is returned to a user
    /// @param user The address receiving the returned collateral
    /// @param commitHash The commitment hash whose collateral was returned
    /// @param amount The amount of PAS returned (18 decimals)
    event CollateralReturned(address indexed user, bytes32 indexed commitHash, uint256 amount);

    /// @notice Emitted when collateral is slashed to the treasury
    /// @param user The address whose collateral was slashed
    /// @param commitHash The commitment hash whose collateral was slashed
    /// @param amount The amount of PAS slashed (18 decimals)
    event CollateralSlashed(address indexed user, bytes32 indexed commitHash, uint256 amount);

    /// @notice Emitted when fill proceeds are released to a user
    /// @param user The address receiving the fill proceeds
    /// @param amount The amount of PAS released (18 decimals)
    event FillReleased(address indexed user, uint256 amount);

    /// @notice Restricts function access to the authorized router
    modifier onlyRouter() {
        require(msg.sender == router, "ShieldXVault: caller is not the router");
        _;
    }

    /// @notice Initialize the vault with a treasury address
    /// @dev The deployer is set as the initial router. Call setRouter() to update.
    /// @param _treasury Address that receives slashed collateral
    constructor(address _treasury) {
        require(_treasury != address(0), "ShieldXVault: treasury cannot be zero address");
        treasury = _treasury;
        router = msg.sender;
    }

    /// @notice Update the authorized router address
    /// @dev Only callable by the current router
    /// @param _router New router address
    function setRouter(address _router) external onlyRouter {
        require(_router != address(0), "ShieldXVault: router cannot be zero address");
        router = _router;
    }

    /// @notice Lock collateral for a user's commitment during commit phase
    /// @dev Called by router when user commits an order. Requires msg.value > 0.
    /// @param user Address of the user locking collateral
    /// @param commitHash The commitment hash to associate this collateral with
    function lockCollateral(address user, bytes32 commitHash) external payable onlyRouter {
        require(msg.value > 0, "ShieldXVault: collateral amount must be greater than zero");
        collateral[user] += msg.value;
        commitCollateral[commitHash] = msg.value;
        emit CollateralLocked(user, commitHash, msg.value);
    }

    /// @notice Return collateral for a specific commitment after successful settlement
    /// @dev Uses checks-effects-interactions pattern. Protected by nonReentrant.
    /// @param user Address of the user receiving returned collateral
    /// @param commitHash The commitment hash whose collateral to return
    function returnCollateral(address user, bytes32 commitHash) external onlyRouter nonReentrant {
        uint256 amount = commitCollateral[commitHash];
        require(amount > 0, "ShieldXVault: no collateral to return");

        // Effects before interactions
        commitCollateral[commitHash] = 0;
        collateral[user] -= amount;

        // Interaction
        (bool success, ) = payable(user).call{value: amount}("");
        require(success, "ShieldXVault: collateral return transfer failed");

        emit CollateralReturned(user, commitHash, amount);
    }

    /// @notice Slash collateral for a specific commitment to the treasury
    /// @dev Uses checks-effects-interactions pattern. Protected by nonReentrant.
    /// @param user Address of the user being slashed
    /// @param commitHash The commitment hash whose collateral to slash
    function slashCollateral(address user, bytes32 commitHash) external onlyRouter nonReentrant {
        uint256 amount = commitCollateral[commitHash];
        require(amount > 0, "ShieldXVault: no collateral to slash");

        // Effects before interactions
        commitCollateral[commitHash] = 0;
        collateral[user] -= amount;

        // Interaction
        (bool success, ) = payable(treasury).call{value: amount}("");
        require(success, "ShieldXVault: collateral slash transfer failed");

        emit CollateralSlashed(user, commitHash, amount);
    }

    /// @notice Release fill proceeds to a user after execution
    /// @dev Uses checks-effects-interactions pattern. Protected by nonReentrant.
    /// @param user Address of the user receiving fill proceeds
    /// @param amount Amount of PAS to release (18 decimals)
    function releaseFill(address user, uint256 amount) external onlyRouter nonReentrant {
        require(amount > 0, "ShieldXVault: release amount must be greater than zero");
        require(address(this).balance >= amount, "ShieldXVault: insufficient vault balance");

        // Interaction
        (bool success, ) = payable(user).call{value: amount}("");
        require(success, "ShieldXVault: fill release transfer failed");

        emit FillReleased(user, amount);
    }

    /// @notice Accept native PAS deposits directly
    /// @dev Allows the vault to receive PAS without calling lockCollateral
    receive() external payable {}
}
