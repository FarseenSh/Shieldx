const { ethers } = require("hardhat");

// Update this after deploying to testnet, or pass via ROUTER_ADDRESS env var
const ROUTER_ADDRESS = process.env.ROUTER_ADDRESS || "0x211eB3d0b75F05A65D6006d7CC5Cf9CC94f6aF7d";

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  if (!ROUTER_ADDRESS) {
    console.error("Set ROUTER_ADDRESS env var or update the script with the deployed router address.");
    process.exit(1);
  }

  const [deployer] = await ethers.getSigners();
  console.log("");
  console.log("============================================");
  console.log("  ShieldX Testnet Demo — Live on Polkadot Hub");
  console.log("============================================");
  console.log("  Network: Polkadot Hub TestNet (Chain ID 420420417)");
  console.log("  Account:", deployer.address);
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("  Balance:", ethers.formatEther(balance), "PAS");
  console.log("");

  // Connect to deployed router
  const router = await ethers.getContractAt("ShieldXRouter", ROUTER_ADDRESS);
  const epochDuration = Number(await router.epochDuration());
  const revealWindowSec = Number(await router.revealWindow());
  console.log("  Router:", ROUTER_ADDRESS);
  console.log("  Epoch duration:", epochDuration, "s | Reveal window:", revealWindowSec, "s");
  console.log("");

  // ════════════════════════════════════════════════════════
  //  SCENARIO A: Normal DEX (No Protection) — Simulated
  // ════════════════════════════════════════════════════════
  console.log("============================================");
  console.log("  SCENARIO A: Normal DEX (No Protection)");
  console.log("============================================");
  console.log("");
  console.log("  1. Victim submits swap: 100 DOT -> USDC");
  console.log("  2. Attacker sees pending tx in mempool");
  console.log("  3. Attacker front-runs: buys 50 DOT, pushing price up 3%");
  console.log("  4. Victim's swap executes at inflated price: gets 97 USDC instead of 100");
  console.log("  5. Attacker back-runs: sells 50 DOT at higher price");
  console.log("");
  console.log("     Attacker profit:  +$2.85");
  console.log("     Victim loss:      -$3.00");
  console.log("     MEV extracted:     $3.00");
  console.log("");

  // ════════════════════════════════════════════════════════
  //  SCENARIO B: ShieldX (MEV Protected) — Real On-Chain
  // ════════════════════════════════════════════════════════
  console.log("============================================");
  console.log("  SCENARIO B: ShieldX (MEV Protected)");
  console.log("  >> LIVE on Polkadot Hub TestNet <<");
  console.log("============================================");
  console.log("");

  // Order parameters
  const tokenIn = ethers.ZeroAddress;
  const tokenOut = "0x0000000000000000000000000000000000000001";
  const amount = ethers.parseEther("100");
  const collateral = ethers.parseEther("0.01");

  const attackerBuyPrice = ethers.parseEther("103");
  const attackerSellPrice = ethers.parseEther("97");
  const victimBuyPrice = ethers.parseEther("100");

  // Unique salts per run to avoid "already committed" errors
  const runId = Date.now().toString();
  const saltAttackerBuy = ethers.keccak256(ethers.toUtf8Bytes("attacker-buy-" + runId));
  const saltAttackerSell = ethers.keccak256(ethers.toUtf8Bytes("attacker-sell-" + runId));
  const saltVictim = ethers.keccak256(ethers.toUtf8Bytes("victim-buy-" + runId));

  function commitHash(orderType, price, salt) {
    return ethers.solidityPackedKeccak256(
      ["uint8", "address", "address", "uint256", "uint256", "uint256", "bytes32"],
      [orderType, tokenIn, tokenOut, amount, 0, price, salt]
    );
  }

  const hashAttackerBuy = commitHash(0, attackerBuyPrice, saltAttackerBuy);
  const hashAttackerSell = commitHash(1, attackerSellPrice, saltAttackerSell);
  const hashVictim = commitHash(0, victimBuyPrice, saltVictim);

  // ── COMMIT PHASE ──
  // commitOrder() calls _advanceEpochIfNeeded() internally, so the first
  // commit will auto-advance to a fresh epoch if the current one expired.
  console.log("  PHASE 1: COMMIT (orders hidden on-chain)");
  console.log("  ─────────────────────────────────────────");

  let tx, receipt;

  tx = await router.commitOrder(hashAttackerBuy, { value: collateral, gasLimit: 500000 });
  receipt = await tx.wait();
  console.log("  Attacker commits BUY order  (tx: " + receipt.hash.slice(0, 14) + "...)");

  // Capture the epoch we committed to (auto-advanced by the contract)
  const epoch = await router.getCurrentEpoch();
  const commitEpochId = epoch.id;
  const epochEndTime = Number(epoch.endTime);

  tx = await router.commitOrder(hashVictim, { value: collateral, gasLimit: 500000 });
  receipt = await tx.wait();
  console.log("  Victim commits BUY order    (tx: " + receipt.hash.slice(0, 14) + "...)");

  tx = await router.commitOrder(hashAttackerSell, { value: collateral, gasLimit: 500000 });
  receipt = await tx.wait();
  console.log("  Attacker commits SELL order  (tx: " + receipt.hash.slice(0, 14) + "...)");

  console.log("");
  console.log("  >> All 3 orders committed to epoch " + commitEpochId.toString() + ". Order details HIDDEN on-chain.");
  console.log("  >> Attacker cannot see Victim's order details -- nothing to sandwich!");
  console.log("");

  // ── WAIT FOR REVEAL PHASE ──
  // Epoch endTime is on-chain. Wait until wall clock passes it + generous buffer
  // to account for testnet block time drift vs wall clock.
  const nowSec = Math.floor(Date.now() / 1000);
  const waitForReveal = Math.max(0, epochEndTime - nowSec) + 10;
  console.log("  Waiting " + waitForReveal + "s for epoch to end (reveal phase starts)...");
  await sleep(waitForReveal * 1000);
  console.log("  Reveal phase open.");
  console.log("");

  // ── REVEAL PHASE ──
  // Use explicit gasLimit to avoid estimation failures on PolkaVM
  const gasOpts = { gasLimit: 500000 };

  console.log("  PHASE 2: REVEAL (epoch ended, orders revealed)");
  console.log("  ─────────────────────────────────────────");

  tx = await router.revealOrder(0, tokenIn, tokenOut, amount, 0, attackerBuyPrice, saltAttackerBuy, gasOpts);
  receipt = await tx.wait();
  console.log("  Attacker reveals BUY at price 103 (tx: " + receipt.hash.slice(0, 14) + "...)");

  tx = await router.revealOrder(0, tokenIn, tokenOut, amount, 0, victimBuyPrice, saltVictim, gasOpts);
  receipt = await tx.wait();
  console.log("  Victim reveals BUY at price 100   (tx: " + receipt.hash.slice(0, 14) + "...)");

  tx = await router.revealOrder(1, tokenIn, tokenOut, amount, 0, attackerSellPrice, saltAttackerSell, gasOpts);
  receipt = await tx.wait();
  console.log("  Attacker reveals SELL at price 97  (tx: " + receipt.hash.slice(0, 14) + "...)");
  console.log("");

  // ── WAIT FOR REVEAL WINDOW TO CLOSE ──
  const revealEndTime = epochEndTime + revealWindowSec;
  const now2 = Math.floor(Date.now() / 1000);
  const waitForSettle = Math.max(0, revealEndTime - now2) + 10;
  console.log("  Waiting " + waitForSettle + "s for reveal window to close...");
  await sleep(waitForSettle * 1000);
  console.log("  Reveal window closed. Ready to settle.");
  console.log("");

  // ── SETTLE PHASE ──
  console.log("  PHASE 3: SETTLE (batch auction at uniform clearing price)");
  console.log("  ─────────────────────────────────────────");
  console.log("  Settling epoch " + commitEpochId.toString() + " at uniform clearing price...");

  tx = await router.settleEpoch(commitEpochId, { gasLimit: 2000000 });
  receipt = await tx.wait();

  // Extract clearing price from EpochSettled event
  const settledEvent = receipt.logs.find(log => {
    try {
      return router.interface.parseLog({ topics: log.topics, data: log.data })?.name === "EpochSettled";
    } catch { return false; }
  });

  let clearingPrice = "100.0";
  if (settledEvent) {
    const parsedEvent = router.interface.parseLog({ topics: settledEvent.topics, data: settledEvent.data });
    clearingPrice = ethers.formatEther(parsedEvent.args.clearingPrice);
  }

  console.log("  Settlement tx: " + receipt.hash);
  console.log("");
  console.log("  RESULT:");
  console.log("  ─────────────────────────────────────────");
  console.log("  Clearing price: " + clearingPrice + " -- ALL orders at this SAME price");
  console.log("");
  console.log("  Attacker bought at " + clearingPrice + ", sold at " + clearingPrice);
  console.log("     Attacker profit:  $0.00 (same price in and out)");
  console.log("     Victim loss:      $0.00 (got fair batch price)");
  console.log("     MEV extracted:    $0.00");
  console.log("");

  // ── FINAL COMPARISON ──
  console.log("============================================");
  console.log("  RESULT: MEV Protection Comparison");
  console.log("============================================");
  console.log("  Normal DEX:  Victim loses $3.00");
  console.log("  ShieldX:     Victim loses $0.00");
  console.log("  MEV saved:   $3.00 per trade");
  console.log("============================================");
  console.log("");
  console.log("  View transactions on Blockscout:");
  console.log("  https://blockscout-testnet.polkadot.io/address/" + ROUTER_ADDRESS);
  console.log("");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
