const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("ShieldXSettlement", function () {
  const BUY = 0;
  const SELL = 1;

  function makeOrder(orderType, amountIn, maxPrice) {
    return {
      orderType: orderType,
      tokenIn: ethers.ZeroAddress,
      tokenOut: "0x0000000000000000000000000000000000000001",
      amountIn: amountIn,
      minAmountOut: 0,
      maxPrice: maxPrice,
    };
  }

  async function deploySettlementFixture() {
    const [deployer, attacker, user1] = await ethers.getSigners();

    const MockShieldXEngine = await ethers.getContractFactory("MockShieldXEngine");
    const engine = await MockShieldXEngine.deploy();
    await engine.waitForDeployment();

    const ShieldXSettlement = await ethers.getContractFactory("ShieldXSettlement");
    const settlement = await ShieldXSettlement.deploy(await engine.getAddress());
    await settlement.waitForDeployment();

    return { settlement, engine, deployer, attacker, user1 };
  }

  describe("constructor", function () {
    it("should set engine address correctly", async function () {
      const { settlement, engine } = await loadFixture(deploySettlementFixture);
      expect(await settlement.engineAddress()).to.equal(await engine.getAddress());
    });

    it("should grant deployer DEFAULT_ADMIN_ROLE and ROUTER_ROLE", async function () {
      const { settlement, deployer } = await loadFixture(deploySettlementFixture);
      const ROUTER_ROLE = await settlement.ROUTER_ROLE();
      expect(await settlement.hasRole(ROUTER_ROLE, deployer.address)).to.be.true;
      expect(await settlement.hasRole(await settlement.DEFAULT_ADMIN_ROLE(), deployer.address)).to.be.true;
    });

    it("should revert when engine is zero address", async function () {
      const ShieldXSettlement = await ethers.getContractFactory("ShieldXSettlement");
      await expect(
        ShieldXSettlement.deploy(ethers.ZeroAddress)
      ).to.be.revertedWith("ShieldXSettlement: engine cannot be zero address");
    });
  });

  describe("computeBatchSettlement", function () {
    it("should compute clearing price for matching orders", async function () {
      const { settlement } = await loadFixture(deploySettlementFixture);

      const buys = [makeOrder(BUY, ethers.parseEther("10"), ethers.parseEther("100"))];
      const sells = [makeOrder(SELL, ethers.parseEther("10"), ethers.parseEther("90"))];

      const result = await settlement.computeBatchSettlement.staticCall(buys, sells);
      expect(result.clearingPrice).to.equal(ethers.parseEther("95"));
      expect(result.totalBuyFill).to.equal(ethers.parseEther("10"));
      expect(result.totalSellFill).to.equal(ethers.parseEther("10"));
    });

    it("should emit BatchSettled event", async function () {
      const { settlement } = await loadFixture(deploySettlementFixture);

      const buys = [makeOrder(BUY, ethers.parseEther("10"), ethers.parseEther("100"))];
      const sells = [makeOrder(SELL, ethers.parseEther("10"), ethers.parseEther("90"))];

      await expect(settlement.computeBatchSettlement(buys, sells))
        .to.emit(settlement, "BatchSettled")
        .withArgs(ethers.parseEther("95"), 1, 1);
    });

    it("should handle empty buy array", async function () {
      const { settlement } = await loadFixture(deploySettlementFixture);

      const sells = [makeOrder(SELL, ethers.parseEther("10"), ethers.parseEther("90"))];
      const result = await settlement.computeBatchSettlement.staticCall([], sells);
      expect(result.clearingPrice).to.equal(ethers.parseEther("90"));
    });

    it("should handle empty sell array", async function () {
      const { settlement } = await loadFixture(deploySettlementFixture);

      const buys = [makeOrder(BUY, ethers.parseEther("10"), ethers.parseEther("100"))];
      const result = await settlement.computeBatchSettlement.staticCall(buys, []);
      expect(result.clearingPrice).to.equal(ethers.parseEther("100"));
    });

    it("should handle multiple orders with correct fills", async function () {
      const { settlement } = await loadFixture(deploySettlementFixture);

      const buys = [
        makeOrder(BUY, ethers.parseEther("10"), ethers.parseEther("110")),
        makeOrder(BUY, ethers.parseEther("5"), ethers.parseEther("100")),
      ];
      const sells = [
        makeOrder(SELL, ethers.parseEther("10"), ethers.parseEther("90")),
        makeOrder(SELL, ethers.parseEther("5"), ethers.parseEther("95")),
      ];

      const result = await settlement.computeBatchSettlement.staticCall(buys, sells);
      expect(result.clearingPrice).to.be.gt(0);
      expect(result.totalBuyFill).to.be.gt(0);
      expect(result.totalSellFill).to.be.gt(0);
    });

    it("should revert when non-router calls computeBatchSettlement", async function () {
      const { settlement, attacker } = await loadFixture(deploySettlementFixture);

      const buys = [makeOrder(BUY, ethers.parseEther("10"), ethers.parseEther("100"))];
      const sells = [makeOrder(SELL, ethers.parseEther("10"), ethers.parseEther("90"))];

      await expect(
        settlement.connect(attacker).computeBatchSettlement(buys, sells)
      ).to.be.revertedWithCustomError(settlement, "AccessControlUnauthorizedAccount");
    });
  });

  describe("executeFill", function () {
    it("should emit FillExecuted event", async function () {
      const { settlement, user1 } = await loadFixture(deploySettlementFixture);
      const tokenOut = "0x0000000000000000000000000000000000000001";

      await expect(
        settlement.executeFill(user1.address, tokenOut, ethers.parseEther("100"), ethers.parseEther("10"))
      ).to.emit(settlement, "FillExecuted")
        .withArgs(user1.address, tokenOut, ethers.parseEther("100"), ethers.parseEther("10"));
    });

    it("should revert when non-router calls executeFill", async function () {
      const { settlement, attacker, user1 } = await loadFixture(deploySettlementFixture);
      await expect(
        settlement.connect(attacker).executeFill(user1.address, ethers.ZeroAddress, 100, 10)
      ).to.be.revertedWithCustomError(settlement, "AccessControlUnauthorizedAccount");
    });
  });

  describe("setRouter", function () {
    it("should allow admin to grant ROUTER_ROLE via setRouter", async function () {
      const { settlement, user1 } = await loadFixture(deploySettlementFixture);
      await settlement.setRouter(user1.address);
      const ROUTER_ROLE = await settlement.ROUTER_ROLE();
      expect(await settlement.hasRole(ROUTER_ROLE, user1.address)).to.be.true;
    });

    it("should emit RouterUpdated event", async function () {
      const { settlement, user1 } = await loadFixture(deploySettlementFixture);
      await expect(settlement.setRouter(user1.address))
        .to.emit(settlement, "RouterUpdated");
    });

    it("should revert when non-owner calls setRouter", async function () {
      const { settlement, attacker, user1 } = await loadFixture(deploySettlementFixture);
      await expect(
        settlement.connect(attacker).setRouter(user1.address)
      ).to.be.revertedWithCustomError(settlement, "AccessControlUnauthorizedAccount");
    });
  });

  describe("setXcmExecutor", function () {
    it("should allow owner to set xcm executor", async function () {
      const { settlement, user1 } = await loadFixture(deploySettlementFixture);
      await settlement.setXcmExecutor(user1.address);
      expect(await settlement.xcmExecutor()).to.equal(user1.address);
    });

    it("should revert when non-owner calls setXcmExecutor", async function () {
      const { settlement, attacker, user1 } = await loadFixture(deploySettlementFixture);
      await expect(
        settlement.connect(attacker).setXcmExecutor(user1.address)
      ).to.be.revertedWithCustomError(settlement, "AccessControlUnauthorizedAccount");
    });
  });
});
