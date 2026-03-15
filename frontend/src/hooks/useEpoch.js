import { useState, useEffect, useRef } from "react";
import { ethers } from "ethers";
import { ROUTER_ABI, CONTRACT_ADDRESSES } from "../utils/contracts.js";

export function useEpoch(provider) {
  const [epoch, setEpoch] = useState(null);
  const [phase, setPhase] = useState("commit");
  const [timeRemaining, setTimeRemaining] = useState(0);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!provider || CONTRACT_ADDRESSES.router === ethers.ZeroAddress) return;

    const router = new ethers.Contract(CONTRACT_ADDRESSES.router, ROUTER_ABI, provider);

    async function fetchEpoch() {
      try {
        const currentEpoch = await router.getCurrentEpoch();
        const epochDuration = await router.epochDuration();
        const revealWindowDuration = await router.revealWindow();
        const block = await provider.getBlock("latest");
        const now = BigInt(block.timestamp);

        const endTime = currentEpoch.endTime;
        const revealEnd = endTime + revealWindowDuration;

        let currentPhase;
        let remaining;

        if (now <= endTime) {
          currentPhase = "commit";
          remaining = Number(endTime - now);
        } else if (now <= revealEnd) {
          currentPhase = "reveal";
          remaining = Number(revealEnd - now);
        } else {
          currentPhase = "settle";
          remaining = 0;
        }

        setEpoch({
          id: Number(currentEpoch.id),
          startTime: Number(currentEpoch.startTime),
          endTime: Number(endTime),
          totalCommitments: Number(currentEpoch.totalCommitments),
          totalRevealed: Number(currentEpoch.totalRevealed),
          clearingPrice: currentEpoch.clearingPrice,
          settled: currentEpoch.settled,
          duration: Number(epochDuration),
          revealWindow: Number(revealWindowDuration),
        });
        setPhase(currentPhase);
        setTimeRemaining(remaining);
      } catch (err) {
        // Contract not deployed or not connected
      }
    }

    fetchEpoch();
    intervalRef.current = setInterval(fetchEpoch, 5000);

    return () => clearInterval(intervalRef.current);
  }, [provider]);

  return {
    epoch,
    phase,
    timeRemaining,
    isCommitPhase: phase === "commit",
    isRevealPhase: phase === "reveal",
  };
}
