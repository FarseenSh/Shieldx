# Solidity Rules

- Target Solidity 0.8.20 — verified working on PolkaVM by existing Track 2 projects
- All public/external functions must have NatSpec comments (@notice, @param, @return, @dev)
- Every state-changing function must emit an event
- Use `require()` with descriptive error messages
- Use checks-effects-interactions pattern for all external calls
- Add reentrancy guards on vault withdrawal functions
- Gas optimization: avoid storage reads in loops, use memory/calldata where possible
- MockShieldXEngine.sol must exactly replicate Rust PVM contract logic — same weights, same thresholds, same edge cases
- Import paths use relative format: `./interfaces/IShieldXRouter.sol`
