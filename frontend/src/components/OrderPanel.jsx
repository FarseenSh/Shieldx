import { useState } from "react";
import { ethers } from "ethers";
import { TOKEN_PAIRS } from "../utils/contracts.js";
import { useTheme } from "../utils/theme.js";

const STATUS_STEPS = ["Committed", "Reveal Window", "Revealed", "Settled"];

export function OrderPanel({ onCommit, isLoading, isConnected, phase, savedAmount, lastSettled }) {
  const { isDark, bg, border, text, textMuted, bgInput } = useTheme();
  const [orderType, setOrderType] = useState(0);
  const [pairIndex, setPairIndex] = useState(0);
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [lastHash, setLastHash] = useState(null);
  const [orderStatus, setOrderStatus] = useState(-1);
  const [errors, setErrors] = useState({});

  const pair = TOKEN_PAIRS[pairIndex];
  const disabled = !isConnected || phase !== "commit" || isLoading;

  function validate() {
    const e = {};
    if (!price || parseFloat(price) <= 0) e.price = "Enter a valid price";
    if (!amount || parseFloat(amount) <= 0) e.amount = "Enter a valid amount";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!validate()) return;
    const amountWei = ethers.parseEther(amount);
    const priceWei = ethers.parseEther(price);
    const collateral = ethers.parseEther("0.01");
    const hash = await onCommit(orderType, pair.tokenIn, pair.tokenOut, amountWei, 0, priceWei, collateral);
    if (hash) { setLastHash(hash); setOrderStatus(0); setPrice(""); setAmount(""); setErrors({}); }
  }

  const inputCls = `w-full rounded-lg px-3 py-2.5 text-sm border focus:outline-none transition-colors ${bgInput} ${isDark ? "text-white" : "text-gray-900"}`;
  const inputBorder = (err) => err ? "border-red-500 focus:border-red-400" : (isDark ? "border-gray-700/50 focus:border-emerald-600" : "border-gray-300 focus:border-emerald-500");

  return (
    <div className={`rounded-xl p-5 border relative ${bg} ${border}`}>
      {phase !== "commit" && !lastHash && (
        <div className={`absolute inset-0 rounded-xl flex items-center justify-center z-10 ${isDark ? "bg-slate-950/85" : "bg-white/85"}`} style={{ backdropFilter: "blur(4px)" }}>
          <div className="text-center">
            <p className="text-amber-500 font-semibold text-sm">{phase === "reveal" ? "Reveal window active" : "Epoch settling..."}</p>
            <p className={`text-xs mt-1 ${textMuted}`}>New orders accepted in next epoch</p>
          </div>
        </div>
      )}

      <h3 className={`text-base font-semibold mb-4 ${text}`}>Submit Protected Order</h3>

      <form onSubmit={handleSubmit} className="space-y-3.5">
        <div className={`flex gap-1.5 p-1 rounded-lg ${isDark ? "bg-gray-800/50" : "bg-gray-100"}`}>
          <button type="button" onClick={() => setOrderType(0)} className={`flex-1 py-2 rounded-md text-sm font-bold transition-all duration-150 ${orderType === 0 ? "bg-emerald-600 text-white shadow-md" : (isDark ? "text-gray-400 hover:text-gray-300" : "text-gray-500 hover:text-gray-700")}`}>BUY</button>
          <button type="button" onClick={() => setOrderType(1)} className={`flex-1 py-2 rounded-md text-sm font-bold transition-all duration-150 ${orderType === 1 ? "bg-red-600 text-white shadow-md" : (isDark ? "text-gray-400 hover:text-gray-300" : "text-gray-500 hover:text-gray-700")}`}>SELL</button>
        </div>

        <div>
          <label className={`block text-[11px] mb-1 font-medium ${textMuted}`}>Token Pair</label>
          <select value={pairIndex} onChange={e => setPairIndex(Number(e.target.value))} className={`${inputCls} ${inputBorder()} appearance-none cursor-pointer`} style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center" }}>
            {TOKEN_PAIRS.map((p, i) => <option key={i} value={i}>{p.label}</option>)}
          </select>
        </div>

        <div>
          <label className={`block text-[11px] mb-1 font-medium ${textMuted}`}>Limit Price</label>
          <input type="number" step="any" value={price} onChange={e => { setPrice(e.target.value); setErrors(prev => ({...prev, price: null})); }} placeholder="100.0" className={`${inputCls} ${inputBorder(errors.price)}`} />
          {errors.price && <p className="text-[11px] text-red-500 mt-1">{errors.price}</p>}
        </div>

        <div>
          <label className={`block text-[11px] mb-1 font-medium ${textMuted}`}>Amount</label>
          <input type="number" step="any" value={amount} onChange={e => { setAmount(e.target.value); setErrors(prev => ({...prev, amount: null})); }} placeholder="10.0" className={`${inputCls} ${inputBorder(errors.amount)}`} />
          {errors.amount && <p className="text-[11px] text-red-500 mt-1">{errors.amount}</p>}
        </div>

        <div className={`flex justify-between text-[11px] ${textMuted}`}>
          <span>Est. gas: ~0.002 PAS</span>
          <span>Collateral: 0.01 PAS <span className={isDark ? "text-gray-600" : "text-gray-300"}>(returned after settlement)</span></span>
        </div>

        <button type="submit" disabled={disabled} className="w-full py-3 rounded-lg bg-emerald-600 text-white font-bold text-sm hover:bg-emerald-500 active:scale-[0.98] transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2">
          {isLoading ? "Submitting..." : "Submit Protected Order"}
        </button>
      </form>

      {savedAmount && parseFloat(savedAmount) > 0 && (
        <div className={`mt-4 p-4 rounded-lg border ${isDark ? "bg-emerald-950/40 border-emerald-700/50" : "bg-emerald-50 border-emerald-200"}`}>
          <span className="text-sm font-bold text-emerald-500">MEV Protected!</span>
          <p className={`text-sm ${isDark ? "text-emerald-300/80" : "text-emerald-700"}`}>You saved <span className={`font-bold ${text}`}>{parseFloat(savedAmount).toFixed(4)} PAS</span></p>
        </div>
      )}

      {lastSettled && !lastHash && (
        <div className={`mt-4 p-4 rounded-lg border ${isDark ? "bg-emerald-950/30 border-emerald-800/40" : "bg-emerald-50 border-emerald-200"}`}>
          <p className="text-sm font-semibold text-emerald-500">Epoch #{lastSettled.epochId} Settled</p>
          <p className={`text-[11px] mt-1 ${textMuted}`}>Clearing price: <span className={`font-mono font-bold ${text}`}>{lastSettled.clearingPrice}</span></p>
          {lastSettled.matchedOrders > 0 && <p className={`text-[11px] ${textMuted}`}>{lastSettled.matchedOrders} orders filled</p>}
        </div>
      )}

      {lastHash && (
        <div className={`mt-3 p-3 rounded-lg border ${isDark ? "bg-gray-800/50 border-gray-700/30" : "bg-gray-50 border-gray-200"}`}>
          <p className={`text-[11px] mb-1 ${textMuted}`}>Commitment Hash</p>
          <p className="text-[11px] text-emerald-500 font-mono break-all leading-relaxed">{lastHash}</p>
          <p className={`text-[11px] mt-1 ${textMuted}`}>
            {phase === "commit" ? "Waiting for epoch to end..." : phase === "reveal" ? "Revealing order..." : "Settlement pending..."}
          </p>
          {orderStatus >= 0 && (
            <div className="flex items-center gap-1 mt-2.5">
              {STATUS_STEPS.map((s, i) => (
                <div key={i} className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${i <= orderStatus ? "bg-emerald-500" : (isDark ? "bg-gray-700" : "bg-gray-300")}`}></span>
                  <span className={`text-[9px] ${i <= orderStatus ? "text-emerald-500" : textMuted}`}>{s}</span>
                  {i < STATUS_STEPS.length - 1 && <span className={`text-[9px] mx-0.5 ${textMuted}`}>&mdash;</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
