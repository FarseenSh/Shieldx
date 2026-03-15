import { useState, useCallback } from "react";
import { ethers } from "ethers";
import { ROUTER_ABI, CONTRACT_ADDRESSES } from "../utils/contracts.js";
import { generateCommitment } from "../utils/commitHash.js";

export function useShieldX(signer, currentEpochId) {
  const [pendingOrders, setPendingOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [savedAmount, setSavedAmount] = useState(null);

  const getRouter = useCallback(() => {
    if (!signer) return null;
    return new ethers.Contract(CONTRACT_ADDRESSES.router, ROUTER_ABI, signer);
  }, [signer]);

  const commitOrder = useCallback(async (orderType, tokenIn, tokenOut, amountIn, minAmountOut, maxPrice, collateral) => {
    const router = getRouter();
    if (!router) { setError("Wallet not connected"); return; }

    setIsLoading(true);
    setError(null);

    try {
      const { commitHash, salt, params } = generateCommitment(
        orderType, tokenIn, tokenOut, amountIn, minAmountOut, maxPrice
      );

      const tx = await router.commitOrder(commitHash, { value: collateral });
      const receipt = await tx.wait();

      setPendingOrders(prev => [...prev, {
        commitHash,
        salt,
        params,
        txHash: tx.hash,
        epochId: currentEpochId || 1,
        status: "committed",
        revealed: false,
        settled: false,
        clearingPrice: null,
        surplus: null,
      }]);
      return commitHash;
    } catch (err) {
      setError(err.reason || err.message);
    } finally {
      setIsLoading(false);
    }
  }, [getRouter, currentEpochId]);

  const revealOrder = useCallback(async (commitHash) => {
    const router = getRouter();
    if (!router) { setError("Wallet not connected"); return; }

    const order = pendingOrders.find(o => o.commitHash === commitHash);
    if (!order) { setError("Order not found"); return; }

    setPendingOrders(prev => prev.map(o =>
      o.commitHash === commitHash ? { ...o, status: "revealing" } : o
    ));

    try {
      const { params, salt } = order;
      const tx = await router.revealOrder(
        params.orderType, params.tokenIn, params.tokenOut,
        params.amountIn, params.minAmountOut, params.maxPrice, salt
      );
      await tx.wait();

      setPendingOrders(prev => prev.map(o =>
        o.commitHash === commitHash ? { ...o, revealed: true, status: "revealed" } : o
      ));
    } catch (err) {
      setPendingOrders(prev => prev.map(o =>
        o.commitHash === commitHash ? { ...o, status: "committed" } : o
      ));
      setError(err.reason || err.message);
    }
  }, [getRouter, pendingOrders]);

  const autoReveal = useCallback(async () => {
    const unrevealed = pendingOrders.filter(o => !o.revealed && o.status === "committed");
    if (unrevealed.length === 0) return;

    for (const order of unrevealed) {
      await revealOrder(order.commitHash);
    }
  }, [pendingOrders, revealOrder]);

  const settleEpoch = useCallback(async (epochId) => {
    const router = getRouter();
    if (!router) { setError("Wallet not connected"); return; }

    setIsLoading(true);
    setError(null);

    try {
      const tx = await router.settleEpoch(epochId);
      await tx.wait();

      // Mark orders in this epoch as settled
      setPendingOrders(prev => prev.map(o =>
        o.epochId === epochId ? { ...o, settled: true, status: "settled" } : o
      ));
    } catch (err) {
      setError(err.reason || err.message);
    } finally {
      setIsLoading(false);
    }
  }, [getRouter]);

  const fetchSurplus = useCallback(async (epochId, account) => {
    const router = getRouter();
    if (!router || !account) return;

    try {
      const surplus = await router.getUserSurplus(epochId, account);
      const formatted = ethers.formatEther(surplus);
      setSavedAmount(formatted);

      // Update order state
      const epoch = await router.getCurrentEpoch();
      setPendingOrders(prev => prev.map(o =>
        o.epochId === epochId ? {
          ...o,
          settled: true,
          status: "settled",
          clearingPrice: ethers.formatEther(epoch.clearingPrice),
          surplus: formatted,
        } : o
      ));
    } catch (err) {
      // Surplus not available yet
    }
  }, [getRouter]);

  return {
    commitOrder,
    revealOrder,
    autoReveal,
    settleEpoch,
    fetchSurplus,
    pendingOrders,
    isLoading,
    error,
    savedAmount,
  };
}
