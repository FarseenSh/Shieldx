import { useState, useCallback } from "react";
import { ethers } from "ethers";
import { ROUTER_ABI, CONTRACT_ADDRESSES } from "../utils/contracts.js";
import { generateCommitment } from "../utils/commitHash.js";

export function useShieldX(signer) {
  const [pendingOrders, setPendingOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

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
      await tx.wait();

      setPendingOrders(prev => [...prev, { commitHash, salt, params, tx: tx.hash }]);
      return commitHash;
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [getRouter]);

  const revealOrder = useCallback(async (commitHash) => {
    const router = getRouter();
    if (!router) { setError("Wallet not connected"); return; }

    const order = pendingOrders.find(o => o.commitHash === commitHash);
    if (!order) { setError("Order not found — salt needed for reveal"); return; }

    setIsLoading(true);
    setError(null);

    try {
      const { params, salt } = order;
      const tx = await router.revealOrder(
        params.orderType, params.tokenIn, params.tokenOut,
        params.amountIn, params.minAmountOut, params.maxPrice, salt
      );
      await tx.wait();

      setPendingOrders(prev => prev.map(o =>
        o.commitHash === commitHash ? { ...o, revealed: true } : o
      ));
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [getRouter, pendingOrders]);

  const settleEpoch = useCallback(async (epochId) => {
    const router = getRouter();
    if (!router) { setError("Wallet not connected"); return; }

    setIsLoading(true);
    setError(null);

    try {
      const tx = await router.settleEpoch(epochId);
      await tx.wait();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [getRouter]);

  return { commitOrder, revealOrder, settleEpoch, pendingOrders, isLoading, error };
}
