const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("ShieldXVault", function () {
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

    it("should set deployer as initial router", async function () {
      const { vault, deployer } = await loadFixture(deployVaultFixture);
      expect(await vault.router()).to.equal(deployer.address);
    });

    it("should revert if treasury is zero address", async function () {
      const ShieldXVault = await ethers.getContractFactory("ShieldXVault");
      await expect(
        ShieldXVault.deploy(ethers.ZeroAddress)
      ).to.be.revertedWith("ShieldXVault: treasury cannot be zero address");
    });
  });

  describe("setRouter", function () {
    it("should allow router to set a new router", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      await vault.setRouter(user1.address);
      expect(await vault.router()).to.equal(user1.address);
    });

    it("should revert when non-router calls setRouter", async function () {
      const { vault, attacker, user1 } = await loadFixture(deployVaultFixture);
      await expect(
        vault.connect(attacker).setRouter(user1.address)
      ).to.be.revertedWith("ShieldXVault: caller is not the router");
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

      await vault.lockCollateral(user1.address, { value: amount });
      expect(await vault.collateral(user1.address)).to.equal(amount);
    });

    it("should emit CollateralLocked event", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      const amount = ethers.parseEther("1.0");

      await expect(vault.lockCollateral(user1.address, { value: amount }))
        .to.emit(vault, "CollateralLocked")
        .withArgs(user1.address, amount);
    });

    it("should accumulate collateral for multiple locks", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      const amount1 = ethers.parseEther("1.0");
      const amount2 = ethers.parseEther("2.0");

      await vault.lockCollateral(user1.address, { value: amount1 });
      await vault.lockCollateral(user1.address, { value: amount2 });

      expect(await vault.collateral(user1.address)).to.equal(amount1 + amount2);
    });

    it("should revert when non-router calls lockCollateral", async function () {
      const { vault, attacker, user1 } = await loadFixture(deployVaultFixture);
      await expect(
        vault.connect(attacker).lockCollateral(user1.address, { value: ethers.parseEther("1.0") })
      ).to.be.revertedWith("ShieldXVault: caller is not the router");
    });

    it("should revert when collateral amount is zero", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      await expect(
        vault.lockCollateral(user1.address, { value: 0 })
      ).to.be.revertedWith("ShieldXVault: collateral amount must be greater than zero");
    });

    it("should track collateral for multiple users independently", async function () {
      const { vault, user1, user2 } = await loadFixture(deployVaultFixture);
      const amount1 = ethers.parseEther("1.0");
      const amount2 = ethers.parseEther("3.0");

      await vault.lockCollateral(user1.address, { value: amount1 });
      await vault.lockCollateral(user2.address, { value: amount2 });

      expect(await vault.collateral(user1.address)).to.equal(amount1);
      expect(await vault.collateral(user2.address)).to.equal(amount2);
    });
  });

  describe("returnCollateral", function () {
    it("should return collateral to user", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      const amount = ethers.parseEther("1.0");

      await vault.lockCollateral(user1.address, { value: amount });

      const balanceBefore = await ethers.provider.getBalance(user1.address);
      await vault.returnCollateral(user1.address);
      const balanceAfter = await ethers.provider.getBalance(user1.address);

      expect(balanceAfter - balanceBefore).to.equal(amount);
    });

    it("should zero out collateral after return", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      await vault.lockCollateral(user1.address, { value: ethers.parseEther("1.0") });
      await vault.returnCollateral(user1.address);
      expect(await vault.collateral(user1.address)).to.equal(0);
    });

    it("should emit CollateralReturned event", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      const amount = ethers.parseEther("1.0");

      await vault.lockCollateral(user1.address, { value: amount });
      await expect(vault.returnCollateral(user1.address))
        .to.emit(vault, "CollateralReturned")
        .withArgs(user1.address, amount);
    });

    it("should revert when user has no collateral", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      await expect(
        vault.returnCollateral(user1.address)
      ).to.be.revertedWith("ShieldXVault: no collateral to return");
    });

    it("should revert when non-router calls returnCollateral", async function () {
      const { vault, attacker, user1 } = await loadFixture(deployVaultFixture);
      await expect(
        vault.connect(attacker).returnCollateral(user1.address)
      ).to.be.revertedWith("ShieldXVault: caller is not the router");
    });
  });

  describe("slashCollateral", function () {
    it("should slash collateral to treasury", async function () {
      const { vault, user1, treasury } = await loadFixture(deployVaultFixture);
      const amount = ethers.parseEther("1.0");

      await vault.lockCollateral(user1.address, { value: amount });

      const treasuryBefore = await ethers.provider.getBalance(treasury.address);
      await vault.slashCollateral(user1.address);
      const treasuryAfter = await ethers.provider.getBalance(treasury.address);

      expect(treasuryAfter - treasuryBefore).to.equal(amount);
    });

    it("should zero out collateral after slash", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      await vault.lockCollateral(user1.address, { value: ethers.parseEther("1.0") });
      await vault.slashCollateral(user1.address);
      expect(await vault.collateral(user1.address)).to.equal(0);
    });

    it("should emit CollateralSlashed event", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      const amount = ethers.parseEther("1.0");

      await vault.lockCollateral(user1.address, { value: amount });
      await expect(vault.slashCollateral(user1.address))
        .to.emit(vault, "CollateralSlashed")
        .withArgs(user1.address, amount);
    });

    it("should revert when user has no collateral", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      await expect(
        vault.slashCollateral(user1.address)
      ).to.be.revertedWith("ShieldXVault: no collateral to slash");
    });

    it("should revert when non-router calls slashCollateral", async function () {
      const { vault, attacker, user1 } = await loadFixture(deployVaultFixture);
      await expect(
        vault.connect(attacker).slashCollateral(user1.address)
      ).to.be.revertedWith("ShieldXVault: caller is not the router");
    });
  });

  describe("releaseFill", function () {
    it("should release fill to user", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      const amount = ethers.parseEther("2.0");

      // Fund vault directly
      await vault.lockCollateral(user1.address, { value: amount });

      const balanceBefore = await ethers.provider.getBalance(user1.address);
      await vault.releaseFill(user1.address, ethers.parseEther("1.0"));
      const balanceAfter = await ethers.provider.getBalance(user1.address);

      expect(balanceAfter - balanceBefore).to.equal(ethers.parseEther("1.0"));
    });

    it("should emit FillReleased event", async function () {
      const { vault, user1 } = await loadFixture(deployVaultFixture);
      const amount = ethers.parseEther("2.0");
      const releaseAmount = ethers.parseEther("1.0");

      await vault.lockCollateral(user1.address, { value: amount });
      await expect(vault.releaseFill(user1.address, releaseAmount))
        .to.emit(vault, "FillReleased")
        .withArgs(user1.address, releaseAmount);
    });

    it("should revert when non-router calls releaseFill", async function () {
      const { vault, attacker, user1 } = await loadFixture(deployVaultFixture);
      await expect(
        vault.connect(attacker).releaseFill(user1.address, ethers.parseEther("1.0"))
      ).to.be.revertedWith("ShieldXVault: caller is not the router");
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
});
