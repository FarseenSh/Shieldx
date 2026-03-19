import { ethers } from "ethers";
import { useTheme } from "../utils/theme.js";

export function BatchVisualizer({ epoch }) {
  const { isDark, bg, border, text, textMuted } = useTheme();

  if (!epoch || !epoch.settled) {
    return (
      <div className={`rounded-xl py-8 border text-center ${bg} ${border}`}>
        <p className={`text-sm ${textMuted}`}>Waiting for settlement</p>
      </div>
    );
  }

  const price = epoch.clearingPrice ? parseFloat(ethers.formatEther(epoch.clearingPrice)).toFixed(2) : "0";

  return (
    <div className={`rounded-xl p-5 border ${bg} ${border}`}>
      <div className="flex items-baseline justify-between">
        <span className={`text-sm font-medium ${text}`}>Settled</span>
        <span className="text-sm font-mono text-emerald-500">{price}</span>
      </div>
      <p className={`text-xs mt-1 ${textMuted}`}>
        {epoch.totalRevealed || 0} of {epoch.totalCommitments || 0} filled
      </p>
    </div>
  );
}
