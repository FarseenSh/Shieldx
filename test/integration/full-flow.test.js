const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("ShieldX Full Flow Integration", function () {
  const BUY = 0;
  const SELL = 1;
  const EPOCH_DURATION = 60;
  const REVEAL_WINDOW = 60;
  const MIN_COLLATERAL = ethers.parseEther("0.01");
  const COLLATERAL = ethers.parseEther("0.1");

  const tokenIn = ethers.ZeroAddress;
  const tokenOut = "0x0000000000000000000000000000000000000001";

  function computeCommitHash(orderType, tokenIn, tokenOut, amountIn, minAmountOut, maxPrice, salt) {
    return ethers.solidityPackedKeccak256(
      ["uint8", "address", "address", "uint256", "uint256", "uint256", "bytes32"],
      [orderType, tokenIn, tokenOut, amountIn, minAmountOut, maxPrice, salt]
    );
  }

  function makeSalt(label) {
    return ethers.keccak256(ethers.toUtf8Bytes(label));
  }

  async function deployAllFixture() {
    const [deployer, user1, user2, user3, treasury] = await ethers.getSigners();

    const engine = await (await ethers.getContractFactory("MockShieldXEngine")).deploy();
    await engine.waitForDeployment();

    const vault = await (await ethers.getContractFactory("ShieldXVault")).deploy(treasury.address);
    await vault.waitForDeployment();

    const settlement = await (await ethers.getContractFactory("ShieldXSettlement")).deploy(await engine.getAddress());
    await settlement.waitForDeployment();

    const router = await (await ethers.getContractFactory("ShieldXRouter")).deploy(
      EPOCH_DURATION, REVEAL_WINDOW, MIN_COLLATERAL,
      await vault.getAddress(), await settlement.getAddress()
    );
    await router.waitForDeployment();

    const executor = await (await ethers.getContractFactory("ShieldXExecutor")).deploy();
    await executor.waitForDeployment();

    await vault.setRouter(await router.getAddress());
    await settlement.setRouter(await router.getAddress());
    await settlement.setXcmExecutor(await executor.getAddress());
    await executor.setRouter(await router.getAddress());

    return { router, vault, settlement, engine, executor, deployer, user1, user2, user3, treasury };
  }

  it("Test 1: Single pair — full commit-reveal-settle cycle", async function () {
    const { router, user1, user2 } = await loadFixture(deployAllFixture);
    const amount = ethers.parseEther("10");
    const buyPrice = ethers.parseEther("100");
    const sellPrice = ethers.parseEther("90");
    const salt1 = makeSalt("buy-salt-1");
    const salt2 = makeSalt("sell-salt-1");

    const buyHash = computeCommitHash(BUY, tokenIn, tokenOut, amount, 0, buyPrice, salt1);
    const sellHash = computeCommitHash(SELL, tokenIn, tokenOut, amount, 0, sellPrice, salt2);

    // Commit
    await router.connect(user1).commitOrder(buyHash, { value: COLLATERAL });
    await router.connect(user2).commitOrder(sellHash, { value: COLLATERAL });

    // Advance to reveal
    await time.increase(EPOCH_DURATION + 1);

    // Reveal
    await router.connect(user1).revealOrder(BUY, tokenIn, tokenOut, amount, 0, buyPrice, salt1);
    await router.connect(user2).revealOrder(SELL, tokenIn, tokenOut, amount, 0, sellPrice, salt2);

    // Advance past reveal window
    await time.increase(REVEAL_WINDOW + 1);

    // Settle
    const tx = await router.settleEpoch(1);
    const receipt = await tx.wait();

    const epoch = await router.getCurrentEpoch();
    // Clearing price = (100 + 90) / 2 = 95
    expect(epoch.clearingPrice).to.equal(ethers.parseEther("95"));
    expect(epoch.settled).to.be.true;
  });

  it("Test 2: Multi-order batch — 3 buys + 2 sells", async function () {
    const { router, user1, user2, user3 } = await loadFixture(deployAllFixture);
    const amount = ethers.parseEther("10");

    const orders = [
      { signer: user1, type: BUY, price: ethers.parseEther("110"), salt: makeSalt("b1") },
      { signer: user1, type: BUY, price: ethers.parseEther("105"), salt: makeSalt("b2") },
      { signer: user2, type: BUY, price: ethers.parseEther("100"), salt: makeSalt("b3") },
      { signer: user3, type: SELL, price: ethers.parseEther("90"), salt: makeSalt("s1") },
      { signer: user3, type: SELL, price: ethers.parseEther("95"), salt: makeSalt("s2") },
    ];

    // Commit all
    for (const o of orders) {
      const hash = computeCommitHash(o.type, tokenIn, tokenOut, amount, 0, o.price, o.salt);
      await router.connect(o.signer).commitOrder(hash, { value: COLLATERAL });
    }

    expect(await router.getEpochCommitmentCount(1)).to.equal(5);

    // Advance to reveal
    await time.increase(EPOCH_DURATION + 1);

    // Reveal all
    for (const o of orders) {
      await router.connect(o.signer).revealOrder(o.type, tokenIn, tokenOut, amount, 0, o.price, o.salt);
    }

    const revealed = await router.getEpochOrders(1);
    expect(revealed.length).to.equal(5);

    // Advance past reveal window and settle
    await time.increase(REVEAL_WINDOW + 1);
    await router.settleEpoch(1);

    const epoch = await router.getCurrentEpoch();
    expect(epoch.clearingPrice).to.be.gt(0);
    expect(epoch.settled).to.be.true;
  });

  it("Test 3: Unrevealed slashing — commit without reveal", async function () {
    const { router, vault, treasury, user1, user2 } = await loadFixture(deployAllFixture);
    const amount = ethers.parseEther("10");
    const salt1 = makeSalt("reveal-me");
    const salt2 = makeSalt("forget-me");

    const hash1 = computeCommitHash(BUY, tokenIn, tokenOut, amount, 0, ethers.parseEther("100"), salt1);
    const hash2 = computeCommitHash(SELL, tokenIn, tokenOut, amount, 0, ethers.parseEther("90"), salt2);

    // Both commit
    await router.connect(user1).commitOrder(hash1, { value: COLLATERAL });
    await router.connect(user2).commitOrder(hash2, { value: COLLATERAL });

    // Advance to reveal
    await time.increase(EPOCH_DURATION + 1);

    // Only user1 reveals
    await router.connect(user1).revealOrder(BUY, tokenIn, tokenOut, amount, 0, ethers.parseEther("100"), salt1);

    // Advance past reveal window
    await time.increase(REVEAL_WINDOW + 1);

    // Slash unrevealed
    const treasuryBefore = await ethers.provider.getBalance(treasury.address);
    await router.slashUnrevealed(1);
    const treasuryAfter = await ethers.provider.getBalance(treasury.address);

    // User2's collateral should be slashed to treasury
    expect(treasuryAfter - treasuryBefore).to.equal(COLLATERAL);

    // User2's vault collateral should be zero
    expect(await vault.commitCollateral(hash2)).to.equal(0);
  });

  it("Test 4: Epoch advancement — new epoch after expiry", async function () {
    const { router, user1 } = await loadFixture(deployAllFixture);

    expect(await router.currentEpochId()).to.equal(1);

    // Advance past epoch 1 entirely
    await time.increase(EPOCH_DURATION + REVEAL_WINDOW + 1);

    // Commit triggers epoch advance
    const hash = computeCommitHash(BUY, tokenIn, tokenOut, ethers.parseEther("10"), 0, ethers.parseEther("100"), makeSalt("epoch2"));
    await router.connect(user1).commitOrder(hash, { value: COLLATERAL });

    expect(await router.currentEpochId()).to.equal(2);

    const epoch2 = await router.getCurrentEpoch();
    expect(epoch2.id).to.equal(2);
    expect(epoch2.totalCommitments).to.equal(1);
  });

  it("Test 5: Multiple epochs — settle epoch 1, then epoch 2", async function () {
    const { router, user1, user2 } = await loadFixture(deployAllFixture);
    const amount = ethers.parseEther("10");

    // ── Epoch 1 ──
    const salt1a = makeSalt("e1-buy");
    const salt1b = makeSalt("e1-sell");
    const hash1a = computeCommitHash(BUY, tokenIn, tokenOut, amount, 0, ethers.parseEther("100"), salt1a);
    const hash1b = computeCommitHash(SELL, tokenIn, tokenOut, amount, 0, ethers.parseEther("90"), salt1b);

    await router.connect(user1).commitOrder(hash1a, { value: COLLATERAL });
    await router.connect(user2).commitOrder(hash1b, { value: COLLATERAL });

    await time.increase(EPOCH_DURATION + 1);
    await router.connect(user1).revealOrder(BUY, tokenIn, tokenOut, amount, 0, ethers.parseEther("100"), salt1a);
    await router.connect(user2).revealOrder(SELL, tokenIn, tokenOut, amount, 0, ethers.parseEther("90"), salt1b);

    await time.increase(REVEAL_WINDOW + 1);
    await router.settleEpoch(1);

    // ── Epoch 2 — auto-advances on next commit ──
    const salt2a = makeSalt("e2-buy");
    const salt2b = makeSalt("e2-sell");
    const hash2a = computeCommitHash(BUY, tokenIn, tokenOut, amount, 0, ethers.parseEther("110"), salt2a);
    const hash2b = computeCommitHash(SELL, tokenIn, tokenOut, amount, 0, ethers.parseEther("85"), salt2b);

    await router.connect(user1).commitOrder(hash2a, { value: COLLATERAL });
    await router.connect(user2).commitOrder(hash2b, { value: COLLATERAL });

    expect(await router.currentEpochId()).to.equal(2);

    await time.increase(EPOCH_DURATION + 1);
    await router.connect(user1).revealOrder(BUY, tokenIn, tokenOut, amount, 0, ethers.parseEther("110"), salt2a);
    await router.connect(user2).revealOrder(SELL, tokenIn, tokenOut, amount, 0, ethers.parseEther("85"), salt2b);

    await time.increase(REVEAL_WINDOW + 1);
    await router.settleEpoch(2);

    // Verify both epochs settled with different clearing prices
    const e1 = await router.epochs(1);
    const e2 = await router.epochs(2);
    expect(e1.settled).to.be.true;
    expect(e2.settled).to.be.true;
    expect(e1.clearingPrice).to.equal(ethers.parseEther("95"));
    expect(e2.clearingPrice).to.not.equal(e1.clearingPrice);
  });
});
