# Testing Rules

- One test file per contract: `test/unit/ShieldXRouter.test.js`
- Use `describe` blocks grouped by function name
- Every test must have a descriptive name: "should revert when collateral is insufficient"
- Test all revert conditions with `expect(...).to.be.revertedWith("message")`
- Test event emissions with `expect(...).to.emit(contract, "EventName").withArgs(...)`
- Gas snapshots on settlement functions to ensure they stay under block gas limit

## IMPORTANT: Polkadot Hub Compatibility (from official docs)

- `helpers.time.increase()` — DOES NOT WORK on Polkadot Hub nodes
- `loadFixture` — DOES NOT WORK on Polkadot Hub nodes
- For unit tests: run on Hardhat local network (hardhat node) where these DO work
- For integration tests against live testnet: use real time delays instead
- When testing epoch transitions on testnet, use short epoch durations (e.g., 30 seconds) and actually wait
