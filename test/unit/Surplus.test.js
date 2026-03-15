const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("Surplus Tracking", function () {
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

    await vault.setRouter(await router.getAddress());
    await settlement.setRouter(await router.getAddress());

    return { router, vault, deployer, user1, user2, user3, treasury };
  }

  async function commitRevealSettle(router, orders) {
    // Commit all
    for (const o of orders) {
      const hash = computeCommitHash(o.type, tokenIn, tokenOut, amount, 0, o.price, o.salt);
      await router.connect(o.signer).commitOrder(hash, { value: COLLATERAL });
    }
    // Advance to reveal
    await time.increase(EPOCH_DURATION + 1);
    // Reveal all
    for (const o of orders) {
      await router.connect(o.signer).revealOrder(o.type, tokenIn, tokenOut, amount, 0, o.price, o.salt);
    }
    // Advance past reveal
    await time.increase(REVEAL_WINDOW + 1);
    // Settle
    return router.settleEpoch(1);
  }

  it("should give surplus > 0 when buy limit is above clearing price", async function () {
    const { router, user1, user2 } = await loadFixture(deployFixture);

    await commitRevealSettle(router, [
      { signer: user1, type: BUY, price: ethers.parseEther("110"), salt: makeSalt("b1") },
      { signer: user2, type: SELL, price: ethers.parseEther("90"), salt: makeSalt("s1") },
    ]);

    // Clearing = (110+90)/2 = 100. Buy surplus = (110-100)*10/100 = 1
    const surplus = await router.getUserSurplus(1, user1.address);
    expect(surplus).to.equal(ethers.parseEther("1"));
  });

  it("should give surplus = 0 when buy limit equals clearing price", async function () {
    const { router, user1, user2 } = await loadFixture(deployFixture);

    await commitRevealSettle(router, [
      { signer: user1, type: BUY, price: ethers.parseEther("100"), salt: makeSalt("b1") },
      { signer: user2, type: SELL, price: ethers.parseEther("100"), salt: makeSalt("s1") },
    ]);

    // Clearing = 100. Buy at 100 → surplus = 0
    expect(await router.getUserSurplus(1, user1.address)).to.equal(0);
  });

  it("should give surplus = 0 for unfilled orders", async function () {
    const { router, user1, user2, user3 } = await loadFixture(deployFixture);

    await commitRevealSettle(router, [
      { signer: user1, type: BUY, price: ethers.parseEther("110"), salt: makeSalt("b1") },
      { signer: user2, type: BUY, price: ethers.parseEther("80"), salt: makeSalt("b2") },  // won't fill
      { signer: user3, type: SELL, price: ethers.parseEther("90"), salt: makeSalt("s1") },
    ]);

    // Clearing = (110+90)/2 = 100. Buy at 80 < 100 → not filled → no surplus
    expect(await router.getUserSurplus(1, user2.address)).to.equal(0);
  });

  it("should track correct individual surplus for multiple users", async function () {
    const { router, user1, user2, user3 } = await loadFixture(deployFixture);

    await commitRevealSettle(router, [
      { signer: user1, type: BUY, price: ethers.parseEther("120"), salt: makeSalt("b1") },
      { signer: user2, type: BUY, price: ethers.parseEther("110"), salt: makeSalt("b2") },
      { signer: user3, type: SELL, price: ethers.parseEther("90"), salt: makeSalt("s1") },
    ]);

    // Buys sorted [120, 110], sell [90]. One crossing (120>=90), clearing = (120+90)/2 = 105
    const epoch = await router.getCurrentEpoch();
    const clearing = epoch.clearingPrice;

    // user1 surplus = (120-105)*10/105
    const surplus1 = await router.getUserSurplus(1, user1.address);
    expect(surplus1).to.be.gt(0);

    // user2 surplus = (110-105)*10/105
    const surplus2 = await router.getUserSurplus(1, user2.address);
    expect(surplus2).to.be.gt(0);

    // user1 saved more than user2 (higher limit above clearing)
    expect(surplus1).to.be.gt(surplus2);
  });

  it("should return correct epoch total surplus", async function () {
    const { router, user1, user2, user3 } = await loadFixture(deployFixture);

    await commitRevealSettle(router, [
      { signer: user1, type: BUY, price: ethers.parseEther("120"), salt: makeSalt("b1") },
      { signer: user2, type: BUY, price: ethers.parseEther("110"), salt: makeSalt("b2") },
      { signer: user3, type: SELL, price: ethers.parseEther("90"), salt: makeSalt("s1") },
    ]);

    // user1: 2, user2: 1, sell surplus: (100-90)*10/100 = 1
    const total = await router.getEpochTotalSurplus(1);
    const u1 = await router.getUserSurplus(1, user1.address);
    const u2 = await router.getUserSurplus(1, user2.address);
    const u3 = await router.getUserSurplus(1, user3.address);
    expect(total).to.equal(u1 + u2 + u3);
  });

  it("should emit MEVSaved event with correct values", async function () {
    const { router, user1, user2 } = await loadFixture(deployFixture);

    const buyHash = computeCommitHash(BUY, tokenIn, tokenOut, amount, 0, ethers.parseEther("110"), makeSalt("b1"));
    const sellHash = computeCommitHash(SELL, tokenIn, tokenOut, amount, 0, ethers.parseEther("90"), makeSalt("s1"));

    await router.connect(user1).commitOrder(buyHash, { value: COLLATERAL });
    await router.connect(user2).commitOrder(sellHash, { value: COLLATERAL });
    await time.increase(EPOCH_DURATION + 1);
    await router.connect(user1).revealOrder(BUY, tokenIn, tokenOut, amount, 0, ethers.parseEther("110"), makeSalt("b1"));
    await router.connect(user2).revealOrder(SELL, tokenIn, tokenOut, amount, 0, ethers.parseEther("90"), makeSalt("s1"));
    await time.increase(REVEAL_WINDOW + 1);

    // surplus = (110-100)*10/100 = 1e18
    await expect(router.settleEpoch(1))
      .to.emit(router, "MEVSaved")
      .withArgs(1, user1.address, ethers.parseEther("1"));
  });

  it("should calculate sell order surplus correctly", async function () {
    const { router, user1, user2 } = await loadFixture(deployFixture);

    await commitRevealSettle(router, [
      { signer: user1, type: BUY, price: ethers.parseEther("110"), salt: makeSalt("b1") },
      { signer: user2, type: SELL, price: ethers.parseEther("80"), salt: makeSalt("s1") },
    ]);

    // Clearing = (110+80)/2 = 95. Sell surplus = (95-80)*10/95 ≈ 1.578...e18
    const surplus = await router.getUserSurplus(1, user2.address);
    expect(surplus).to.be.gt(0);
    // (95-80)*10/95 = 150/95 = 1.578... in token units
    expect(surplus).to.be.gt(ethers.parseEther("1.5"));
    expect(surplus).to.be.lt(ethers.parseEther("1.6"));
  });

  it("should return 0 surplus when clearing equals limit exactly", async function () {
    const { router, user1, user2 } = await loadFixture(deployFixture);

    // Both at 100 → clearing = 100, zero surplus for both
    await commitRevealSettle(router, [
      { signer: user1, type: BUY, price: ethers.parseEther("100"), salt: makeSalt("b1") },
      { signer: user2, type: SELL, price: ethers.parseEther("100"), salt: makeSalt("s1") },
    ]);

    expect(await router.getUserSurplus(1, user1.address)).to.equal(0);
    expect(await router.getUserSurplus(1, user2.address)).to.equal(0);
    expect(await router.getEpochTotalSurplus(1)).to.equal(0);
  });

  it("should return 0 for non-existent epoch", async function () {
    const { router, user1 } = await loadFixture(deployFixture);
    expect(await router.getUserSurplus(999, user1.address)).to.equal(0);
    expect(await router.getEpochTotalSurplus(999)).to.equal(0);
  });

  it("should track surplus through full commit-reveal-settle cycle", async function () {
    const { router, vault, user1, user2, treasury } = await loadFixture(deployFixture);

    const buyPrice = ethers.parseEther("120");
    const sellPrice = ethers.parseEther("80");
    const salt1 = makeSalt("full-buy");
    const salt2 = makeSalt("full-sell");

    // Commit
    const buyHash = computeCommitHash(BUY, tokenIn, tokenOut, amount, 0, buyPrice, salt1);
    const sellHash = computeCommitHash(SELL, tokenIn, tokenOut, amount, 0, sellPrice, salt2);
    await router.connect(user1).commitOrder(buyHash, { value: COLLATERAL });
    await router.connect(user2).commitOrder(sellHash, { value: COLLATERAL });

    // Reveal
    await time.increase(EPOCH_DURATION + 1);
    await router.connect(user1).revealOrder(BUY, tokenIn, tokenOut, amount, 0, buyPrice, salt1);
    await router.connect(user2).revealOrder(SELL, tokenIn, tokenOut, amount, 0, sellPrice, salt2);

    // Settle
    await time.increase(REVEAL_WINDOW + 1);
    await router.settleEpoch(1);

    // Clearing = (120+80)/2 = 100
    const epoch = await router.getCurrentEpoch();
    expect(epoch.clearingPrice).to.equal(ethers.parseEther("100"));

    // Buy surplus: (120-100)*10/100 = 2
    expect(await router.getUserSurplus(1, user1.address)).to.equal(ethers.parseEther("2"));
    // Sell surplus: (100-80)*10/100 = 2
    expect(await router.getUserSurplus(1, user2.address)).to.equal(ethers.parseEther("2"));
    // Total: 4
    expect(await router.getEpochTotalSurplus(1)).to.equal(ethers.parseEther("4"));
  });
});
