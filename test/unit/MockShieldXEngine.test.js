const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("MockShieldXEngine", function () {
  async function deployEngineFixture() {
    const MockShieldXEngine = await ethers.getContractFactory("MockShieldXEngine");
    const engine = await MockShieldXEngine.deploy();
    await engine.waitForDeployment();
    return { engine };
  }

  // Helper to create an order struct
  function makeOrder(orderType, amountIn, maxPrice, tokenIn, tokenOut) {
    return {
      orderType: orderType, // 0 = BUY, 1 = SELL
      tokenIn: tokenIn || ethers.ZeroAddress,
      tokenOut: tokenOut || "0x0000000000000000000000000000000000000001",
      amountIn: amountIn,
      minAmountOut: 0,
      maxPrice: maxPrice,
    };
  }

  const BUY = 0;
  const SELL = 1;
  const E18 = ethers.parseEther("1");

  describe("computeBatchAuction", function () {
    it("should compute clearing price for 3 buys and 3 sells", async function () {
      const { engine } = await loadFixture(deployEngineFixture);

      const buys = [
        makeOrder(BUY, ethers.parseEther("10"), ethers.parseEther("110")),
        makeOrder(BUY, ethers.parseEther("20"), ethers.parseEther("105")),
        makeOrder(BUY, ethers.parseEther("15"), ethers.parseEther("100")),
      ];

      const sells = [
        makeOrder(SELL, ethers.parseEther("10"), ethers.parseEther("95")),
        makeOrder(SELL, ethers.parseEther("20"), ethers.parseEther("100")),
        makeOrder(SELL, ethers.parseEther("15"), ethers.parseEther("108")),
      ];

      const result = await engine.computeBatchAuction(buys, sells);
      // Clearing price should be between buy and sell crossing points
      expect(result.clearingPrice).to.be.gt(0);
      expect(result.totalBuyFill).to.be.gt(0);
      expect(result.totalSellFill).to.be.gt(0);
    });

    it("should return zero for empty batch (no buys, no sells)", async function () {
      const { engine } = await loadFixture(deployEngineFixture);
      const result = await engine.computeBatchAuction([], []);
      expect(result.clearingPrice).to.equal(0);
      expect(result.totalBuyFill).to.equal(0);
      expect(result.totalSellFill).to.equal(0);
    });

    it("should handle only buy orders with no sells", async function () {
      const { engine } = await loadFixture(deployEngineFixture);
      const buys = [
        makeOrder(BUY, ethers.parseEther("10"), ethers.parseEther("100")),
        makeOrder(BUY, ethers.parseEther("20"), ethers.parseEther("110")),
      ];
      const result = await engine.computeBatchAuction(buys, []);
      // Clearing price should be best bid (110)
      expect(result.clearingPrice).to.equal(ethers.parseEther("110"));
      expect(result.totalBuyFill).to.equal(0);
      expect(result.totalSellFill).to.equal(0);
    });

    it("should handle only sell orders with no buys", async function () {
      const { engine } = await loadFixture(deployEngineFixture);
      const sells = [
        makeOrder(SELL, ethers.parseEther("10"), ethers.parseEther("100")),
        makeOrder(SELL, ethers.parseEther("20"), ethers.parseEther("90")),
      ];
      const result = await engine.computeBatchAuction([], sells);
      // Clearing price should be best ask (90)
      expect(result.clearingPrice).to.equal(ethers.parseEther("90"));
    });

    it("should handle single matching buy and sell", async function () {
      const { engine } = await loadFixture(deployEngineFixture);
      const buys = [makeOrder(BUY, ethers.parseEther("10"), ethers.parseEther("100"))];
      const sells = [makeOrder(SELL, ethers.parseEther("10"), ethers.parseEther("90"))];

      const result = await engine.computeBatchAuction(buys, sells);
      // Clearing price = (100 + 90) / 2 = 95
      expect(result.clearingPrice).to.equal(ethers.parseEther("95"));
      expect(result.totalBuyFill).to.equal(ethers.parseEther("10"));
      expect(result.totalSellFill).to.equal(ethers.parseEther("10"));
    });

    it("should return midpoint fallback when no crossing exists", async function () {
      const { engine } = await loadFixture(deployEngineFixture);
      // Best bid (50) < best ask (100) — no crossing
      const buys = [makeOrder(BUY, ethers.parseEther("10"), ethers.parseEther("50"))];
      const sells = [makeOrder(SELL, ethers.parseEther("10"), ethers.parseEther("100"))];

      const result = await engine.computeBatchAuction(buys, sells);
      // Midpoint fallback = (50 + 100) / 2 = 75
      expect(result.clearingPrice).to.equal(ethers.parseEther("75"));
    });

    it("should fill only matching orders in partial crossing", async function () {
      const { engine } = await loadFixture(deployEngineFixture);

      // Buy at 110 crosses with sell at 90, buy at 80 does not cross
      const buys = [
        makeOrder(BUY, ethers.parseEther("10"), ethers.parseEther("110")),
        makeOrder(BUY, ethers.parseEther("5"), ethers.parseEther("80")),
      ];
      const sells = [
        makeOrder(SELL, ethers.parseEther("10"), ethers.parseEther("90")),
        makeOrder(SELL, ethers.parseEther("5"), ethers.parseEther("120")),
      ];

      const result = await engine.computeBatchAuction(buys, sells);
      // Clearing = (110+90)/2 = 100. Buy at 110 fills, buy at 80 does not.
      // Sell at 90 fills, sell at 120 does not.
      expect(result.clearingPrice).to.equal(ethers.parseEther("100"));
      expect(result.buyFills[0]).to.equal(ethers.parseEther("10")); // buy at 110
      expect(result.buyFills[1]).to.equal(0); // buy at 80 < clearing
      expect(result.sellFills[0]).to.equal(ethers.parseEther("10")); // sell at 90
      expect(result.sellFills[1]).to.equal(0); // sell at 120 > clearing
    });

    it("should handle equal buy and sell prices", async function () {
      const { engine } = await loadFixture(deployEngineFixture);
      const buys = [makeOrder(BUY, ethers.parseEther("10"), ethers.parseEther("100"))];
      const sells = [makeOrder(SELL, ethers.parseEther("10"), ethers.parseEther("100"))];

      const result = await engine.computeBatchAuction(buys, sells);
      expect(result.clearingPrice).to.equal(ethers.parseEther("100"));
      expect(result.totalBuyFill).to.equal(ethers.parseEther("10"));
      expect(result.totalSellFill).to.equal(ethers.parseEther("10"));
    });

    it("should correctly track original indices after sorting", async function () {
      const { engine } = await loadFixture(deployEngineFixture);

      // Buys in non-sorted order: indices [0]=90, [1]=110, [2]=100
      const buys = [
        makeOrder(BUY, ethers.parseEther("5"), ethers.parseEther("90")),
        makeOrder(BUY, ethers.parseEther("10"), ethers.parseEther("110")),
        makeOrder(BUY, ethers.parseEther("8"), ethers.parseEther("100")),
      ];
      const sells = [
        makeOrder(SELL, ethers.parseEther("10"), ethers.parseEther("85")),
      ];

      const result = await engine.computeBatchAuction(buys, sells);
      // All buys should cross (clearing ~97.5). Verify fills map to original indices.
      expect(result.buyFills[1]).to.equal(ethers.parseEther("10")); // was 110
      expect(result.buyFills[2]).to.equal(ethers.parseEther("8"));  // was 100
    });

    it("should handle many buys with few sells", async function () {
      const { engine } = await loadFixture(deployEngineFixture);

      const buys = [
        makeOrder(BUY, ethers.parseEther("5"), ethers.parseEther("120")),
        makeOrder(BUY, ethers.parseEther("5"), ethers.parseEther("115")),
        makeOrder(BUY, ethers.parseEther("5"), ethers.parseEther("110")),
        makeOrder(BUY, ethers.parseEther("5"), ethers.parseEther("105")),
        makeOrder(BUY, ethers.parseEther("5"), ethers.parseEther("100")),
      ];
      const sells = [
        makeOrder(SELL, ethers.parseEther("10"), ethers.parseEther("95")),
      ];

      const result = await engine.computeBatchAuction(buys, sells);
      expect(result.clearingPrice).to.be.gt(0);
      expect(result.totalBuyFill).to.be.gt(0);
      expect(result.totalSellFill).to.equal(ethers.parseEther("10"));
    });

    it("should handle large price values", async function () {
      const { engine } = await loadFixture(deployEngineFixture);
      const largePrice = ethers.parseEther("1000000");
      const buys = [makeOrder(BUY, ethers.parseEther("100"), largePrice)];
      const sells = [makeOrder(SELL, ethers.parseEther("100"), ethers.parseEther("999000"))];

      const result = await engine.computeBatchAuction(buys, sells);
      expect(result.clearingPrice).to.be.gt(0);
      expect(result.totalBuyFill).to.equal(ethers.parseEther("100"));
    });
  });

  describe("detectManipulation", function () {
    it("should detect wash trading (score 70, type 1)", async function () {
      const { engine } = await loadFixture(deployEngineFixture);

      const tokenA = "0x0000000000000000000000000000000000000001";
      const tokenB = "0x0000000000000000000000000000000000000002";

      // Wash trading: matching buy/sell pairs with same tokens reversed and similar amounts
      const orders = [
        makeOrder(BUY, ethers.parseEther("100"), ethers.parseEther("100"), tokenA, tokenB),
        makeOrder(SELL, ethers.parseEther("100"), ethers.parseEther("95"), tokenB, tokenA),
        makeOrder(BUY, ethers.parseEther("100"), ethers.parseEther("100"), tokenA, tokenB),
        makeOrder(SELL, ethers.parseEther("100"), ethers.parseEther("95"), tokenB, tokenA),
      ];

      const result = await engine.detectManipulation(orders, ethers.parseEther("100"));
      expect(result.isManipulated).to.be.true;
      expect(result.manipulationScore).to.equal(70);
      expect(result.manipulationType).to.equal(1);
    });

    it("should detect spoofing (score 60, type 2)", async function () {
      const { engine } = await loadFixture(deployEngineFixture);

      // Spoofing: single order dominates >50% of total volume
      const orders = [
        makeOrder(BUY, ethers.parseEther("100"), ethers.parseEther("100")),
        makeOrder(BUY, ethers.parseEther("10"), ethers.parseEther("95")),
        makeOrder(SELL, ethers.parseEther("10"), ethers.parseEther("90")),
      ];

      const result = await engine.detectManipulation(orders, ethers.parseEther("100"));
      // First order is 100/120 = 83% of volume
      expect(result.isManipulated).to.be.true;
      expect(result.manipulationScore).to.equal(60);
      expect(result.manipulationType).to.equal(2);
    });

    it("should detect market impact (score 50, type 3)", async function () {
      const { engine } = await loadFixture(deployEngineFixture);

      // Market impact: order price deviates >10% from clearing price
      const orders = [
        makeOrder(BUY, ethers.parseEther("10"), ethers.parseEther("120")),  // 20% deviation
        makeOrder(BUY, ethers.parseEther("10"), ethers.parseEther("100")),
        makeOrder(SELL, ethers.parseEther("10"), ethers.parseEther("100")),
      ];

      const result = await engine.detectManipulation(orders, ethers.parseEther("100"));
      expect(result.manipulationScore).to.equal(50);
      expect(result.manipulationType).to.equal(3);
    });

    it("should return clean for normal batch", async function () {
      const { engine } = await loadFixture(deployEngineFixture);

      // Normal orders — no manipulation patterns
      const orders = [
        makeOrder(BUY, ethers.parseEther("10"), ethers.parseEther("102")),
        makeOrder(BUY, ethers.parseEther("10"), ethers.parseEther("101")),
        makeOrder(SELL, ethers.parseEther("10"), ethers.parseEther("99")),
      ];

      const result = await engine.detectManipulation(orders, ethers.parseEther("100"));
      expect(result.isManipulated).to.be.false;
      expect(result.manipulationScore).to.equal(0);
      expect(result.manipulationType).to.equal(0);
    });

    it("should return clean for fewer than 3 orders", async function () {
      const { engine } = await loadFixture(deployEngineFixture);

      const orders = [
        makeOrder(BUY, ethers.parseEther("10"), ethers.parseEther("100")),
        makeOrder(SELL, ethers.parseEther("10"), ethers.parseEther("90")),
      ];

      const result = await engine.detectManipulation(orders, ethers.parseEther("95"));
      expect(result.isManipulated).to.be.false;
      expect(result.manipulationScore).to.equal(0);
    });

    it("should return clean for empty orders", async function () {
      const { engine } = await loadFixture(deployEngineFixture);
      const result = await engine.detectManipulation([], ethers.parseEther("100"));
      expect(result.isManipulated).to.be.false;
    });

    it("should prioritize wash trading over spoofing", async function () {
      const { engine } = await loadFixture(deployEngineFixture);

      const tokenA = "0x0000000000000000000000000000000000000001";
      const tokenB = "0x0000000000000000000000000000000000000002";

      // Both wash trading AND spoofing patterns present
      const orders = [
        makeOrder(BUY, ethers.parseEther("200"), ethers.parseEther("100"), tokenA, tokenB),
        makeOrder(SELL, ethers.parseEther("200"), ethers.parseEther("95"), tokenB, tokenA),
        makeOrder(BUY, ethers.parseEther("10"), ethers.parseEther("100"), tokenA, tokenB),
      ];

      const result = await engine.detectManipulation(orders, ethers.parseEther("100"));
      // Should return wash trading (higher severity) not spoofing
      expect(result.manipulationType).to.equal(1);
      expect(result.manipulationScore).to.equal(70);
    });
  });

  describe("computeTWAP", function () {
    it("should compute TWAP with equal weights", async function () {
      const { engine } = await loadFixture(deployEngineFixture);
      const prices = [
        ethers.parseEther("100"),
        ethers.parseEther("110"),
        ethers.parseEther("120"),
      ];
      const weights = [E18, E18, E18];

      const twap = await engine.computeTWAP(prices, weights);
      // (100 + 110 + 120) / 3 = 110
      expect(twap).to.equal(ethers.parseEther("110"));
    });

    it("should compute TWAP with unequal weights", async function () {
      const { engine } = await loadFixture(deployEngineFixture);
      const prices = [ethers.parseEther("100"), ethers.parseEther("200")];
      const weights = [ethers.parseEther("3"), ethers.parseEther("1")];

      const twap = await engine.computeTWAP(prices, weights);
      // (100*3 + 200*1) / (3+1) = 500/4 = 125
      expect(twap).to.equal(ethers.parseEther("125"));
    });

    it("should return 0 for zero total weight", async function () {
      const { engine } = await loadFixture(deployEngineFixture);
      const prices = [ethers.parseEther("100"), ethers.parseEther("200")];
      const weights = [0, 0];

      const twap = await engine.computeTWAP(prices, weights);
      expect(twap).to.equal(0);
    });

    it("should handle single observation", async function () {
      const { engine } = await loadFixture(deployEngineFixture);
      const twap = await engine.computeTWAP(
        [ethers.parseEther("42")],
        [E18]
      );
      expect(twap).to.equal(ethers.parseEther("42"));
    });

    it("should return 0 for empty arrays", async function () {
      const { engine } = await loadFixture(deployEngineFixture);
      const twap = await engine.computeTWAP([], []);
      expect(twap).to.equal(0);
    });

    it("should handle large values without overflow", async function () {
      const { engine } = await loadFixture(deployEngineFixture);
      const prices = [ethers.parseEther("1000000"), ethers.parseEther("2000000")];
      const weights = [ethers.parseEther("1"), ethers.parseEther("1")];

      const twap = await engine.computeTWAP(prices, weights);
      expect(twap).to.equal(ethers.parseEther("1500000"));
    });

    it("should revert when prices and weights length mismatch", async function () {
      const { engine } = await loadFixture(deployEngineFixture);
      await expect(
        engine.computeTWAP([ethers.parseEther("100")], [E18, E18])
      ).to.be.revertedWith("MockShieldXEngine: prices and weights length mismatch");
    });

    it("should ignore zero-weighted observations", async function () {
      const { engine } = await loadFixture(deployEngineFixture);
      const prices = [ethers.parseEther("100"), ethers.parseEther("999"), ethers.parseEther("200")];
      const weights = [E18, 0, E18];

      const twap = await engine.computeTWAP(prices, weights);
      // Zero weight on price 999 means it's ignored: (100*1 + 200*1) / 2 = 150
      expect(twap).to.equal(ethers.parseEther("150"));
    });
  });
});
