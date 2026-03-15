# ShieldX Security Model

## Threat Model

### 1. Commitment Grinding Attack

**Threat:** Attacker submits many commitments to discover which hash corresponds to which order by brute-forcing the hash preimage.

**Mitigation:** Each commitment uses a random 32-byte salt generated via `crypto.getRandomValues()`. The salt is never submitted on-chain until the reveal phase. Brute-forcing a keccak256 hash with a 256-bit salt requires 2^256 operations — computationally infeasible. The hash includes 7 parameters (`orderType`, `tokenIn`, `tokenOut`, `amountIn`, `minAmountOut`, `maxPrice`, `salt`), making rainbow table attacks impractical.

**Code reference:** `OrderLib.computeCommitHash()` at `contracts/libraries/OrderLib.sol:28`

---

### 2. Selective Revelation Attack

**Threat:** User commits an order, then only reveals if the clearing price is favorable. This creates an optionality that disadvantages honest participants.

**Mitigation:** Collateral slashing. Every commitment requires a minimum collateral bond (configurable, default 0.01 PAS). If a user does not reveal during the reveal window, anyone can call `slashUnrevealed(epochId)` to forfeit their collateral to the protocol treasury. The collateral loss makes selective revelation economically irrational.

**Code reference:** `ShieldXRouter.slashUnrevealed()` at `contracts/core/ShieldXRouter.sol:316`

---

### 3. Epoch Manipulation

**Threat:** Attacker tries to control which orders land in which epoch, grouping vulnerable orders together for exploitation.

**Mitigation:** Epoch boundaries are strictly time-based using `block.timestamp`. No party can advance, delay, or skip epochs. The epoch transitions automatically when time passes the `endTime + revealWindow` threshold. On Polkadot Hub, block timestamps are controlled by validators with BFT finality, making timestamp manipulation economically infeasible.

**Code reference:** `ShieldXRouter._advanceEpochIfNeeded()` at `contracts/core/ShieldXRouter.sol:349`

---

### 4. Clearing Price Manipulation

**Threat:** Attacker submits orders at extreme prices to skew the batch clearing price, extracting value from other participants.

**Mitigation:** Multi-layer defense:
1. **Batch auction mechanics** — The uniform clearing price is determined by the intersection of supply and demand curves. Extreme outlier orders only fill if the clearing price reaches them, meaning the attacker pays the extreme price they set.
2. **Manipulation detection** — The Rust PVM engine runs three detection algorithms:
   - **Wash trading** (score 70): Detects price clustering patterns (>50% of price pairs within 0.1%)
   - **Spoofing** (score 60): Detects single orders dominating >50% of total volume
   - **Market impact** (score 50): Detects extreme price spread (max > 3x min)
3. **Pausable circuit breaker** — If manipulation is detected, the protocol can be paused by the PAUSER_ROLE holder.

**Code reference:** `MockShieldXEngine.detectManipulation()` at `contracts/mock/MockShieldXEngine.sol:136`

---

### 5. Griefing via Mass Commits

**Threat:** Attacker floods an epoch with thousands of commitments to DOS the settlement computation or exhaust the block gas limit.

**Mitigation:** Each commitment requires collateral (minimum 0.01 PAS). The cost of griefing scales linearly: 1,000 fake orders costs 10 PAS in locked collateral. If the attacker doesn't reveal, all collateral is slashed to the treasury. Additionally, settlement gas costs are bounded by the batch auction algorithm (O(N log N) for N orders with stable insertion sort).

**Gas benchmark:** Settlement of 20 orders uses ~3.5M gas (well within the 30M block gas limit).

---

### 6. Front-Running the Reveal

**Threat:** Attacker monitors the mempool during the reveal phase, sees other users' revealed orders, and front-runs the remaining reveals to gain information advantage.

**Mitigation:** Reveal order is economically irrelevant. All revealed orders in an epoch settle at the **same uniform clearing price** regardless of when they were revealed. Front-running a reveal provides zero economic advantage because:
- The clearing price is computed from ALL revealed orders, not from the order of revelation
- The attacker's own order was already committed in the commit phase — they cannot change it
- The only outcome of not revealing is collateral slashing

---

### 7. Collateral Extraction

**Threat:** Attacker exploits reentrancy or access control flaws to drain the collateral vault.

**Mitigation:** Defense in depth:
1. **ReentrancyGuard** — OpenZeppelin's `nonReentrant` modifier on all withdrawal functions (`returnCollateral`, `slashCollateral`, `releaseFill`)
2. **AccessControl** — Only the `ROUTER_ROLE` (granted exclusively to the ShieldXRouter contract) can call vault functions. Manual role-based access via OpenZeppelin's `AccessControl`
3. **Checks-effects-interactions** — All state updates happen before external calls
4. **Per-commitment tracking** — Collateral is tracked per commitment hash, preventing double-withdrawal

**Code reference:** `ShieldXVault` at `contracts/core/ShieldXVault.sol` — inherits `ReentrancyGuard, AccessControl`

---

### 8. Emergency Scenarios

**Threat:** Critical bug or exploit discovered in production that requires immediate protocol intervention.

**Mitigation:** Pausable circuit breaker:
- `PAUSER_ROLE` holders can call `pause()` to immediately block new commits and reveals
- Settlement of existing orders still works when paused — users' funds are not locked
- `unpause()` re-enables normal operation after the issue is resolved
- Role separation: `PAUSER_ROLE` is independent from `DEFAULT_ADMIN_ROLE`, enabling rapid response without full admin access

**Code reference:** `ShieldXRouter.pause()` / `unpause()` at `contracts/core/ShieldXRouter.sol:522-531`

---

## Access Control Matrix

| Role | Granted To | Permissions |
|------|-----------|-------------|
| `DEFAULT_ADMIN_ROLE` | Deployer | Grant/revoke roles, set protocol fee |
| `SETTLER_ROLE` | Deployer | Settle epochs (also publicly callable) |
| `PAUSER_ROLE` | Deployer | Pause/unpause protocol |
| `ROUTER_ROLE` | Router contract | Lock/return/slash collateral in vault |
| `ADMIN_ROLE` | Deployer | Register parachains in executor |

## Audit Status

- **Pre-audit.** All contracts are open-source for community review.
- **238 automated tests** across three frameworks (Hardhat, Cargo, Playwright) covering normal flows, edge cases, boundary conditions, and attack scenarios.
- **Rust PVM engine** has an independent 38-test suite producing identical results to the Solidity mock — cross-validated correctness.
- **OpenZeppelin contracts** used for security primitives (AccessControl, Pausable, ReentrancyGuard) — battle-tested code, not custom implementations.
- Eligible for **Polkadot Assurance Legion** audit subsidy assessment.

## Known Limitations

1. **No custom precompile registration** — Custom Rust precompile registration is not yet available on Polkadot Hub as of March 2026. The Rust PVM contract runs as a deployed smart contract via PolkaVM, not a runtime precompile. This means it's callable via contract calls rather than a fixed precompile address.

2. **XCM query limitations** — Full XCM cross-chain state queries (`new_query` / `take_response`) are on the Polkadot SDK roadmap. Current XCM integration uses `send()` and `execute()` which are available today. Synchronous cross-chain price queries will be possible when the query API ships.

3. **Simplified clearing price** — The batch auction uses a uniform price model with midpoint clearing at the supply-demand intersection. Production deployment would benefit from a more sophisticated demand-supply curve intersection with volume weighting and partial fill optimization.

4. **Single-asset collateral** — Collateral is currently native PAS only. A production version would support ERC-20 collateral tokens and multi-asset bonds.

5. **Epoch duration trade-offs** — Short epochs (30s testnet) provide fast settlement but limit batch size. Long epochs increase batch size (better price discovery) but increase capital lockup time. Optimal epoch duration requires empirical tuning based on market conditions.

## Responsible Disclosure

If you discover a security vulnerability in ShieldX, please report it responsibly:

- **Email:** farseen@shieldx.io
- **GitHub:** Open a private security advisory at [github.com/FarseenSh/Shieldx/security](https://github.com/FarseenSh/Shieldx/security)

Do not disclose vulnerabilities publicly until a fix has been deployed.
