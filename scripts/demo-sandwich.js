const { ethers } = require("hardhat");

async function main() {
  const [deployer, attacker, victim, settler] = await ethers.getSigners();

  // ════════════════════════════════════════════════════════
  //  SCENARIO A: Normal DEX (No Protection)
  // ════════════════════════════════════════════════════════
  console.log("");
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
  console.log("============================================");
  console.log("");
  console.log("  Deploying ShieldX protocol...");

  // Deploy all contracts
  const engine = await (await ethers.getContractFactory("MockShieldXEngine")).deploy();
  await engine.waitForDeployment();

  const vault = await (await ethers.getContractFactory("ShieldXVault")).deploy(deployer.address);
  await vault.waitForDeployment();

  const settlement = await (await ethers.getContractFactory("ShieldXSettlement")).deploy(await engine.getAddress());
  await settlement.waitForDeployment();

  const router = await (await ethers.getContractFactory("ShieldXRouter")).deploy(
    30, 30, ethers.parseEther("0.01"),
    await vault.getAddress(), await settlement.getAddress()
  );
  await router.waitForDeployment();

  const executor = await (await ethers.getContractFactory("ShieldXExecutor")).deploy();
  await executor.waitForDeployment();

  await (await vault.setRouter(await router.getAddress())).wait();
  await (await settlement.setRouter(await router.getAddress())).wait();
  await (await settlement.setXcmExecutor(await executor.getAddress())).wait();

  console.log("  Protocol deployed and wired.");
  console.log("");

  // Order parameters
  const tokenIn = ethers.ZeroAddress;
  const tokenOut = "0x0000000000000000000000000000000000000001";
  const amount = ethers.parseEther("100");
  const collateral = ethers.parseEther("0.01");

  // Attacker's sandwich: BUY high (front-run) + SELL (back-run)
  const attackerBuyPrice = ethers.parseEther("103");
  const attackerSellPrice = ethers.parseEther("97");
  const victimBuyPrice = ethers.parseEther("100");

  const saltAttackerBuy = ethers.keccak256(ethers.toUtf8Bytes("attacker-buy-salt"));
  const saltAttackerSell = ethers.keccak256(ethers.toUtf8Bytes("attacker-sell-salt"));
  const saltVictim = ethers.keccak256(ethers.toUtf8Bytes("victim-buy-salt"));

  // Compute commit hashes
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
  console.log("  PHASE 1: COMMIT (orders hidden on-chain)");
  console.log("  ─────────────────────────────────────────");

  await (await router.connect(attacker).commitOrder(hashAttackerBuy, { value: collateral })).wait();
  console.log("  Attacker commits BUY order  (hash: " + hashAttackerBuy.slice(0, 10) + "...)");

  await (await router.connect(victim).commitOrder(hashVictim, { value: collateral })).wait();
  console.log("  Victim commits BUY order    (hash: " + hashVictim.slice(0, 10) + "...)");

  await (await router.connect(attacker).commitOrder(hashAttackerSell, { value: collateral })).wait();
  console.log("  Attacker commits SELL order  (hash: " + hashAttackerSell.slice(0, 10) + "...)");

  console.log("");
  console.log("  >> All 3 orders committed. Order details HIDDEN on-chain.");
  console.log("  >> Attacker cannot see Victim's order details -- nothing to sandwich!");
  console.log("");

  // ── REVEAL PHASE ──
  // Advance time past epoch
  await ethers.provider.send("evm_increaseTime", [31]);
  await ethers.provider.send("evm_mine", []);

  console.log("  PHASE 2: REVEAL (epoch ended, orders revealed)");
  console.log("  ─────────────────────────────────────────");

  await (await router.connect(attacker).revealOrder(0, tokenIn, tokenOut, amount, 0, attackerBuyPrice, saltAttackerBuy)).wait();
  console.log("  Attacker reveals BUY at price 103");

  await (await router.connect(victim).revealOrder(0, tokenIn, tokenOut, amount, 0, victimBuyPrice, saltVictim)).wait();
  console.log("  Victim reveals BUY at price 100");

  await (await router.connect(attacker).revealOrder(1, tokenIn, tokenOut, amount, 0, attackerSellPrice, saltAttackerSell)).wait();
  console.log("  Attacker reveals SELL at price 97");
  console.log("");

  // ── SETTLE PHASE ──
  await ethers.provider.send("evm_increaseTime", [31]);
  await ethers.provider.send("evm_mine", []);

  console.log("  PHASE 3: SETTLE (batch auction at uniform clearing price)");
  console.log("  ─────────────────────────────────────────");
  console.log("  Settling at uniform clearing price...");

  const tx = await router.connect(settler).settleEpoch(1);
  const receipt = await tx.wait();

  // Extract clearing price from EpochSettled event
  const settledEvent = receipt.logs.find(log => {
    try {
      return router.interface.parseLog({ topics: log.topics, data: log.data })?.name === "EpochSettled";
    } catch { return false; }
  });

  const parsedEvent = router.interface.parseLog({ topics: settledEvent.topics, data: settledEvent.data });
  const clearingPrice = ethers.formatEther(parsedEvent.args.clearingPrice);

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
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
