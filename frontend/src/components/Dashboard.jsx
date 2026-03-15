import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { SandwichDemo } from "./SandwichDemo.jsx";
import { EpochHistory } from "./EpochHistory.jsx";
import { useTheme } from "../utils/theme.js";
import { ROUTER_ABI, CONTRACT_ADDRESSES } from "../utils/contracts.js";

const FEATURES = [
  { icon: "\u{1F512}", title: "Hidden Orders", desc: "Orders are cryptographically committed before execution. No one sees your trade details until the epoch ends." },
  { icon: "\u2696\uFE0F", title: "Fair Pricing", desc: "All orders in a batch settle at a single uniform clearing price. No advantage from order timing or positioning." },
  { icon: "\u{1F310}", title: "Cross-Chain", desc: "Matched fills route to Hydration, Bifrost, and Acala via XCM. MEV protection across the entire Polkadot ecosystem." },
];

const HOW_IT_WORKS = [
  { step: "1", icon: "\u{1F512}", title: "Commit", desc: "Submit hidden order with collateral" },
  { step: "2", icon: "\u{1F6E1}\uFE0F", title: "Hide", desc: "Orders hidden during epoch" },
  { step: "3", icon: "\u2696\uFE0F", title: "Batch", desc: "Uniform clearing price for all" },
  { step: "4", icon: "\u2705", title: "Save", desc: "Zero MEV, fair execution" },
];

export function Dashboard({ onStartTrading, provider }) {
  const { isDark, bg, border, text, textSec, textMuted } = useTheme();
  const [stats, setStats] = useState({ orders: "47", volume: "5,240", mevSaved: "142.5", fees: "5.24", isLive: false });

  useEffect(() => {
    if (!provider || CONTRACT_ADDRESSES.router === ethers.ZeroAddress) return;
    const router = new ethers.Contract(CONTRACT_ADDRESSES.router, ROUTER_ABI, provider);
    router.getProtocolStats().then(([orders, volume, mevSaved, fees]) => {
      const o = Number(orders);
      if (o > 0) {
        setStats({
          orders: o.toString(),
          volume: parseFloat(ethers.formatEther(volume)).toFixed(0),
          mevSaved: parseFloat(ethers.formatEther(mevSaved)).toFixed(1),
          fees: parseFloat(ethers.formatEther(fees)).toFixed(2),
          isLive: true,
        });
      }
    }).catch(() => {});
  }, [provider]);

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className={`relative overflow-hidden rounded-xl p-8 sm:p-10 border ${isDark ? "bg-gradient-to-br from-slate-900 via-emerald-950/20 to-slate-900 border-emerald-900/30" : "bg-gradient-to-br from-gray-50 via-emerald-50/40 to-gray-50 border-emerald-200/50"}`}>
        <div className="relative z-10 max-w-2xl">
          <p className="text-emerald-500 text-xs font-bold tracking-widest uppercase mb-2">Polkadot Hub</p>
          <h1 className={`text-2xl sm:text-3xl font-bold leading-tight ${text}`}>The first MEV protection<br/>protocol on Polkadot</h1>
          <p className={`text-sm mt-3 leading-relaxed max-w-lg ${textSec}`}>Commit-reveal batch auctions eliminate sandwich attacks, front-running, and all ordering-based MEV. Every trade settles at a fair uniform clearing price.</p>
          <div className="flex flex-wrap gap-3 mt-5">
            <button onClick={onStartTrading} className="px-5 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-500 active:scale-[0.98] transition-all duration-150">Start Trading</button>
            <a href="https://blockscout-testnet.polkadot.io/" target="_blank" rel="noopener noreferrer"
              className={`px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 border ${isDark ? "bg-gray-800/60 text-gray-300 hover:bg-gray-700/60 border-gray-700/40" : "bg-white text-gray-600 hover:bg-gray-50 border-gray-300"}`}>View on Explorer</a>
          </div>
        </div>
        <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl"></div>
      </div>

      {/* Feature cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {FEATURES.map((f, i) => (
          <div key={i} className={`rounded-xl p-5 border transition-colors duration-150 ${bg} ${border} ${isDark ? "hover:border-gray-700" : "hover:border-gray-300"}`}>
            <span className="text-2xl mb-3 block">{f.icon}</span>
            <h4 className={`text-sm font-bold mb-1 ${text}`}>{f.title}</h4>
            <p className={`text-xs leading-relaxed ${textSec}`}>{f.desc}</p>
          </div>
        ))}
      </div>

      {/* Hero stat */}
      <div className="text-center py-6">
        <p className={`text-xs uppercase tracking-widest mb-2 ${textMuted}`}>Total MEV Saved</p>
        <p className="text-5xl sm:text-6xl font-bold text-emerald-400 font-mono tabular-nums" style={{ textShadow: "0 0 40px rgba(16,185,129,0.25)", animation: "pulse 3s ease-in-out infinite" }}>
          {stats.mevSaved} <span className="text-3xl sm:text-4xl text-emerald-500/70">PAS</span>
        </p>
        <p className={`text-[11px] mt-2 ${textMuted}`}>across all settled epochs</p>
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { l: "Orders Protected", v: stats.orders, c: text },
          { l: "Avg Savings", v: Number(stats.orders) > 0 ? (parseFloat(stats.mevSaved) / Number(stats.orders)).toFixed(2) : "0", c: "text-emerald-400" },
          { l: "Volume (PAS)", v: stats.volume, c: text },
          { l: "Protocol Revenue", v: `${stats.fees} PAS`, c: "text-yellow-400" },
        ].map((s, i) => (
          <div key={i} className={`rounded-xl p-4 border text-center ${isDark ? "bg-gray-900/60 border-gray-800/60" : "bg-white border-gray-200"}`}>
            <p className={`text-[11px] mb-0.5 ${textMuted}`}>{s.l}</p>
            <p className={`text-lg font-bold font-mono ${s.c}`}>{s.v}</p>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div className={`rounded-xl border p-6 ${bg} ${border}`}>
        <h3 className={`text-base font-semibold mb-5 ${text}`}>How ShieldX Protects Your Trades</h3>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {HOW_IT_WORKS.map((step) => (
            <div key={step.step} className="text-center">
              <div className={`w-12 h-12 mx-auto mb-2.5 rounded-full flex items-center justify-center ${isDark ? "bg-emerald-900/20 border border-emerald-800/40" : "bg-emerald-50 border border-emerald-200"}`}>
                <span className="text-xl">{step.icon}</span>
              </div>
              <div className="flex items-center justify-center gap-1 mb-1">
                <span className="w-4 h-4 rounded-full bg-emerald-600 text-[10px] text-white flex items-center justify-center font-bold">{step.step}</span>
                <span className={`text-xs font-semibold ${text}`}>{step.title}</span>
              </div>
              <p className={`text-[11px] leading-relaxed ${textMuted}`}>{step.desc}</p>
            </div>
          ))}
        </div>
      </div>

      <SandwichDemo />
      <EpochHistory />
    </div>
  );
}
