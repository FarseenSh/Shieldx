const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("ShieldXRouter", function () {
  const BUY = 0;
  const SELL = 1;
  const EPOCH_DURATION = 60;   // 60 seconds
  const REVEAL_WINDOW = 60;    // 60 seconds
  const MIN_COLLATERAL = ethers.parseEther("0.01");
  const COLLATERAL = ethers.parseEther("0.1");

  // Helper: compute commit hash matching OrderLib.computeCommitHash
  function computeCommitHash(orderType, tokenIn, tokenOut, amountIn, minAmountOut, maxPrice, salt) {
    return ethers.solidityPackedKeccak256(
      ["uint8", "address", "address", "uint256", "uint256", "uint256", "bytes32"],
      [orderType, tokenIn, tokenOut, amountIn, minAmountOut, maxPrice, salt]
    );
  }

  // Standard order params for testing
  const tokenIn = ethers.ZeroAddress;
  const tokenOut = "0x0000000000000000000000000000000000000001";
  const amountIn = ethers.parseEther("10");
  const minAmountOut = 0;
  const buyPrice = ethers.parseEther("100");
  const sellPrice = ethers.parseEther("90");
  const salt1 = ethers.keccak256(ethers.toUtf8Bytes("salt-1"));
  const salt2 = ethers.keccak256(ethers.toUtf8Bytes("salt-2"));
  const salt3 = ethers.keccak256(ethers.toUtf8Bytes("salt-3"));

  async function deployFullFixture() {
    const [deployer, user1, user2, treasury, attacker] = await ethers.getSigners();

    // Deploy engine
    const MockShieldXEngine = await ethers.getContractFactory("MockShieldXEngine");
    const engine = await MockShieldXEngine.deploy();
    await engine.waitForDeployment();

    // Deploy vault
    const ShieldXVault = await ethers.getContractFactory("ShieldXVault");
    const vault = await ShieldXVault.deploy(treasury.address);
    await vault.waitForDeployment();

    // Deploy settlement
    const ShieldXSettlement = await ethers.getContractFactory("ShieldXSettlement");
    const settlement = await ShieldXSettlement.deploy(await engine.getAddress());
    await settlement.waitForDeployment();

    // Deploy router
    const ShieldXRouter = await ethers.getContractFactory("ShieldXRouter");
    const router = await ShieldXRouter.deploy(
      EPOCH_DURATION,
      REVEAL_WINDOW,
      MIN_COLLATERAL,
      await vault.getAddress(),
      await settlement.getAddress()
    );
    await router.waitForDeployment();

    // Wire contracts
    await vault.setRouter(await router.getAddress());
    await settlement.setRouter(await router.getAddress());

    return { router, vault, settlement, engine, deployer, user1, user2, treasury, attacker };
  }

  describe("constructor", function () {
    it("should initialize first epoch with correct times", async function () {
      const { router } = await loadFixture(deployFullFixture);
      const epoch = await router.getCurrentEpoch();
      expect(epoch.id).to.equal(1);
      expect(epoch.endTime - epoch.startTime).to.equal(EPOCH_DURATION);
    });

    it("should set epoch 1 as current epoch", async function () {
      const { router } = await loadFixture(deployFullFixture);
      expect(await router.currentEpochId()).to.equal(1);
    });

    it("should set protocol parameters correctly", async function () {
      const { router } = await loadFixture(deployFullFixture);
      expect(await router.epochDuration()).to.equal(EPOCH_DURATION);
      expect(await router.revealWindow()).to.equal(REVEAL_WINDOW);
      expect(await router.minCollateral()).to.equal(MIN_COLLATERAL);
    });
  });

  describe("commitOrder", function () {
    it("should accept valid commitment with sufficient collateral", async function () {
      const { router, user1 } = await loadFixture(deployFullFixture);
      const commitHash = computeCommitHash(BUY, tokenIn, tokenOut, amountIn, minAmountOut, buyPrice, salt1);

      await router.connect(user1).commitOrder(commitHash, { value: COLLATERAL });

      const commitment = await router.commitments(commitHash);
      expect(commitment.committer).to.equal(user1.address);
      expect(commitment.collateral).to.equal(COLLATERAL);
      expect(commitment.epochId).to.equal(1);
    });

    it("should emit OrderCommitted event", async function () {
      const { router, user1 } = await loadFixture(deployFullFixture);
      const commitHash = computeCommitHash(BUY, tokenIn, tokenOut, amountIn, minAmountOut, buyPrice, salt1);

      await expect(router.connect(user1).commitOrder(commitHash, { value: COLLATERAL }))
        .to.emit(router, "OrderCommitted")
        .withArgs(commitHash, user1.address, 1, COLLATERAL);
    });

    it("should revert when collateral is insufficient", async function () {
      const { router, user1 } = await loadFixture(deployFullFixture);
      const commitHash = computeCommitHash(BUY, tokenIn, tokenOut, amountIn, minAmountOut, buyPrice, salt1);

      await expect(
        router.connect(user1).commitOrder(commitHash, { value: ethers.parseEther("0.001") })
      ).to.be.revertedWith("ShieldXRouter: insufficient collateral");
    });

    it("should revert on duplicate commitment hash", async function () {
      const { router, user1 } = await loadFixture(deployFullFixture);
      const commitHash = computeCommitHash(BUY, tokenIn, tokenOut, amountIn, minAmountOut, buyPrice, salt1);

      await router.connect(user1).commitOrder(commitHash, { value: COLLATERAL });
      await expect(
        router.connect(user1).commitOrder(commitHash, { value: COLLATERAL })
      ).to.be.revertedWith("ShieldXRouter: duplicate commitment");
    });

    it("should increment epoch totalCommitments", async function () {
      const { router, user1 } = await loadFixture(deployFullFixture);
      const commitHash = computeCommitHash(BUY, tokenIn, tokenOut, amountIn, minAmountOut, buyPrice, salt1);

      await router.connect(user1).commitOrder(commitHash, { value: COLLATERAL });
      expect(await router.getEpochCommitmentCount(1)).to.equal(1);
    });

    it("should lock collateral in vault", async function () {
      const { router, vault, user1 } = await loadFixture(deployFullFixture);
      const commitHash = computeCommitHash(BUY, tokenIn, tokenOut, amountIn, minAmountOut, buyPrice, salt1);

      await router.connect(user1).commitOrder(commitHash, { value: COLLATERAL });
      expect(await vault.commitCollateral(commitHash)).to.equal(COLLATERAL);
    });
  });

  describe("revealOrder", function () {
    it("should accept valid reveal matching commitment hash", async function () {
      const { router, user1 } = await loadFixture(deployFullFixture);
      const commitHash = computeCommitHash(BUY, tokenIn, tokenOut, amountIn, minAmountOut, buyPrice, salt1);

      await router.connect(user1).commitOrder(commitHash, { value: COLLATERAL });
      await time.increase(EPOCH_DURATION + 1);

      await router.connect(user1).revealOrder(BUY, tokenIn, tokenOut, amountIn, minAmountOut, buyPrice, salt1);

      const commitment = await router.commitments(commitHash);
      expect(commitment.revealed).to.be.true;
    });

    it("should emit OrderRevealed event", async function () {
      const { router, user1 } = await loadFixture(deployFullFixture);
      const commitHash = computeCommitHash(BUY, tokenIn, tokenOut, amountIn, minAmountOut, buyPrice, salt1);

      await router.connect(user1).commitOrder(commitHash, { value: COLLATERAL });
      await time.increase(EPOCH_DURATION + 1);

      await expect(
        router.connect(user1).revealOrder(BUY, tokenIn, tokenOut, amountIn, minAmountOut, buyPrice, salt1)
      ).to.emit(router, "OrderRevealed")
        .withArgs(commitHash, user1.address, 1, BUY, amountIn);
    });

    it("should revert when commitment does not exist (wrong hash)", async function () {
      const { router, user1 } = await loadFixture(deployFullFixture);
      const commitHash = computeCommitHash(BUY, tokenIn, tokenOut, amountIn, minAmountOut, buyPrice, salt1);

      await router.connect(user1).commitOrder(commitHash, { value: COLLATERAL });
      await time.increase(EPOCH_DURATION + 1);

      // Reveal with wrong price — produces different hash
      await expect(
        router.connect(user1).revealOrder(BUY, tokenIn, tokenOut, amountIn, minAmountOut, ethers.parseEther("999"), salt1)
      ).to.be.revertedWith("ShieldXRouter: not your commitment");
    });

    it("should revert when called by wrong address", async function () {
      const { router, user1, attacker } = await loadFixture(deployFullFixture);
      const commitHash = computeCommitHash(BUY, tokenIn, tokenOut, amountIn, minAmountOut, buyPrice, salt1);

      await router.connect(user1).commitOrder(commitHash, { value: COLLATERAL });
      await time.increase(EPOCH_DURATION + 1);

      await expect(
        router.connect(attacker).revealOrder(BUY, tokenIn, tokenOut, amountIn, minAmountOut, buyPrice, salt1)
      ).to.be.revertedWith("ShieldXRouter: not your commitment");
    });

    it("should revert when already revealed", async function () {
      const { router, user1 } = await loadFixture(deployFullFixture);
      const commitHash = computeCommitHash(BUY, tokenIn, tokenOut, amountIn, minAmountOut, buyPrice, salt1);

      await router.connect(user1).commitOrder(commitHash, { value: COLLATERAL });
      await time.increase(EPOCH_DURATION + 1);

      await router.connect(user1).revealOrder(BUY, tokenIn, tokenOut, amountIn, minAmountOut, buyPrice, salt1);
      await expect(
        router.connect(user1).revealOrder(BUY, tokenIn, tokenOut, amountIn, minAmountOut, buyPrice, salt1)
      ).to.be.revertedWith("ShieldXRouter: already revealed");
    });

    it("should revert when not in reveal window (too early)", async function () {
      const { router, user1 } = await loadFixture(deployFullFixture);
      const commitHash = computeCommitHash(BUY, tokenIn, tokenOut, amountIn, minAmountOut, buyPrice, salt1);

      await router.connect(user1).commitOrder(commitHash, { value: COLLATERAL });
      // Don't advance time — still in commit phase

      await expect(
        router.connect(user1).revealOrder(BUY, tokenIn, tokenOut, amountIn, minAmountOut, buyPrice, salt1)
      ).to.be.revertedWith("ShieldXRouter: not in reveal window");
    });
  });

  describe("settleEpoch", function () {
    it("should settle epoch with matching buy and sell orders", async function () {
      const { router, user1, user2 } = await loadFixture(deployFullFixture);

      const buyHash = computeCommitHash(BUY, tokenIn, tokenOut, amountIn, minAmountOut, buyPrice, salt1);
      const sellHash = computeCommitHash(SELL, tokenIn, tokenOut, amountIn, minAmountOut, sellPrice, salt2);

      await router.connect(user1).commitOrder(buyHash, { value: COLLATERAL });
      await router.connect(user2).commitOrder(sellHash, { value: COLLATERAL });

      await time.increase(EPOCH_DURATION + 1);

      await router.connect(user1).revealOrder(BUY, tokenIn, tokenOut, amountIn, minAmountOut, buyPrice, salt1);
      await router.connect(user2).revealOrder(SELL, tokenIn, tokenOut, amountIn, minAmountOut, sellPrice, salt2);

      await time.increase(REVEAL_WINDOW + 1);

      await expect(router.settleEpoch(1)).to.emit(router, "EpochSettled");
    });

    it("should set clearing price on epoch", async function () {
      const { router, user1, user2 } = await loadFixture(deployFullFixture);

      const buyHash = computeCommitHash(BUY, tokenIn, tokenOut, amountIn, minAmountOut, buyPrice, salt1);
      const sellHash = computeCommitHash(SELL, tokenIn, tokenOut, amountIn, minAmountOut, sellPrice, salt2);

      await router.connect(user1).commitOrder(buyHash, { value: COLLATERAL });
      await router.connect(user2).commitOrder(sellHash, { value: COLLATERAL });

      await time.increase(EPOCH_DURATION + 1);

      await router.connect(user1).revealOrder(BUY, tokenIn, tokenOut, amountIn, minAmountOut, buyPrice, salt1);
      await router.connect(user2).revealOrder(SELL, tokenIn, tokenOut, amountIn, minAmountOut, sellPrice, salt2);

      await time.increase(REVEAL_WINDOW + 1);

      await router.settleEpoch(1);

      const epoch = await router.getCurrentEpoch();
      // Clearing price should be midpoint: (100 + 90) / 2 = 95
      expect(epoch.clearingPrice).to.equal(ethers.parseEther("95"));
      expect(epoch.settled).to.be.true;
    });

    it("should revert when already settled", async function () {
      const { router, user1, user2 } = await loadFixture(deployFullFixture);

      const buyHash = computeCommitHash(BUY, tokenIn, tokenOut, amountIn, minAmountOut, buyPrice, salt1);
      const sellHash = computeCommitHash(SELL, tokenIn, tokenOut, amountIn, minAmountOut, sellPrice, salt2);

      await router.connect(user1).commitOrder(buyHash, { value: COLLATERAL });
      await router.connect(user2).commitOrder(sellHash, { value: COLLATERAL });

      await time.increase(EPOCH_DURATION + 1);

      await router.connect(user1).revealOrder(BUY, tokenIn, tokenOut, amountIn, minAmountOut, buyPrice, salt1);
      await router.connect(user2).revealOrder(SELL, tokenIn, tokenOut, amountIn, minAmountOut, sellPrice, salt2);

      await time.increase(REVEAL_WINDOW + 1);

      await router.settleEpoch(1);
      await expect(router.settleEpoch(1)).to.be.revertedWith("ShieldXRouter: already settled");
    });

    it("should revert when reveal window is still open", async function () {
      const { router, user1 } = await loadFixture(deployFullFixture);

      const buyHash = computeCommitHash(BUY, tokenIn, tokenOut, amountIn, minAmountOut, buyPrice, salt1);
      await router.connect(user1).commitOrder(buyHash, { value: COLLATERAL });

      await time.increase(EPOCH_DURATION + 1);
      await router.connect(user1).revealOrder(BUY, tokenIn, tokenOut, amountIn, minAmountOut, buyPrice, salt1);

      // Still in reveal window
      await expect(router.settleEpoch(1)).to.be.revertedWith("ShieldXRouter: reveal window still open");
    });

    it("should revert when no orders to settle", async function () {
      const { router } = await loadFixture(deployFullFixture);
      await time.increase(EPOCH_DURATION + REVEAL_WINDOW + 1);
      await expect(router.settleEpoch(1)).to.be.revertedWith("ShieldXRouter: no orders to settle");
    });
  });

  describe("slashUnrevealed", function () {
    it("should slash unrevealed commitments to treasury", async function () {
      const { router, vault, treasury, user1 } = await loadFixture(deployFullFixture);

      const commitHash = computeCommitHash(BUY, tokenIn, tokenOut, amountIn, minAmountOut, buyPrice, salt1);
      await router.connect(user1).commitOrder(commitHash, { value: COLLATERAL });

      // Don't reveal — advance past reveal window
      await time.increase(EPOCH_DURATION + REVEAL_WINDOW + 1);

      const treasuryBefore = await ethers.provider.getBalance(treasury.address);
      await expect(router.slashUnrevealed(1))
        .to.emit(router, "UnrevealedSlashed");
      const treasuryAfter = await ethers.provider.getBalance(treasury.address);

      expect(treasuryAfter - treasuryBefore).to.equal(COLLATERAL);
    });

    it("should not slash revealed commitments", async function () {
      const { router, user1, user2 } = await loadFixture(deployFullFixture);

      const commitHash1 = computeCommitHash(BUY, tokenIn, tokenOut, amountIn, minAmountOut, buyPrice, salt1);
      const commitHash2 = computeCommitHash(SELL, tokenIn, tokenOut, amountIn, minAmountOut, sellPrice, salt2);

      await router.connect(user1).commitOrder(commitHash1, { value: COLLATERAL });
      await router.connect(user2).commitOrder(commitHash2, { value: COLLATERAL });

      await time.increase(EPOCH_DURATION + 1);

      // Only user1 reveals
      await router.connect(user1).revealOrder(BUY, tokenIn, tokenOut, amountIn, minAmountOut, buyPrice, salt1);

      await time.increase(REVEAL_WINDOW + 1);

      await router.slashUnrevealed(1);

      // user1's commitment should NOT be slashed (it was revealed)
      const commitment1 = await router.commitments(commitHash1);
      expect(commitment1.settled).to.be.false; // not settled by slash

      // user2's should be slashed
      const commitment2 = await router.commitments(commitHash2);
      expect(commitment2.settled).to.be.true;
    });

    it("should revert when reveal window is still open", async function () {
      const { router, user1 } = await loadFixture(deployFullFixture);

      const commitHash = computeCommitHash(BUY, tokenIn, tokenOut, amountIn, minAmountOut, buyPrice, salt1);
      await router.connect(user1).commitOrder(commitHash, { value: COLLATERAL });

      await time.increase(EPOCH_DURATION + 1);
      // Still in reveal window
      await expect(router.slashUnrevealed(1))
        .to.be.revertedWith("ShieldXRouter: reveal window still open");
    });
  });

  describe("epoch advancement", function () {
    it("should auto-advance epoch when current fully expired", async function () {
      const { router, user1 } = await loadFixture(deployFullFixture);

      // Advance past epoch 1 entirely
      await time.increase(EPOCH_DURATION + REVEAL_WINDOW + 1);

      // Commit triggers epoch advance
      const commitHash = computeCommitHash(BUY, tokenIn, tokenOut, amountIn, minAmountOut, buyPrice, salt1);
      await expect(router.connect(user1).commitOrder(commitHash, { value: COLLATERAL }))
        .to.emit(router, "EpochAdvanced");

      expect(await router.currentEpochId()).to.equal(2);
    });

    it("should not advance epoch during active commit phase", async function () {
      const { router, user1 } = await loadFixture(deployFullFixture);

      const commitHash = computeCommitHash(BUY, tokenIn, tokenOut, amountIn, minAmountOut, buyPrice, salt1);
      await router.connect(user1).commitOrder(commitHash, { value: COLLATERAL });

      expect(await router.currentEpochId()).to.equal(1);
    });
  });

  describe("view functions", function () {
    it("should return current epoch via getCurrentEpoch", async function () {
      const { router } = await loadFixture(deployFullFixture);
      const epoch = await router.getCurrentEpoch();
      expect(epoch.id).to.equal(1);
      expect(epoch.settled).to.be.false;
    });

    it("should correctly report commit phase status", async function () {
      const { router } = await loadFixture(deployFullFixture);
      expect(await router.isInCommitPhase()).to.be.true;
      expect(await router.isInRevealPhase()).to.be.false;
    });

    it("should correctly report reveal phase status", async function () {
      const { router } = await loadFixture(deployFullFixture);
      await time.increase(EPOCH_DURATION + 1);
      expect(await router.isInCommitPhase()).to.be.false;
      expect(await router.isInRevealPhase()).to.be.true;
    });

    it("should return epoch orders after reveal", async function () {
      const { router, user1 } = await loadFixture(deployFullFixture);

      const commitHash = computeCommitHash(BUY, tokenIn, tokenOut, amountIn, minAmountOut, buyPrice, salt1);
      await router.connect(user1).commitOrder(commitHash, { value: COLLATERAL });

      await time.increase(EPOCH_DURATION + 1);
      await router.connect(user1).revealOrder(BUY, tokenIn, tokenOut, amountIn, minAmountOut, buyPrice, salt1);

      const orders = await router.getEpochOrders(1);
      expect(orders.length).to.equal(1);
      expect(orders[0].trader).to.equal(user1.address);
      expect(orders[0].amountIn).to.equal(amountIn);
    });
  });

  describe("full cycle", function () {
    it("should complete commit-reveal-settle cycle returning collateral", async function () {
      const { router, vault, user1, user2, treasury } = await loadFixture(deployFullFixture);

      const buyHash = computeCommitHash(BUY, tokenIn, tokenOut, amountIn, minAmountOut, buyPrice, salt1);
      const sellHash = computeCommitHash(SELL, tokenIn, tokenOut, amountIn, minAmountOut, sellPrice, salt2);

      // Commit
      await router.connect(user1).commitOrder(buyHash, { value: COLLATERAL });
      await router.connect(user2).commitOrder(sellHash, { value: COLLATERAL });

      // Advance to reveal
      await time.increase(EPOCH_DURATION + 1);

      // Reveal
      await router.connect(user1).revealOrder(BUY, tokenIn, tokenOut, amountIn, minAmountOut, buyPrice, salt1);
      await router.connect(user2).revealOrder(SELL, tokenIn, tokenOut, amountIn, minAmountOut, sellPrice, salt2);

      // Advance past reveal window
      await time.increase(REVEAL_WINDOW + 1);

      // Record balances before settle
      const user1Before = await ethers.provider.getBalance(user1.address);
      const user2Before = await ethers.provider.getBalance(user2.address);

      // Settle
      await router.settleEpoch(1);

      // Both users should get collateral returned
      const user1After = await ethers.provider.getBalance(user1.address);
      const user2After = await ethers.provider.getBalance(user2.address);

      expect(user1After - user1Before).to.equal(COLLATERAL);
      expect(user2After - user2Before).to.equal(COLLATERAL);

      // Vault should have zero collateral for both
      expect(await vault.commitCollateral(buyHash)).to.equal(0);
      expect(await vault.commitCollateral(sellHash)).to.equal(0);
    });

    it("should handle multiple orders in same epoch", async function () {
      const { router, user1, user2 } = await loadFixture(deployFullFixture);

      const buyHash1 = computeCommitHash(BUY, tokenIn, tokenOut, amountIn, minAmountOut, ethers.parseEther("110"), salt1);
      const buyHash2 = computeCommitHash(BUY, tokenIn, tokenOut, amountIn, minAmountOut, ethers.parseEther("105"), salt2);
      const sellHash = computeCommitHash(SELL, tokenIn, tokenOut, amountIn, minAmountOut, sellPrice, salt3);

      await router.connect(user1).commitOrder(buyHash1, { value: COLLATERAL });
      await router.connect(user1).commitOrder(buyHash2, { value: COLLATERAL });
      await router.connect(user2).commitOrder(sellHash, { value: COLLATERAL });

      expect(await router.getEpochCommitmentCount(1)).to.equal(3);

      await time.increase(EPOCH_DURATION + 1);

      await router.connect(user1).revealOrder(BUY, tokenIn, tokenOut, amountIn, minAmountOut, ethers.parseEther("110"), salt1);
      await router.connect(user1).revealOrder(BUY, tokenIn, tokenOut, amountIn, minAmountOut, ethers.parseEther("105"), salt2);
      await router.connect(user2).revealOrder(SELL, tokenIn, tokenOut, amountIn, minAmountOut, sellPrice, salt3);

      const orders = await router.getEpochOrders(1);
      expect(orders.length).to.equal(3);

      await time.increase(REVEAL_WINDOW + 1);
      await router.settleEpoch(1);

      const epoch = await router.getCurrentEpoch();
      expect(epoch.clearingPrice).to.be.gt(0);
      expect(epoch.settled).to.be.true;
    });
  });
});
