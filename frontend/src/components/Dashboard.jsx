import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { SandwichDemo } from "./SandwichDemo.jsx";
import { EpochHistory } from "./EpochHistory.jsx";
import { useTheme } from "../utils/theme.js";
import { ROUTER_ABI, CONTRACT_ADDRESSES } from "../utils/contracts.js";

export function Dashboard({ onStartTrading, provider }) {
  const { isDark, bg, border, text, textSec, textMuted } = useTheme();
  const [stats, setStats] = useState({ orders: "47", volume: "5,240", mevSaved: "142.5", fees: "5.24" });

  useEffect(() => {
    if (!provider || CONTRACT_ADDRESSES.router === ethers.ZeroAddress) return;
    const router = new ethers.Contract(CONTRACT_ADDRESSES.router, ROUTER_ABI, provider);
    router.getProtocolStats().then(([orders, volume, mevSaved, fees]) => {
      const o = Number(orders);
      if (o > 0) setStats({ orders: o.toString(), volume: parseFloat(ethers.formatEther(volume)).toFixed(0), mevSaved: parseFloat(ethers.formatEther(mevSaved)).toFixed(1), fees: parseFloat(ethers.formatEther(fees)).toFixed(2) });
    }).catch(() => {});
  }, [provider]);

  return (
    <div>
      {/* Hero */}
      <div className="py-10 sm:py-16 max-w-2xl">
        <h1 className={`text-4xl sm:text-5xl font-bold leading-[1.1] tracking-tight ${text}`}>
          Every trade at a<br/>fair price.
        </h1>
        <p className={`text-lg mt-5 leading-relaxed ${textSec}`}>
          ShieldX settles all orders at one uniform clearing price. Sandwich attacks are mathematically impossible.
        </p>
        <div className="flex gap-3 mt-8">
          <button onClick={onStartTrading} className="px-6 py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-500 transition-colors">
            Start trading
          </button>
          <a href="https://github.com/FarseenSh/Shieldx" target="_blank" rel="noopener noreferrer"
            className={`px-6 py-2.5 rounded-lg text-sm font-medium border transition-colors ${isDark ? "text-gray-300 border-gray-700 hover:border-gray-500" : "text-gray-600 border-gray-300 hover:border-gray-400"}`}>
            View source
          </a>
        </div>
      </div>

      {/* Stats */}
      <div className={`grid grid-cols-2 sm:grid-cols-4 gap-6 py-10 border-y ${border}`}>
        {[
          { value: stats.mevSaved, label: "PAS saved from MEV", accent: true },
          { value: stats.orders, label: "Orders protected" },
          { value: stats.volume, label: "PAS volume" },
          { value: stats.fees, label: "PAS revenue" },
        ].map((s, i) => (
          <div key={i}>
            <p className={`text-3xl sm:text-4xl font-semibold font-mono tabular-nums ${s.accent ? "text-emerald-500" : text}`}>{s.value}</p>
            <p className={`text-sm mt-1 ${textMuted}`}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div className="py-10">
        <h2 className={`text-2xl font-bold mb-8 ${text}`}>How it works</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
          {[
            { title: "Commit", desc: "Submit a hashed order with collateral. Your trade details stay hidden on-chain until the epoch ends." },
            { title: "Reveal", desc: "After the commit window closes, reveal your order. The contract verifies the hash matches." },
            { title: "Settle", desc: "The Rust PVM engine computes a single clearing price where supply meets demand." },
            { title: "Route", desc: "Native fills transfer directly. Cross-chain fills route via XCM to parachains." },
          ].map((step, i) => (
            <div key={i}>
              <p className={`text-base font-semibold mb-2 ${text}`}>{step.title}</p>
              <p className={`text-sm leading-relaxed ${textSec}`}>{step.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Sandwich demo */}
      <div className={`py-10 border-t ${border}`}>
        <h2 className={`text-2xl font-bold mb-8 ${text}`}>MEV protection in action</h2>
        <SandwichDemo />
      </div>

      {/* Why Polkadot */}
      <div className={`py-10 border-t ${border}`}>
        <h2 className={`text-2xl font-bold mb-8 ${text}`}>Built for Polkadot</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          {[
            { title: "PolkaVM", desc: "Rust batch matching runs natively on RISC-V. No EVM overhead for heavy computation." },
            { title: "XCM", desc: "Trustless cross-chain fills to Hydration, Bifrost, and Acala. No bridges needed." },
            { title: "Dual VM", desc: "Solidity for the interface, Rust for the engine. Both native on Polkadot Hub." },
          ].map((f, i) => (
            <div key={i}>
              <p className={`text-base font-semibold mb-2 ${text}`}>{f.title}</p>
              <p className={`text-sm leading-relaxed ${textSec}`}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Epoch history */}
      <div className={`py-10 border-t ${border}`}>
        <h2 className={`text-2xl font-bold mb-6 ${text}`}>Recent epochs</h2>
        <EpochHistory />
      </div>
    </div>
  );
}
