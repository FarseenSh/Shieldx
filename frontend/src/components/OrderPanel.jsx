import { useState } from "react";
import { ethers } from "ethers";
import { TOKEN_PAIRS } from "../utils/contracts.js";

export function OrderPanel({ onCommit, isLoading, isConnected, phase }) {
  const [orderType, setOrderType] = useState(0); // 0=BUY, 1=SELL
  const [pairIndex, setPairIndex] = useState(0);
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [lastHash, setLastHash] = useState(null);

  const pair = TOKEN_PAIRS[pairIndex];
  const disabled = !isConnected || phase !== "commit" || isLoading;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!price || !amount) return;

    const amountWei = ethers.parseEther(amount);
    const priceWei = ethers.parseEther(price);
    const collateral = ethers.parseEther("0.01");

    const hash = await onCommit(orderType, pair.tokenIn, pair.tokenOut, amountWei, 0, priceWei, collateral);
    if (hash) {
      setLastHash(hash);
      setPrice("");
      setAmount("");
    }
  }

  return (
    <div className="bg-gray-900 rounded-xl p-6 border border-gray-800 relative">
      {phase !== "commit" && (
        <div className="absolute inset-0 bg-gray-900/80 rounded-xl flex items-center justify-center z-10">
          <p className="text-amber-400 font-semibold text-sm">
            {phase === "reveal" ? "Reveal window active" : "Epoch settling..."}
          </p>
        </div>
      )}

      <h3 className="text-lg font-semibold text-white mb-4">Submit Protected Order</h3>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setOrderType(0)}
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${
              orderType === 0 ? "bg-emerald-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            BUY
          </button>
          <button
            type="button"
            onClick={() => setOrderType(1)}
            className={`flex-1 py-2 rounded-lg text-sm font-bold transition ${
              orderType === 1 ? "bg-red-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
            }`}
          >
            SELL
          </button>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Token Pair</label>
          <select
            value={pairIndex}
            onChange={e => setPairIndex(Number(e.target.value))}
            className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm border border-gray-700"
          >
            {TOKEN_PAIRS.map((p, i) => (
              <option key={i} value={i}>{p.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Limit Price</label>
          <input
            type="number"
            step="any"
            value={price}
            onChange={e => setPrice(e.target.value)}
            placeholder="100.0"
            className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm border border-gray-700"
          />
        </div>

        <div>
          <label className="block text-xs text-gray-400 mb-1">Amount</label>
          <input
            type="number"
            step="any"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="10.0"
            className="w-full bg-gray-800 text-white rounded-lg px-3 py-2 text-sm border border-gray-700"
          />
        </div>

        <button
          type="submit"
          disabled={disabled}
          className="w-full py-3 rounded-lg bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-500 transition disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isLoading ? "Submitting..." : "Submit Protected Order"}
        </button>
      </form>

      {lastHash && (
        <div className="mt-4 p-3 bg-gray-800 rounded-lg">
          <p className="text-xs text-gray-400">Commitment Hash</p>
          <p className="text-xs text-emerald-400 font-mono break-all">{lastHash}</p>
        </div>
      )}
    </div>
  );
}
