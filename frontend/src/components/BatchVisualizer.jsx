import { ethers } from "ethers";
import { useTheme } from "../utils/theme.js";

export function BatchVisualizer({ epoch }) {
  const { isDark, bg, border, text, textMuted } = useTheme();

  if (!epoch || !epoch.settled) {
    return (
      <div className={`rounded-xl p-8 border text-center ${bg} ${border}`}>
        <div className={`w-12 h-12 mx-auto mb-3 rounded-full flex items-center justify-center ${isDark ? "bg-gray-800" : "bg-gray-100"}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6b7280" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 6V12L16 14"/></svg>
        </div>
        <p className={`text-sm ${textMuted}`}>Waiting for epoch settlement...</p>
        <p className={`text-[11px] mt-1 ${isDark ? "text-gray-600" : "text-gray-400"}`}>Orders will be batch-settled at a uniform clearing price</p>
      </div>
    );
  }

  const clearingPrice = epoch.clearingPrice ? parseFloat(ethers.formatEther(epoch.clearingPrice)).toFixed(2) : "0";
  const totalOrders = epoch.totalCommitments || 0;
  const filledOrders = epoch.totalRevealed || 0;

  return (
    <div className={`rounded-xl border overflow-hidden ${bg} ${border}`}>
      <div className={`px-5 py-3 border-b flex items-center justify-between ${border}`}>
        <h3 className={`text-sm font-semibold ${text}`}>Batch Settlement</h3>
        <span className="text-[10px] text-emerald-400 font-medium bg-emerald-500/10 px-2 py-0.5 rounded">SETTLED</span>
      </div>
      <div className="p-5">
        <div className={`relative h-40 rounded-lg overflow-hidden mb-4 ${isDark ? "bg-gray-800/40" : "bg-gray-100"}`}>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="flex gap-2 flex-wrap justify-center p-4">
              {Array.from({ length: Math.min(filledOrders, 12) }).map((_, i) => (
                <div key={i} className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shadow-lg ${i % 2 === 0 ? "bg-emerald-500/70 text-white" : "bg-rose-500/70 text-white"}`}>{i % 2 === 0 ? "B" : "S"}</div>
              ))}
            </div>
          </div>
          <div className="absolute left-4 right-4 top-1/2 -translate-y-px">
            <div className="border-t-2 border-dashed border-yellow-400/70"></div>
            <span className={`absolute -top-5 right-0 text-[10px] text-yellow-500 font-mono px-1.5 py-0.5 rounded ${isDark ? "bg-gray-900/80" : "bg-white/80"}`}>{clearingPrice}</span>
          </div>
        </div>
        <p className={`text-center text-sm ${isDark ? "text-gray-300" : "text-gray-600"}`}>
          <span className="text-emerald-500 font-bold">{filledOrders}</span> of <span className={`font-bold ${text}`}>{totalOrders}</span> orders filled at <span className="text-yellow-500 font-bold font-mono">{clearingPrice}</span>
        </p>
      </div>
    </div>
  );
}
