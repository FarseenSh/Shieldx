// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title ShieldXVault
/// @notice Collateral vault for ShieldX commit-reveal batch auction protocol
/// @dev Holds native PAS collateral during commit phase. Only the router can
///      lock, return, slash, or release funds. Uses ReentrancyGuard on all
///      functions that transfer native currency.
contract ShieldXVault is ReentrancyGuard {
    /// @notice Address of the treasury that receives slashed collateral
    address public treasury;

    /// @notice Address of the authorized router contract
    address public router;

    /// @notice Collateral balance per user address
    mapping(address => uint256) public collateral;

    /// @notice Emitted when collateral is locked for a user
    /// @param user The address whose collateral was locked
    /// @param amount The amount of PAS locked (18 decimals)
    event CollateralLocked(address indexed user, uint256 amount);

    /// @notice Emitted when collateral is returned to a user
    /// @param user The address receiving the returned collateral
    /// @param amount The amount of PAS returned (18 decimals)
    event CollateralReturned(address indexed user, uint256 amount);

    /// @notice Emitted when collateral is slashed to the treasury
    /// @param user The address whose collateral was slashed
    /// @param amount The amount of PAS slashed (18 decimals)
    event CollateralSlashed(address indexed user, uint256 amount);

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

    /// @notice Lock collateral for a user during commit phase
    /// @dev Called by router when user commits an order. Requires msg.value > 0.
    /// @param user Address of the user locking collateral
    function lockCollateral(address user) external payable onlyRouter {
        require(msg.value > 0, "ShieldXVault: collateral amount must be greater than zero");
        collateral[user] += msg.value;
        emit CollateralLocked(user, msg.value);
    }

    /// @notice Return collateral to a user after successful settlement
    /// @dev Uses checks-effects-interactions pattern. Protected by nonReentrant.
    /// @param user Address of the user receiving returned collateral
    function returnCollateral(address user) external onlyRouter nonReentrant {
        uint256 amount = collateral[user];
        require(amount > 0, "ShieldXVault: no collateral to return");

        // Effects before interactions
        collateral[user] = 0;

        // Interaction
        (bool success, ) = payable(user).call{value: amount}("");
        require(success, "ShieldXVault: collateral return transfer failed");

        emit CollateralReturned(user, amount);
    }

    /// @notice Slash a user's collateral to the treasury (penalty for manipulation)
    /// @dev Uses checks-effects-interactions pattern. Protected by nonReentrant.
    /// @param user Address of the user being slashed
    function slashCollateral(address user) external onlyRouter nonReentrant {
        uint256 amount = collateral[user];
        require(amount > 0, "ShieldXVault: no collateral to slash");

        // Effects before interactions
        collateral[user] = 0;

        // Interaction
        (bool success, ) = payable(treasury).call{value: amount}("");
        require(success, "ShieldXVault: collateral slash transfer failed");

        emit CollateralSlashed(user, amount);
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
