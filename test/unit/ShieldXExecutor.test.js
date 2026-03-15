const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("ShieldXExecutor", function () {
  async function deployExecutorFixture() {
    const [deployer, attacker, user1] = await ethers.getSigners();

    const ShieldXExecutor = await ethers.getContractFactory("ShieldXExecutor");
    const executor = await ShieldXExecutor.deploy();
    await executor.waitForDeployment();

    return { executor, deployer, attacker, user1 };
  }

  describe("constructor", function () {
    it("should grant deployer all roles", async function () {
      const { executor, deployer } = await loadFixture(deployExecutorFixture);
      expect(await executor.hasRole(await executor.DEFAULT_ADMIN_ROLE(), deployer.address)).to.be.true;
      expect(await executor.hasRole(await executor.ADMIN_ROLE(), deployer.address)).to.be.true;
      expect(await executor.hasRole(await executor.ROUTER_ROLE(), deployer.address)).to.be.true;
    });

    it("should set XCM precompile address", async function () {
      const { executor } = await loadFixture(deployExecutorFixture);
      // XCM precompile address (case-insensitive comparison via checksum)
      const xcmAddr = await executor.xcm();
      expect(xcmAddr.toLowerCase()).to.equal("0x00000000000000000000000000000000000a0000");
    });
  });

  describe("setRouter", function () {
    it("should allow admin to grant ROUTER_ROLE via setRouter", async function () {
      const { executor, user1 } = await loadFixture(deployExecutorFixture);
      await executor.setRouter(user1.address);
      expect(await executor.hasRole(await executor.ROUTER_ROLE(), user1.address)).to.be.true;
    });

    it("should revert when non-owner calls setRouter", async function () {
      const { executor, attacker, user1 } = await loadFixture(deployExecutorFixture);
      await expect(
        executor.connect(attacker).setRouter(user1.address)
      ).to.be.revertedWithCustomError(executor, "AccessControlUnauthorizedAccount");
    });

    it("should revert when setting router to zero address", async function () {
      const { executor } = await loadFixture(deployExecutorFixture);
      await expect(
        executor.setRouter(ethers.ZeroAddress)
      ).to.be.revertedWith("ShieldXExecutor: router cannot be zero address");
    });
  });

  describe("registerParachain", function () {
    it("should register parachain destination", async function () {
      const { executor } = await loadFixture(deployExecutorFixture);
      const destination = "0x0102030405";

      await executor.registerParachain(2034, destination);
      expect(await executor.getParachainDestination(2034)).to.equal(destination);
    });

    it("should emit ParachainRegistered event", async function () {
      const { executor } = await loadFixture(deployExecutorFixture);
      await expect(executor.registerParachain(2034, "0x0102030405"))
        .to.emit(executor, "ParachainRegistered")
        .withArgs(2034);
    });

    it("should revert when non-owner calls registerParachain", async function () {
      const { executor, attacker } = await loadFixture(deployExecutorFixture);
      await expect(
        executor.connect(attacker).registerParachain(2034, "0x0102030405")
      ).to.be.revertedWithCustomError(executor, "AccessControlUnauthorizedAccount");
    });

    it("should revert when destination is empty", async function () {
      const { executor } = await loadFixture(deployExecutorFixture);
      await expect(
        executor.registerParachain(2034, "0x")
      ).to.be.revertedWith("ShieldXExecutor: empty destination");
    });

    it("should allow multiple parachain registrations", async function () {
      const { executor } = await loadFixture(deployExecutorFixture);

      await executor.registerParachain(2034, "0x01"); // Hydration
      await executor.registerParachain(2030, "0x02"); // Bifrost
      await executor.registerParachain(2000, "0x03"); // Acala

      expect(await executor.getParachainDestination(2034)).to.equal("0x01");
      expect(await executor.getParachainDestination(2030)).to.equal("0x02");
      expect(await executor.getParachainDestination(2000)).to.equal("0x03");
    });
  });

  describe("getParachainDestination", function () {
    it("should return empty bytes for unregistered parachain", async function () {
      const { executor } = await loadFixture(deployExecutorFixture);
      expect(await executor.getParachainDestination(9999)).to.equal("0x");
    });
  });

  describe("getTargetParachain", function () {
    it("should return default parachain (Hydration 2034)", async function () {
      const { executor } = await loadFixture(deployExecutorFixture);
      expect(await executor.getTargetParachain(ethers.ZeroAddress)).to.equal(2034);
    });
  });

  describe("buildXcmTransferMessage", function () {
    it("should build non-empty XCM message", async function () {
      const { executor, user1 } = await loadFixture(deployExecutorFixture);
      const message = await executor.buildXcmTransferMessage(
        user1.address,
        ethers.ZeroAddress,
        ethers.parseEther("10")
      );
      // 12 bytes prefix + 20 bytes beneficiary = 32 bytes
      expect(message.length).to.be.gt(2); // > "0x"
    });

    it("should encode beneficiary address in message", async function () {
      const { executor, user1 } = await loadFixture(deployExecutorFixture);
      const message = await executor.buildXcmTransferMessage(
        user1.address,
        ethers.ZeroAddress,
        ethers.parseEther("10")
      );
      // The message should contain the beneficiary address (last 20 bytes)
      const lowerMessage = message.toLowerCase();
      const lowerAddress = user1.address.toLowerCase().slice(2);
      expect(lowerMessage).to.include(lowerAddress);
    });
  });

  describe("executeXcmFill", function () {
    it("should revert when parachain not registered", async function () {
      const { executor, user1 } = await loadFixture(deployExecutorFixture);
      // Default target is 2034, which is not registered
      await expect(
        executor.executeXcmFill(user1.address, ethers.ZeroAddress, ethers.parseEther("10"))
      ).to.be.revertedWith("ShieldXExecutor: parachain not registered");
    });

    it("should revert when non-router calls executeXcmFill", async function () {
      const { executor, attacker, user1 } = await loadFixture(deployExecutorFixture);
      await expect(
        executor.connect(attacker).executeXcmFill(user1.address, ethers.ZeroAddress, ethers.parseEther("10"))
      ).to.be.revertedWithCustomError(executor, "AccessControlUnauthorizedAccount");
    });
  });
});
