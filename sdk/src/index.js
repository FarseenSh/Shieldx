const { ethers } = require("ethers");
const { ROUTER_ABI, CHAIN_CONFIG } = require("./constants");

/**
 * ShieldX SDK — MEV protection in 3 lines of code.
 *
 * @example
 * const shieldx = new ShieldX(ROUTER_ADDRESS, signer);
 * await shieldx.submitProtectedOrder('BUY', tokenIn, tokenOut, amount, minOut, maxPrice);
 * const savings = await shieldx.getOrderSurplus(epochId);
 */
class ShieldX {
  /**
   * Create a ShieldX SDK instance.
   * @param {string} routerAddress - Deployed ShieldXRouter contract address
   * @param {ethers.Signer} signer - ethers.js Signer (from wallet or provider)
   */
  constructor(routerAddress, signer) {
    this.router = new ethers.Contract(routerAddress, ROUTER_ABI, signer);
    this.signer = signer;
    this.pendingOrders = [];
  }

  /**
   * Submit a MEV-protected order. Generates a random salt, computes the
   * commitment hash, and sends the commit transaction with collateral.
   *
   * @param {'BUY'|'SELL'|0|1} orderType - Order side
   * @param {string} tokenIn - Address of token to sell (use ethers.ZeroAddress for native PAS)
   * @param {string} tokenOut - Address of token to buy
   * @param {string|bigint} amountIn - Amount in wei (18 decimals)
   * @param {string|bigint} minAmountOut - Minimum acceptable output (slippage protection)
   * @param {string|bigint} maxPrice - Limit price in wei
   * @returns {Promise<{commitHash: string, txHash: string}>}
   */
  async submitProtectedOrder(orderType, tokenIn, tokenOut, amountIn, minAmountOut, maxPrice) {
    const type = orderType === "BUY" || orderType === 0 ? 0 : 1;
    const saltBytes = ethers.randomBytes(32);
    const salt = ethers.hexlify(saltBytes);

    const commitHash = ethers.solidityPackedKeccak256(
      ["uint8", "address", "address", "uint256", "uint256", "uint256", "bytes32"],
      [type, tokenIn, tokenOut, amountIn, minAmountOut, maxPrice, salt]
    );

    const minCollateral = await this.router.minCollateral();
    const tx = await this.router.commitOrder(commitHash, { value: minCollateral });
    const receipt = await tx.wait();

    this.pendingOrders.push({
      commitHash,
      salt,
      orderType: type,
      tokenIn,
      tokenOut,
      amountIn,
      minAmountOut,
      maxPrice,
    });

    return { commitHash, txHash: tx.hash };
  }

  /**
   * Reveal all pending orders for the connected wallet.
   * Call this after the epoch transitions to the reveal phase.
   *
   * @returns {Promise<string[]>} Array of transaction hashes
   */
  async revealPendingOrders() {
    const txHashes = [];

    for (const order of this.pendingOrders) {
      const tx = await this.router.revealOrder(
        order.orderType,
        order.tokenIn,
        order.tokenOut,
        order.amountIn,
        order.minAmountOut,
        order.maxPrice,
        order.salt
      );
      await tx.wait();
      txHashes.push(tx.hash);
    }

    this.pendingOrders = [];
    return txHashes;
  }

  /**
   * Get the current epoch status including phase and time remaining.
   *
   * @returns {Promise<{epochId: number, phase: string, timeRemaining: number, totalCommitments: number, settled: boolean}>}
   */
  async getEpochStatus() {
    const epoch = await this.router.getCurrentEpoch();
    const epochDuration = await this.router.epochDuration();
    const revealWindowDuration = await this.router.revealWindow();
    const provider = this.signer.provider;
    const block = await provider.getBlock("latest");
    const now = BigInt(block.timestamp);

    const endTime = epoch.endTime;
    const revealEnd = endTime + revealWindowDuration;

    let phase, timeRemaining;
    if (now <= endTime) {
      phase = "commit";
      timeRemaining = Number(endTime - now);
    } else if (now <= revealEnd) {
      phase = "reveal";
      timeRemaining = Number(revealEnd - now);
    } else {
      phase = "settle";
      timeRemaining = 0;
    }

    return {
      epochId: Number(epoch.id),
      phase,
      timeRemaining,
      totalCommitments: Number(epoch.totalCommitments),
      settled: epoch.settled,
    };
  }

  /**
   * Get MEV surplus saved for the connected wallet in a specific epoch.
   *
   * @param {number} epochId - The epoch to query
   * @returns {Promise<{surplus: string, surplusWei: bigint}>}
   */
  async getOrderSurplus(epochId) {
    const address = await this.signer.getAddress();
    const surplusWei = await this.router.getUserSurplus(epochId, address);
    return {
      surplus: ethers.formatEther(surplusWei),
      surplusWei,
    };
  }

  /**
   * Get cumulative protocol statistics.
   *
   * @returns {Promise<{totalOrders: number, totalVolume: string, totalMEVSaved: string, totalFees: string}>}
   */
  async getProtocolStats() {
    const [orders, volume, mevSaved, fees] = await this.router.getProtocolStats();
    return {
      totalOrders: Number(orders),
      totalVolume: ethers.formatEther(volume),
      totalMEVSaved: ethers.formatEther(mevSaved),
      totalFees: ethers.formatEther(fees),
    };
  }

  /**
   * Listen for epoch settlement events.
   *
   * @param {Function} callback - Called with (epochId, clearingPrice, matchedOrders, totalSurplus)
   * @returns {void}
   */
  onEpochSettled(callback) {
    this.router.on("EpochSettled", (epochId, clearingPrice, buyVol, sellVol, matched, surplus) => {
      callback({
        epochId: Number(epochId),
        clearingPrice: ethers.formatEther(clearingPrice),
        matchedOrders: Number(matched),
        totalSurplus: ethers.formatEther(surplus),
      });
    });
  }

  /**
   * Listen for individual MEV savings events.
   *
   * @param {Function} callback - Called with (epochId, trader, surplus)
   * @returns {void}
   */
  onMEVSaved(callback) {
    this.router.on("MEVSaved", (epochId, trader, surplus) => {
      callback({
        epochId: Number(epochId),
        trader,
        surplus: ethers.formatEther(surplus),
      });
    });
  }

  /**
   * Remove all event listeners.
   */
  removeAllListeners() {
    this.router.removeAllListeners();
  }
}

module.exports = { ShieldX, ROUTER_ABI, CHAIN_CONFIG };
