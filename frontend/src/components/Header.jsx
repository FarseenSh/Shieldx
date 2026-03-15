import { useState } from "react";
import { useTheme } from "../utils/theme.js";

function ShieldIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L3 7V12C3 17.55 6.84 22.74 12 24C17.16 22.74 21 17.55 21 12V7L12 2Z"
        fill="#10B981" fillOpacity="0.2" stroke="#10B981" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M9 12L11 14L15 10" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

export function Header({ account, isConnected, balance, onConnect, onDisconnect, isDark, onToggleTheme }) {
  const [connecting, setConnecting] = useState(false);
  const truncated = account ? `${account.slice(0, 6)}...${account.slice(-4)}` : "";
  const { bg, border, text } = useTheme();

  async function handleConnect() {
    setConnecting(true);
    try { await onConnect(); } finally { setConnecting(false); }
  }

  return (
    <header className={`flex items-center justify-between px-4 sm:px-6 py-3 border-b sticky top-0 z-50 ${isDark ? "border-gray-800/60 bg-slate-950/90" : "border-gray-200 bg-white/90"}`} style={{ backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
      <div className="flex items-center gap-2.5">
        <ShieldIcon />
        <span className={`text-lg font-bold tracking-tight ${isDark ? "text-white" : "text-gray-900"}`}>ShieldX</span>
        <span className={`hidden sm:inline text-[10px] font-medium tracking-wider uppercase mt-0.5 ${isDark ? "text-gray-500" : "text-gray-400"}`}>Protocol</span>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={onToggleTheme}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150 ${isDark ? "bg-gray-800 hover:bg-gray-700 text-yellow-400" : "bg-gray-100 hover:bg-gray-200 text-gray-600"}`}>
          {isDark ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><path d="M12 1V3M12 21V23M4.22 4.22L5.64 5.64M18.36 18.36L19.78 19.78M1 12H3M21 12H23M4.22 19.78L5.64 18.36M18.36 5.64L19.78 4.22"/></svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg>
          )}
        </button>

        <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] border ${isDark ? "bg-gray-800/60 text-gray-400 border-gray-700/40" : "bg-gray-100 text-gray-500 border-gray-200"}`}>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          Polkadot Hub <span className={isDark ? "text-gray-500" : "text-gray-400"}>Testnet</span>
        </div>

        {isConnected ? (
          <div className="flex items-center gap-2.5">
            <span className={`text-[11px] font-mono ${isDark ? "text-gray-400" : "text-gray-500"}`}>{parseFloat(balance).toFixed(2)} PAS</span>
            <button onClick={onDisconnect}
              className={`px-3 py-1.5 rounded-lg text-xs transition-all duration-150 font-mono border ${isDark ? "bg-gray-800/80 text-gray-200 hover:bg-gray-700 border-gray-700/50" : "bg-gray-100 text-gray-700 hover:bg-gray-200 border-gray-200"}`}>
              {truncated}
            </button>
          </div>
        ) : (
          <button onClick={handleConnect} disabled={connecting}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-sm text-white font-semibold hover:bg-emerald-500 active:scale-[0.98] transition-all duration-150 disabled:opacity-60">
            {connecting ? "Connecting..." : "Connect Wallet"}
          </button>
        )}
      </div>
    </header>
  );
}
