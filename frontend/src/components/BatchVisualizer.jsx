import { ethers } from "ethers";

export function BatchVisualizer({ epoch }) {
  if (!epoch || !epoch.settled) {
    return (
      <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 text-center">
        <p className="text-gray-500 text-sm">Waiting for epoch settlement...</p>
      </div>
    );
  }

  const clearingPrice = epoch.clearingPrice
    ? parseFloat(ethers.formatEther(epoch.clearingPrice)).toFixed(2)
    : "0";

  const totalOrders = epoch.totalCommitments || 0;
  const filledOrders = epoch.totalRevealed || 0;

  return (
    <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
      <h3 className="text-lg font-semibold text-white mb-4">Batch Settlement</h3>

      <div className="relative h-48 bg-gray-800 rounded-lg overflow-hidden mb-4">
        {/* Order dots */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="flex gap-3 flex-wrap justify-center p-4">
            {Array.from({ length: Math.min(filledOrders, 10) }).map((_, i) => (
              <div
                key={i}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shadow-lg ${
                  i % 2 === 0
                    ? "bg-emerald-500/80 text-white shadow-emerald-500/30"
                    : "bg-red-500/80 text-white shadow-red-500/30"
                }`}
              >
                {i % 2 === 0 ? "B" : "S"}
              </div>
            ))}
          </div>
        </div>

        {/* Clearing price line */}
        <div className="absolute left-0 right-0 top-1/2 border-t-2 border-dashed border-yellow-400">
          <span className="absolute -top-5 right-2 text-xs text-yellow-400 font-mono">
            Price: {clearingPrice}
          </span>
        </div>
      </div>

      <div className="text-center">
        <p className="text-sm text-gray-300">
          <span className="text-emerald-400 font-bold">{filledOrders}</span> of{" "}
          <span className="text-white font-bold">{totalOrders}</span> orders filled at price{" "}
          <span className="text-yellow-400 font-bold">{clearingPrice}</span>
        </p>
      </div>
    </div>
  );
}
