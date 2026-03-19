import { useState } from "react";
import { ethers } from "ethers";
import { TOKEN_PAIRS } from "../utils/contracts.js";
import { useTheme } from "../utils/theme.js";

export function OrderPanel({ onCommit, isLoading, isConnected, phase, savedAmount, lastSettled }) {
  const { isDark, bg, border, text, textMuted, bgInput } = useTheme();
  const [orderType, setOrderType] = useState(0);
  const [pairIndex, setPairIndex] = useState(0);
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [lastHash, setLastHash] = useState(null);
  const [errors, setErrors] = useState({});

  const pair = TOKEN_PAIRS[pairIndex];
  const disabled = !isConnected || phase === "reveal" || isLoading;

  function validate() {
    const e = {};
    if (!price || parseFloat(price) <= 0) e.price = "Required";
    if (!amount || parseFloat(amount) <= 0) e.amount = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    const hash = await onCommit(orderType, pair.tokenIn, pair.tokenOut, ethers.parseEther(amount), 0, ethers.parseEther(price), ethers.parseEther("0.01"));
    if (hash) { setLastHash(hash); setPrice(""); setAmount(""); setErrors({}); }
  }

  const inputCls = `w-full rounded-lg px-3 py-2.5 text-sm border focus:outline-none transition-colors ${bgInput} ${isDark ? "text-white" : "text-gray-900"}`;
  const inputBorder = (err) => err ? "border-red-500" : (isDark ? "border-gray-700/50 focus:border-emerald-600" : "border-gray-300 focus:border-emerald-500");

  return (
    <div className={`rounded-xl p-5 border relative ${bg} ${border}`}>
      {phase === "reveal" && !lastHash && (
        <div className={`absolute inset-0 rounded-xl flex items-center justify-center z-10 ${isDark ? "bg-slate-950/80" : "bg-white/80"}`} style={{ backdropFilter: "blur(2px)" }}>
          <p className={`text-sm font-medium ${isDark ? "text-gray-400" : "text-gray-500"}`}>
            Reveal window open
          </p>
        </div>
      )}

      <h3 className={`text-sm font-semibold mb-4 ${text}`}>New order</h3>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Buy/Sell */}
        <div className={`flex gap-1 p-0.5 rounded-lg ${isDark ? "bg-gray-800/50" : "bg-gray-100"}`}>
          {["Buy", "Sell"].map((label, i) => (
            <button key={i} type="button" onClick={() => setOrderType(i)}
              className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
                orderType === i
                  ? i === 0 ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
                  : isDark ? "text-gray-500" : "text-gray-400"
              }`}>{label}</button>
          ))}
        </div>

        {/* Pair */}
        <div>
          <label className={`block text-[11px] mb-1 ${textMuted}`}>Pair</label>
          <select value={pairIndex} onChange={e => setPairIndex(Number(e.target.value))}
            className={`${inputCls} ${inputBorder()} appearance-none cursor-pointer`}
            style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}>
            {TOKEN_PAIRS.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
          </select>
        </div>

        {/* Price + Amount side by side */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={`block text-[11px] mb-1 ${textMuted}`}>Price</label>
            <input type="number" step="any" value={price} onChange={e => { setPrice(e.target.value); setErrors(p => ({...p, price: null})); }}
              placeholder="100" className={`${inputCls} ${inputBorder(errors.price)}`} />
          </div>
          <div>
            <label className={`block text-[11px] mb-1 ${textMuted}`}>Amount</label>
            <input type="number" step="any" value={amount} onChange={e => { setAmount(e.target.value); setErrors(p => ({...p, amount: null})); }}
              placeholder="10" className={`${inputCls} ${inputBorder(errors.amount)}`} />
          </div>
        </div>

        <p className={`text-[11px] ${textMuted}`}>0.01 PAS collateral, returned after settlement</p>

        <button type="submit" disabled={disabled}
          className="w-full py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
          {isLoading ? "Submitting..." : "Submit order"}
        </button>
      </form>

      {savedAmount && parseFloat(savedAmount) > 0 && (
        <div className={`mt-4 py-3 px-4 rounded-lg border ${isDark ? "border-emerald-800/40 bg-emerald-950/20" : "border-emerald-200 bg-emerald-50"}`}>
          <p className="text-sm text-emerald-500 font-medium">Saved {parseFloat(savedAmount).toFixed(4)} PAS</p>
        </div>
      )}

      {lastHash && (
        <div className={`mt-3 py-2.5 px-3 rounded-lg ${isDark ? "bg-gray-800/30" : "bg-gray-50"}`}>
          <p className={`text-[11px] ${textMuted}`}>Commitment</p>
          <p className="text-[11px] text-emerald-500 font-mono break-all mt-0.5">{lastHash}</p>
          <p className={`text-[11px] mt-1 ${textMuted}`}>
            {phase === "commit" ? "Waiting for epoch end..." : phase === "reveal" ? "Revealing..." : "Settling..."}
          </p>
        </div>
      )}
    </div>
  );
}
