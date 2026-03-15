const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("ShieldXVault", function () {
  const testHash = ethers.keccak256(ethers.toUtf8Bytes("test-order-1"));
  const testHash2 = ethers.keccak256(ethers.toUtf8Bytes("test-order-2"));

  async function deployVaultFixture() {
    const [deployer, user1, user2, treasury, attacker] = await ethers.getSigners();
    const ShieldXVault = await ethers.getContractFactory("ShieldXVault");
    const vault = await ShieldXVault.deploy(treasury.address);
    await vault.waitForDeployment();
    return { vault, deployer, user1, user2, treasury, attacker };
  }

  describe("constructor", function () {
    it("should set the treasury address", async function () {
      const { vault, treasury } = await loadFixture(deployVaultFixture);
      expect(await vault.treasury()).to.equal(treasury.address);
    });

    it("should grant deployer DEFAULT_ADMIN_ROLE and ROUTER_ROLE", async function () {
      const { vault, deployer } = await loadFixture(deployVaultFixture);
      const ROUTER_ROLE = await vault.ROUTER_ROLE();
      const DEFAULT_ADMIN = await vault.DEFAULT_ADMIN_ROLE();
      expect(await vault.hasRole(ROUTER_ROLE, deployer.address)).to.be.true;
      expect(await vault.hasRole(DEFAULT_ADMIN, deployer.address)).to.be.true;
    });

    it("should revert if treasury is zero address", async function () {
      const ShieldXVault = await ethers.getContractFactory("ShieldXVault");
      await expect(
        ShieldXVault.deploy(ethers.ZeroAddress)
      ).to.be.revertedWith("ShieldXVault: treasury cannot be zero address");
    });
  });

  describe("setRouter", function () {
    it("should allow admin to grant ROUTER_ROLE via setRouter", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      await vault.setRouter(user1.address);
      const ROUTER_ROLE = await vault.ROUTER_ROLE();
      expect(await vault.hasRole(ROUTER_ROLE, user1.address)).to.be.true;
    });

    it("should revert when non-admin calls setRouter", async function () {
      const { vault, attacker, user1 } = await loadFixture(deployVaultFixture);
      await expect(
        vault.connect(attacker).setRouter(user1.address)
      ).to.be.revertedWithCustomError(vault, "AccessControlUnauthorizedAccount");
    });

    it("should revert when setting router to zero address", async function () {
      const { vault } = await loadFixture(deployVaultFixture);
      await expect(
        vault.setRouter(ethers.ZeroAddress)
      ).to.be.revertedWith("ShieldXVault: router cannot be zero address");
    });
  });

  describe("lockCollateral", function () {
    it("should lock collateral for a user", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      const amount = ethers.parseEther("1.0");

      await vault.lockCollateral(user1.address, testHash, { value: amount });
      expect(await vault.collateral(user1.address)).to.equal(amount);
      expect(await vault.commitCollateral(testHash)).to.equal(amount);
    });

    it("should emit CollateralLocked event", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      const amount = ethers.parseEther("1.0");

      await expect(vault.lockCollateral(user1.address, testHash, { value: amount }))
        .to.emit(vault, "CollateralLocked")
        .withArgs(user1.address, testHash, amount);
    });

    it("should accumulate total collateral for multiple locks", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      const amount1 = ethers.parseEther("1.0");
      const amount2 = ethers.parseEther("2.0");

      await vault.lockCollateral(user1.address, testHash, { value: amount1 });
      await vault.lockCollateral(user1.address, testHash2, { value: amount2 });

      expect(await vault.collateral(user1.address)).to.equal(amount1 + amount2);
      expect(await vault.commitCollateral(testHash)).to.equal(amount1);
      expect(await vault.commitCollateral(testHash2)).to.equal(amount2);
    });

    it("should revert when non-router calls lockCollateral", async function () {
      const { vault, attacker, user1 } = await loadFixture(deployVaultFixture);
      await expect(
        vault.connect(attacker).lockCollateral(user1.address, testHash, { value: ethers.parseEther("1.0") })
      ).to.be.revertedWithCustomError(vault, "AccessControlUnauthorizedAccount");
    });

    it("should revert when collateral amount is zero", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      await expect(
        vault.lockCollateral(user1.address, testHash, { value: 0 })
      ).to.be.revertedWith("ShieldXVault: collateral amount must be greater than zero");
    });

    it("should track collateral for multiple users independently", async function () {
      const { vault, user1, user2 } = await loadFixture(deployVaultFixture);
      const amount1 = ethers.parseEther("1.0");
      const amount2 = ethers.parseEther("3.0");

      await vault.lockCollateral(user1.address, testHash, { value: amount1 });
      await vault.lockCollateral(user2.address, testHash2, { value: amount2 });

      expect(await vault.collateral(user1.address)).to.equal(amount1);
      expect(await vault.collateral(user2.address)).to.equal(amount2);
    });
  });

  describe("returnCollateral", function () {
    it("should return collateral for a specific commitment", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      const amount = ethers.parseEther("1.0");

      await vault.lockCollateral(user1.address, testHash, { value: amount });

      const balanceBefore = await ethers.provider.getBalance(user1.address);
      await vault.returnCollateral(user1.address, testHash);
      const balanceAfter = await ethers.provider.getBalance(user1.address);

      expect(balanceAfter - balanceBefore).to.equal(amount);
    });

    it("should zero out commit collateral and reduce user total", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      await vault.lockCollateral(user1.address, testHash, { value: ethers.parseEther("1.0") });
      await vault.returnCollateral(user1.address, testHash);
      expect(await vault.commitCollateral(testHash)).to.equal(0);
      expect(await vault.collateral(user1.address)).to.equal(0);
    });

    it("should emit CollateralReturned event", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      const amount = ethers.parseEther("1.0");

      await vault.lockCollateral(user1.address, testHash, { value: amount });
      await expect(vault.returnCollateral(user1.address, testHash))
        .to.emit(vault, "CollateralReturned")
        .withArgs(user1.address, testHash, amount);
    });

    it("should revert when commitment has no collateral", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      await expect(
        vault.returnCollateral(user1.address, testHash)
      ).to.be.revertedWith("ShieldXVault: no collateral to return");
    });

    it("should revert when non-router calls returnCollateral", async function () {
      const { vault, attacker, user1 } = await loadFixture(deployVaultFixture);
      await expect(
        vault.connect(attacker).returnCollateral(user1.address, testHash)
      ).to.be.revertedWithCustomError(vault, "AccessControlUnauthorizedAccount");
    });

    it("should return one commitment while keeping another", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      const amount1 = ethers.parseEther("1.0");
      const amount2 = ethers.parseEther("2.0");

      await vault.lockCollateral(user1.address, testHash, { value: amount1 });
      await vault.lockCollateral(user1.address, testHash2, { value: amount2 });

      await vault.returnCollateral(user1.address, testHash);

      expect(await vault.commitCollateral(testHash)).to.equal(0);
      expect(await vault.commitCollateral(testHash2)).to.equal(amount2);
      expect(await vault.collateral(user1.address)).to.equal(amount2);
    });
  });

  describe("slashCollateral", function () {
    it("should slash collateral to treasury", async function () {
      const { vault, user1, treasury } = await loadFixture(deployVaultFixture);
      const amount = ethers.parseEther("1.0");

      await vault.lockCollateral(user1.address, testHash, { value: amount });

      const treasuryBefore = await ethers.provider.getBalance(treasury.address);
      await vault.slashCollateral(user1.address, testHash);
      const treasuryAfter = await ethers.provider.getBalance(treasury.address);

      expect(treasuryAfter - treasuryBefore).to.equal(amount);
    });

    it("should zero out commit collateral after slash", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      await vault.lockCollateral(user1.address, testHash, { value: ethers.parseEther("1.0") });
      await vault.slashCollateral(user1.address, testHash);
      expect(await vault.commitCollateral(testHash)).to.equal(0);
      expect(await vault.collateral(user1.address)).to.equal(0);
    });

    it("should emit CollateralSlashed event", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      const amount = ethers.parseEther("1.0");

      await vault.lockCollateral(user1.address, testHash, { value: amount });
      await expect(vault.slashCollateral(user1.address, testHash))
        .to.emit(vault, "CollateralSlashed")
        .withArgs(user1.address, testHash, amount);
    });

    it("should revert when commitment has no collateral", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      await expect(
        vault.slashCollateral(user1.address, testHash)
      ).to.be.revertedWith("ShieldXVault: no collateral to slash");
    });

    it("should revert when non-router calls slashCollateral", async function () {
      const { vault, attacker, user1 } = await loadFixture(deployVaultFixture);
      await expect(
        vault.connect(attacker).slashCollateral(user1.address, testHash)
      ).to.be.revertedWithCustomError(vault, "AccessControlUnauthorizedAccount");
    });

    it("should slash one commitment while keeping another", async function () {
      const { vault, user1, treasury } = await loadFixture(deployVaultFixture);
      const amount1 = ethers.parseEther("1.0");
      const amount2 = ethers.parseEther("2.0");

      await vault.lockCollateral(user1.address, testHash, { value: amount1 });
      await vault.lockCollateral(user1.address, testHash2, { value: amount2 });

      await vault.slashCollateral(user1.address, testHash);

      expect(await vault.commitCollateral(testHash)).to.equal(0);
      expect(await vault.commitCollateral(testHash2)).to.equal(amount2);
      expect(await vault.collateral(user1.address)).to.equal(amount2);
    });
  });

  describe("releaseFill", function () {
    it("should release fill to user", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      const amount = ethers.parseEther("2.0");

      await vault.lockCollateral(user1.address, testHash, { value: amount });

      const balanceBefore = await ethers.provider.getBalance(user1.address);
      await vault.releaseFill(user1.address, ethers.parseEther("1.0"));
      const balanceAfter = await ethers.provider.getBalance(user1.address);

      expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("1.0"));
    });

    it("should emit FillReleased event", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      const amount = ethers.parseEther("2.0");
      const releaseAmount = ethers.parseEther("1.0");

      await vault.lockCollateral(user1.address, testHash, { value: amount });
      await expect(vault.releaseFill(user1.address, releaseAmount))
        .to.emit(vault, "FillReleased")
        .withArgs(user1.address, releaseAmount);
    });

    it("should revert when non-router calls releaseFill", async function () {
      const { vault, attacker, user1 } = await loadFixture(deployVaultFixture);
      await expect(
        vault.connect(attacker).releaseFill(user1.address, ethers.parseEther("1.0"))
      ).to.be.revertedWithCustomError(vault, "AccessControlUnauthorizedAccount");
    });

    it("should revert when release amount is zero", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      await expect(
        vault.releaseFill(user1.address, 0)
      ).to.be.revertedWith("ShieldXVault: release amount must be greater than zero");
    });

    it("should revert when vault has insufficient balance", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      await expect(
        vault.releaseFill(user1.address, ethers.parseEther("100.0"))
      ).to.be.revertedWith("ShieldXVault: insufficient vault balance");
    });
  });

  describe("receive", function () {
    it("should accept direct PAS deposits", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      const amount = ethers.parseEther("5.0");

      await user1.sendTransaction({
        to: await vault.getAddress(),
        value: amount,
      });

      expect(await ethers.provider.getBalance(await vault.getAddress())).to.equal(amount);
    });
  });

  describe("edge cases", function () {
    it("should track vault balance correctly after multiple lock/return cycles", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      const hash1 = ethers.keccak256(ethers.toUtf8Bytes("cycle-1"));
      const hash2 = ethers.keccak256(ethers.toUtf8Bytes("cycle-2"));

      await vault.lockCollateral(user1.address, hash1, { value: ethers.parseEther("1.0") });
      await vault.lockCollateral(user1.address, hash2, { value: ethers.parseEther("2.0") });
      expect(await vault.collateral(user1.address)).to.equal(ethers.parseEther("3.0"));

      await vault.returnCollateral(user1.address, hash1);
      expect(await vault.collateral(user1.address)).to.equal(ethers.parseEther("2.0"));

      await vault.returnCollateral(user1.address, hash2);
      expect(await vault.collateral(user1.address)).to.equal(0);
    });

    it("should handle concurrent operations from multiple users", async function () {
      const { vault, user1, user2 } = await loadFixture(deployVaultFixture);
      const hash1 = ethers.keccak256(ethers.toUtf8Bytes("user1-hash"));
      const hash2 = ethers.keccak256(ethers.toUtf8Bytes("user2-hash"));

      await vault.lockCollateral(user1.address, hash1, { value: ethers.parseEther("1.0") });
      await vault.lockCollateral(user2.address, hash2, { value: ethers.parseEther("2.0") });

      await vault.returnCollateral(user1.address, hash1);
      expect(await vault.collateral(user1.address)).to.equal(0);
      expect(await vault.collateral(user2.address)).to.equal(ethers.parseEther("2.0"));
    });

    it("should send slashed collateral to correct treasury address", async function () {
      const { vault, user1, treasury } = await loadFixture(deployVaultFixture);
      const hash = ethers.keccak256(ethers.toUtf8Bytes("slash-verify"));
      const amount = ethers.parseEther("1.5");

      await vault.lockCollateral(user1.address, hash, { value: amount });

      const before = await ethers.provider.getBalance(treasury.address);
      await vault.slashCollateral(user1.address, hash);
      const after = await ethers.provider.getBalance(treasury.address);

      expect(after - before).to.equal(amount);
    });

    it("should track vault balance via receive() correctly", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      const vaultAddr = await vault.getAddress();

      await user1.sendTransaction({ to: vaultAddr, value: ethers.parseEther("3.0") });
      await user1.sendTransaction({ to: vaultAddr, value: ethers.parseEther("2.0") });

      expect(await ethers.provider.getBalance(vaultAddr)).to.equal(ethers.parseEther("5.0"));
    });

    it("should handle maximum collateral values", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      const hash = ethers.keccak256(ethers.toUtf8Bytes("big-amount"));
      const bigAmount = ethers.parseEther("1000");
      await vault.lockCollateral(user1.address, hash, { value: bigAmount });
      expect(await vault.commitCollateral(hash)).to.equal(bigAmount);
    });

    it("should not allow double-return of same commitment", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      const hash = ethers.keccak256(ethers.toUtf8Bytes("double-return"));
      await vault.lockCollateral(user1.address, hash, { value: ethers.parseEther("1.0") });
      await vault.returnCollateral(user1.address, hash);
      await expect(vault.returnCollateral(user1.address, hash))
        .to.be.revertedWith("ShieldXVault: no collateral to return");
    });

    it("should return exact collateral amount per commitment", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      const hash = ethers.keccak256(ethers.toUtf8Bytes("exact-amount"));
      const precise = ethers.parseEther("1.234567890123456789");

      await vault.lockCollateral(user1.address, hash, { value: precise });

      const before = await ethers.provider.getBalance(user1.address);
      await vault.returnCollateral(user1.address, hash);
      const after = await ethers.provider.getBalance(user1.address);

      expect(after - before).to.equal(precise);
    });
  });
});
