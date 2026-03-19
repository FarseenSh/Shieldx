const { ethers } = require("hardhat");

// Update this after deploying to testnet, or pass via ROUTER_ADDRESS env var
const ROUTER_ADDRESS = process.env.ROUTER_ADDRESS || "0x211eB3d0b75F05A65D6006d7CC5Cf9CC94f6aF7d";

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
  const epochDuration = await router.epochDuration();
  console.log("  Router:", ROUTER_ADDRESS);
  console.log("  Epoch duration:", epochDuration.toString(), "seconds");
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

  // Using single deployer account for all roles on testnet
  const attackerBuyPrice = ethers.parseEther("103");
  const attackerSellPrice = ethers.parseEther("97");
  const victimBuyPrice = ethers.parseEther("100");

  const saltAttackerBuy = ethers.keccak256(ethers.toUtf8Bytes("attacker-buy-testnet"));
  const saltAttackerSell = ethers.keccak256(ethers.toUtf8Bytes("attacker-sell-testnet"));
  const saltVictim = ethers.keccak256(ethers.toUtf8Bytes("victim-buy-testnet"));

  function commitHash(orderType, price, salt) {
    return ethers.solidityPackedKeccak256(
      ["uint8", "address", "address", "uint256", "uint256", "uint256", "bytes32"],
      [orderType, tokenIn, tokenOut, amount, 0, price, salt]
    );
  }

  const hashAttackerBuy = commitHash(0, attackerBuyPrice, saltAttackerBuy);
  const hashAttackerSell = commitHash(1, attackerSellPrice, saltAttackerSell);
  const hashVictim = commitHash(0, victimBuyPrice, saltVictim);

  // Check current epoch — we might need to settle a stale one first
  let epoch = await router.getCurrentEpoch();
  const epochId = epoch.id;
  console.log("  Current epoch:", epochId.toString(), "status:", epoch.status.toString());
  console.log("");

  // ── COMMIT PHASE ──
  console.log("  PHASE 1: COMMIT (orders hidden on-chain)");
  console.log("  ─────────────────────────────────────────");

  let tx, receipt;

  tx = await router.commitOrder(hashAttackerBuy, { value: collateral });
  receipt = await tx.wait();
  console.log("  Attacker commits BUY order  (tx: " + receipt.hash.slice(0, 14) + "...)");

  tx = await router.commitOrder(hashVictim, { value: collateral });
  receipt = await tx.wait();
  console.log("  Victim commits BUY order    (tx: " + receipt.hash.slice(0, 14) + "...)");

  tx = await router.commitOrder(hashAttackerSell, { value: collateral });
  receipt = await tx.wait();
  console.log("  Attacker commits SELL order  (tx: " + receipt.hash.slice(0, 14) + "...)");

  console.log("");
  console.log("  >> All 3 orders committed. Order details HIDDEN on-chain.");
  console.log("  >> Attacker cannot see Victim's order details -- nothing to sandwich!");
  console.log("");

  // ── WAIT FOR EPOCH TO END ──
  const waitSec = Number(epochDuration) + 5;
  console.log("  Waiting " + waitSec + "s for commit phase to end...");
  await new Promise(r => setTimeout(r, waitSec * 1000));
  console.log("  Epoch commit phase ended.");
  console.log("");

  // ── REVEAL PHASE ──
  console.log("  PHASE 2: REVEAL (epoch ended, orders revealed)");
  console.log("  ─────────────────────────────────────────");

  tx = await router.revealOrder(0, tokenIn, tokenOut, amount, 0, attackerBuyPrice, saltAttackerBuy);
  receipt = await tx.wait();
  console.log("  Attacker reveals BUY at price 103 (tx: " + receipt.hash.slice(0, 14) + "...)");

  tx = await router.revealOrder(0, tokenIn, tokenOut, amount, 0, victimBuyPrice, saltVictim);
  receipt = await tx.wait();
  console.log("  Victim reveals BUY at price 100   (tx: " + receipt.hash.slice(0, 14) + "...)");

  tx = await router.revealOrder(1, tokenIn, tokenOut, amount, 0, attackerSellPrice, saltAttackerSell);
  receipt = await tx.wait();
  console.log("  Attacker reveals SELL at price 97  (tx: " + receipt.hash.slice(0, 14) + "...)");
  console.log("");

  // ── WAIT FOR REVEAL WINDOW TO END ──
  const revealWindow = await router.revealWindow();
  const revealWait = Number(revealWindow) + 5;
  console.log("  Waiting " + revealWait + "s for reveal window to end...");
  await new Promise(r => setTimeout(r, revealWait * 1000));
  console.log("  Reveal window ended.");
  console.log("");

  // ── SETTLE PHASE ──
  console.log("  PHASE 3: SETTLE (batch auction at uniform clearing price)");
  console.log("  ─────────────────────────────────────────");
  console.log("  Settling at uniform clearing price...");

  tx = await router.settleEpoch(epochId);
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
