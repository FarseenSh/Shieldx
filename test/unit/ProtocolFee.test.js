const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("Protocol Fees", function () {
  const BUY = 0;
  const SELL = 1;
  const EPOCH_DURATION = 60;
  const REVEAL_WINDOW = 60;
  const MIN_COLLATERAL = ethers.parseEther("0.01");
  const COLLATERAL = ethers.parseEther("0.1");
  const tokenIn = ethers.ZeroAddress;
  const tokenOut = "0x0000000000000000000000000000000000000001";
  const amount = ethers.parseEther("10");

  function computeCommitHash(orderType, tIn, tOut, amt, minOut, maxPrice, salt) {
    return ethers.solidityPackedKeccak256(
      ["uint8", "address", "address", "uint256", "uint256", "uint256", "bytes32"],
      [orderType, tIn, tOut, amt, minOut, maxPrice, salt]
    );
  }
  function makeSalt(label) {
    return ethers.keccak256(ethers.toUtf8Bytes(label));
  }

  async function deployFixture() {
    const [deployer, user1, user2, attacker, treasury] = await ethers.getSigners();
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
    await vault.setRouter(await router.getAddress());
    await settlement.setRouter(await router.getAddress());
    return { router, vault, deployer, user1, user2, attacker, treasury };
  }

  async function commitRevealSettle(router, orders) {
    for (const o of orders) {
      const hash = computeCommitHash(o.type, tokenIn, tokenOut, amount, 0, o.price, o.salt);
      await router.connect(o.signer).commitOrder(hash, { value: COLLATERAL });
    }
    await time.increase(EPOCH_DURATION + 1);
    for (const o of orders) {
      await router.connect(o.signer).revealOrder(o.type, tokenIn, tokenOut, amount, 0, o.price, o.salt);
    }
    await time.increase(REVEAL_WINDOW + 1);
    return router.settleEpoch(1);
  }

  it("should have default fee of 10 bps (0.1%)", async function () {
    const { router } = await loadFixture(deployFixture);
    expect(await router.protocolFeeBps()).to.equal(10);
  });

  it("should collect fees on settlement", async function () {
    const { router, user1, user2 } = await loadFixture(deployFixture);
    await commitRevealSettle(router, [
      { signer: user1, type: BUY, price: ethers.parseEther("100"), salt: makeSalt("b1") },
      { signer: user2, type: SELL, price: ethers.parseEther("90"), salt: makeSalt("s1") },
    ]);
    // Total volume = 10 (buy fill) + 10 (sell fill) = 20
    // Fee = 20 * 10 / 10000 = 0.02
    const totalFees = await router.totalProtocolFees();
    expect(totalFees).to.equal(ethers.parseEther("0.02"));
  });

  it("should accumulate fees across multiple epochs", async function () {
    const { router, user1, user2 } = await loadFixture(deployFixture);

    // Epoch 1
    await commitRevealSettle(router, [
      { signer: user1, type: BUY, price: ethers.parseEther("100"), salt: makeSalt("e1b") },
      { signer: user2, type: SELL, price: ethers.parseEther("90"), salt: makeSalt("e1s") },
    ]);
    const feesAfter1 = await router.totalProtocolFees();

    // Epoch 2
    const hash2b = computeCommitHash(BUY, tokenIn, tokenOut, amount, 0, ethers.parseEther("110"), makeSalt("e2b"));
    const hash2s = computeCommitHash(SELL, tokenIn, tokenOut, amount, 0, ethers.parseEther("85"), makeSalt("e2s"));
    await router.connect(user1).commitOrder(hash2b, { value: COLLATERAL });
    await router.connect(user2).commitOrder(hash2s, { value: COLLATERAL });
    await time.increase(EPOCH_DURATION + 1);
    await router.connect(user1).revealOrder(BUY, tokenIn, tokenOut, amount, 0, ethers.parseEther("110"), makeSalt("e2b"));
    await router.connect(user2).revealOrder(SELL, tokenIn, tokenOut, amount, 0, ethers.parseEther("85"), makeSalt("e2s"));
    await time.increase(REVEAL_WINDOW + 1);
    await router.settleEpoch(2);

    const feesAfter2 = await router.totalProtocolFees();
    expect(feesAfter2).to.be.gt(feesAfter1);
  });

  it("should allow admin to set protocol fee", async function () {
    const { router } = await loadFixture(deployFixture);
    await router.setProtocolFee(25); // 0.25%
    expect(await router.protocolFeeBps()).to.equal(25);
  });

  it("should revert setProtocolFee for non-admin", async function () {
    const { router, attacker } = await loadFixture(deployFixture);
    await expect(
      router.connect(attacker).setProtocolFee(25)
    ).to.be.revertedWithCustomError(router, "AccessControlUnauthorizedAccount");
  });

  it("should revert setProtocolFee above 100 bps", async function () {
    const { router } = await loadFixture(deployFixture);
    await expect(
      router.setProtocolFee(101)
    ).to.be.revertedWith("ShieldXRouter: fee cannot exceed 1%");
  });

  it("should emit ProtocolFeeCollected event", async function () {
    const { router, user1, user2 } = await loadFixture(deployFixture);

    const buyHash = computeCommitHash(BUY, tokenIn, tokenOut, amount, 0, ethers.parseEther("100"), makeSalt("ev-b"));
    const sellHash = computeCommitHash(SELL, tokenIn, tokenOut, amount, 0, ethers.parseEther("90"), makeSalt("ev-s"));

    await router.connect(user1).commitOrder(buyHash, { value: COLLATERAL });
    await router.connect(user2).commitOrder(sellHash, { value: COLLATERAL });
    await time.increase(EPOCH_DURATION + 1);
    await router.connect(user1).revealOrder(BUY, tokenIn, tokenOut, amount, 0, ethers.parseEther("100"), makeSalt("ev-b"));
    await router.connect(user2).revealOrder(SELL, tokenIn, tokenOut, amount, 0, ethers.parseEther("90"), makeSalt("ev-s"));
    await time.increase(REVEAL_WINDOW + 1);

    await expect(router.settleEpoch(1))
      .to.emit(router, "ProtocolFeeCollected")
      .withArgs(1, ethers.parseEther("0.02"));
  });

  it("should return correct cumulative stats via getProtocolStats", async function () {
    const { router, user1, user2 } = await loadFixture(deployFixture);
    await commitRevealSettle(router, [
      { signer: user1, type: BUY, price: ethers.parseEther("110"), salt: makeSalt("st-b") },
      { signer: user2, type: SELL, price: ethers.parseEther("90"), salt: makeSalt("st-s") },
    ]);

    const [orders, volume, mevSaved, fees] = await router.getProtocolStats();
    expect(orders).to.equal(2); // 1 buy + 1 sell filled
    expect(volume).to.equal(ethers.parseEther("20")); // 10 + 10
    expect(mevSaved).to.be.gt(0);
    expect(fees).to.equal(ethers.parseEther("0.02"));
  });

  it("should collect zero fees when fee is set to 0", async function () {
    const { router, user1, user2 } = await loadFixture(deployFixture);
    await router.setProtocolFee(0);

    await commitRevealSettle(router, [
      { signer: user1, type: BUY, price: ethers.parseEther("100"), salt: makeSalt("zf-b") },
      { signer: user2, type: SELL, price: ethers.parseEther("90"), salt: makeSalt("zf-s") },
    ]);

    expect(await router.totalProtocolFees()).to.equal(0);
  });
});
