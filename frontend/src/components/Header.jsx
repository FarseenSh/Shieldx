import { useState } from "react";

export function Header({ account, isConnected, balance, onConnect, onDisconnect, isDark, onToggleTheme, navItems, activePage, onNavigate, onShowDocs }) {
  const [connecting, setConnecting] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const truncated = account ? `${account.slice(0, 6)}...${account.slice(-4)}` : "";
  const text = isDark ? "text-white" : "text-gray-900";
  const textMuted = isDark ? "text-gray-400" : "text-gray-400";

  async function handleConnect() {
    setConnecting(true);
    try { await onConnect(); } finally { setConnecting(false); }
  }

  return (
    <header className={`flex items-center justify-between px-4 sm:px-6 h-14 border-b sticky top-0 z-50 ${isDark ? "border-gray-800/60 bg-slate-950/90" : "border-gray-200 bg-white/90"}`} style={{ backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}>
      {/* Left */}
      <div className="flex items-center gap-6">
        <button onClick={() => onNavigate("Dashboard")} className="flex items-center gap-2">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L3 7V12C3 17.55 6.84 22.74 12 24C17.16 22.74 21 17.55 21 12V7L12 2Z" fill="#10B981" fillOpacity="0.2" stroke="#10B981" strokeWidth="1.5" strokeLinejoin="round"/>
            <path d="M9 12L11 14L15 10" stroke="#10B981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className={`text-base font-semibold tracking-tight ${text}`}>ShieldX</span>
        </button>

        <nav className="hidden sm:flex items-center gap-1">
          {navItems.map(item => (
            <button key={item} onClick={() => onNavigate(item)}
              className={`px-3 py-1 text-[13px] font-medium rounded-md transition-colors ${
                activePage === item ? "text-emerald-500" : `${textMuted} hover:${text}`
              }`}>
              {item}
            </button>
          ))}
        </nav>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2.5">
        <button onClick={onToggleTheme}
          className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${isDark ? "text-gray-500 hover:text-gray-300" : "text-gray-400 hover:text-gray-600"}`}>
          {isDark ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1V3M12 21V23M4.22 4.22L5.64 5.64M18.36 18.36L19.78 19.78M1 12H3M21 12H23M4.22 19.78L5.64 18.36M18.36 5.64L19.78 4.22"/></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"/></svg>
          )}
        </button>

        <div className={`hidden md:flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] ${textMuted}`}>
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
          Testnet
        </div>

        {isConnected ? (
          <button onClick={onDisconnect}
            className={`px-3 py-1.5 rounded-lg text-xs font-mono transition-colors border ${isDark ? "bg-gray-800/80 text-gray-300 border-gray-700/50 hover:border-gray-600" : "bg-gray-50 text-gray-600 border-gray-200 hover:border-gray-300"}`}>
            {truncated}
          </button>
        ) : (
          <button onClick={handleConnect} disabled={connecting}
            className="px-4 py-1.5 rounded-lg bg-emerald-600 text-[13px] text-white font-medium hover:bg-emerald-500 transition-colors disabled:opacity-60">
            {connecting ? "..." : "Connect"}
          </button>
        )}

        {/* Menu */}
        <div className="relative">
          <button onClick={() => setMenuOpen(!menuOpen)}
            className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${isDark ? "text-gray-500 hover:text-gray-300" : "text-gray-400 hover:text-gray-600"}`}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
          </button>

          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)}></div>
              <div className={`absolute right-0 top-9 z-50 w-48 rounded-lg border shadow-lg py-1 ${isDark ? "bg-gray-900 border-gray-800" : "bg-white border-gray-200"}`}>
                {[
                  { label: "Litepaper", tab: "Litepaper" },
                  { label: "Security", tab: "Security" },
                  { label: "Integration Guide", tab: "Integration" },
                  { label: "SDK", tab: "SDK" },
                ].map(item => (
                  <button key={item.label} onClick={() => { setMenuOpen(false); onShowDocs(item.tab); }}
                    className={`w-full text-left px-3 py-2 text-xs transition-colors ${isDark ? "text-gray-300 hover:bg-gray-800" : "text-gray-600 hover:bg-gray-50"}`}>
                    {item.label}
                  </button>
                ))}
                <div className={`my-1 border-t ${isDark ? "border-gray-800" : "border-gray-200"}`}></div>
                {[
                  { label: "GitHub", href: "https://github.com/FarseenSh/Shieldx" },
                  { label: "Explorer", href: "https://blockscout-testnet.polkadot.io/" },
                  { label: "Faucet", href: "https://faucet.polkadot.io/" },
                ].map(item => (
                  <a key={item.label} href={item.href} target="_blank" rel="noopener noreferrer" onClick={() => setMenuOpen(false)}
                    className={`flex items-center justify-between w-full px-3 py-2 text-xs transition-colors ${isDark ? "text-gray-400 hover:text-gray-200 hover:bg-gray-800" : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"}`}>
                    {item.label}
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
                  </a>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div className={`sm:hidden fixed bottom-0 left-0 right-0 z-50 border-t flex ${isDark ? "bg-slate-950/95 border-gray-800" : "bg-white/95 border-gray-200"}`}
        style={{ backdropFilter: "blur(12px)" }}>
        {navItems.map(item => (
          <button key={item} onClick={() => onNavigate(item)}
            className={`flex-1 py-3 text-[11px] font-medium ${activePage === item ? "text-emerald-500" : textMuted}`}>
            {item}
          </button>
        ))}
      </div>
    </header>
  );
}
