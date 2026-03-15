const { expect } = require("chai");
const { ethers } = require("hardhat");
const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("AccessControl & Pausable", function () {
  const EPOCH_DURATION = 60;
  const REVEAL_WINDOW = 60;
  const MIN_COLLATERAL = ethers.parseEther("0.01");
  const COLLATERAL = ethers.parseEther("0.1");
  const BUY = 0;
  const tokenIn = ethers.ZeroAddress;
  const tokenOut = "0x0000000000000000000000000000000000000001";
  const amount = ethers.parseEther("10");
  const price = ethers.parseEther("100");

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
    const [deployer, user1, attacker, treasury] = await ethers.getSigners();

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

    return { router, vault, settlement, deployer, user1, attacker, treasury };
  }

  describe("Router roles", function () {
    it("deployer should have DEFAULT_ADMIN_ROLE", async function () {
      const { router, deployer } = await loadFixture(deployFixture);
      expect(await router.hasRole(await router.DEFAULT_ADMIN_ROLE(), deployer.address)).to.be.true;
    });

    it("deployer should have SETTLER_ROLE", async function () {
      const { router, deployer } = await loadFixture(deployFixture);
      expect(await router.hasRole(await router.SETTLER_ROLE(), deployer.address)).to.be.true;
    });

    it("deployer should have PAUSER_ROLE", async function () {
      const { router, deployer } = await loadFixture(deployFixture);
      expect(await router.hasRole(await router.PAUSER_ROLE(), deployer.address)).to.be.true;
    });

    it("admin can grant SETTLER_ROLE to another account", async function () {
      const { router, user1 } = await loadFixture(deployFixture);
      const SETTLER_ROLE = await router.SETTLER_ROLE();
      await router.grantRole(SETTLER_ROLE, user1.address);
      expect(await router.hasRole(SETTLER_ROLE, user1.address)).to.be.true;
    });

    it("non-admin cannot grant roles", async function () {
      const { router, attacker, user1 } = await loadFixture(deployFixture);
      const SETTLER_ROLE = await router.SETTLER_ROLE();
      await expect(
        router.connect(attacker).grantRole(SETTLER_ROLE, user1.address)
      ).to.be.revertedWithCustomError(router, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Pausable", function () {
    it("PAUSER_ROLE can pause protocol", async function () {
      const { router } = await loadFixture(deployFixture);
      await router.pause();
      expect(await router.paused()).to.be.true;
    });

    it("commitOrder reverts when paused", async function () {
      const { router, user1 } = await loadFixture(deployFixture);
      await router.pause();

      const hash = computeCommitHash(BUY, tokenIn, tokenOut, amount, 0, price, makeSalt("p1"));
      await expect(
        router.connect(user1).commitOrder(hash, { value: COLLATERAL })
      ).to.be.revertedWithCustomError(router, "EnforcedPause");
    });

    it("revealOrder reverts when paused", async function () {
      const { router, user1 } = await loadFixture(deployFixture);

      // Commit first while unpaused
      const salt = makeSalt("p2");
      const hash = computeCommitHash(BUY, tokenIn, tokenOut, amount, 0, price, salt);
      await router.connect(user1).commitOrder(hash, { value: COLLATERAL });

      // Advance to reveal window
      await time.increase(EPOCH_DURATION + 1);

      // Pause
      await router.pause();

      // Reveal should fail
      await expect(
        router.connect(user1).revealOrder(BUY, tokenIn, tokenOut, amount, 0, price, salt)
      ).to.be.revertedWithCustomError(router, "EnforcedPause");
    });

    it("settleEpoch still works when paused (emergency settlement)", async function () {
      const { router, user1, attacker } = await loadFixture(deployFixture);

      // Commit + reveal while unpaused
      const salt1 = makeSalt("e-buy");
      const salt2 = makeSalt("e-sell");
      const buyHash = computeCommitHash(BUY, tokenIn, tokenOut, amount, 0, price, salt1);
      const sellHash = computeCommitHash(1, tokenIn, tokenOut, amount, 0, ethers.parseEther("90"), salt2);

      await router.connect(user1).commitOrder(buyHash, { value: COLLATERAL });
      await router.connect(attacker).commitOrder(sellHash, { value: COLLATERAL });

      await time.increase(EPOCH_DURATION + 1);
      await router.connect(user1).revealOrder(BUY, tokenIn, tokenOut, amount, 0, price, salt1);
      await router.connect(attacker).revealOrder(1, tokenIn, tokenOut, amount, 0, ethers.parseEther("90"), salt2);

      await time.increase(REVEAL_WINDOW + 1);

      // Pause THEN settle — should still work
      await router.pause();
      await expect(router.settleEpoch(1)).to.emit(router, "EpochSettled");
    });

    it("unpause re-enables commits and reveals", async function () {
      const { router, user1 } = await loadFixture(deployFixture);

      await router.pause();
      await router.unpause();

      const hash = computeCommitHash(BUY, tokenIn, tokenOut, amount, 0, price, makeSalt("u1"));
      await expect(
        router.connect(user1).commitOrder(hash, { value: COLLATERAL })
      ).to.emit(router, "OrderCommitted");
    });

    it("cannot pause without PAUSER_ROLE", async function () {
      const { router, attacker } = await loadFixture(deployFixture);
      await expect(
        router.connect(attacker).pause()
      ).to.be.revertedWithCustomError(router, "AccessControlUnauthorizedAccount");
    });
  });

  describe("Vault ROUTER_ROLE", function () {
    it("only ROUTER_ROLE can call lockCollateral", async function () {
      const { vault, attacker } = await loadFixture(deployFixture);
      const hash = ethers.keccak256(ethers.toUtf8Bytes("test"));
      await expect(
        vault.connect(attacker).lockCollateral(attacker.address, hash, { value: COLLATERAL })
      ).to.be.revertedWithCustomError(vault, "AccessControlUnauthorizedAccount");
    });
  });
});
