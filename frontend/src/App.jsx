import { useState, useEffect } from "react";
import { Header } from "./components/Header.jsx";
import { EpochTimer } from "./components/EpochTimer.jsx";
import { OrderPanel } from "./components/OrderPanel.jsx";
import { BatchVisualizer } from "./components/BatchVisualizer.jsx";
import { EpochHistory } from "./components/EpochHistory.jsx";
import { Dashboard } from "./components/Dashboard.jsx";
import { Docs } from "./components/Docs.jsx";
import { useWallet } from "./hooks/useWallet.js";
import { useEpoch } from "./hooks/useEpoch.js";
import { useShieldX } from "./hooks/useShieldX.js";
import { ThemeContext } from "./utils/theme.js";

const NAV_ITEMS = ["Dashboard", "Trade", "History"];

export function App() {
  const [activePage, setActivePage] = useState("Dashboard");
  const [showDocs, setShowDocs] = useState(false);
  const [docsTab, setDocsTab] = useState("Litepaper");
  const [isDark, setIsDark] = useState(true);
  const wallet = useWallet();
  const { epoch, phase, timeRemaining, lastSettled } = useEpoch(wallet.provider);
  const shieldx = useShieldX(wallet.signer, epoch?.id);

  useEffect(() => {
    if (phase === "reveal" && shieldx.pendingOrders.some(o => !o.revealed)) {
      shieldx.autoReveal();
    }
  }, [phase]);

  useEffect(() => {
    if (lastSettled && wallet.account) {
      shieldx.fetchSurplus(lastSettled.epochId, wallet.account);
    }
  }, [lastSettled, wallet.account]);

  const t = isDark
    ? { bg: "bg-slate-950", text: "text-white", card: "bg-gray-900", border: "border-gray-800", navBorder: "border-gray-800/60", cls: "" }
    : { bg: "bg-slate-50", text: "text-gray-900", card: "bg-white", border: "border-gray-200", navBorder: "border-gray-200", cls: "light-theme" };

  const pendingCount = shieldx.pendingOrders.filter(o => !o.settled).length;

  function navigate(page) {
    setActivePage(page);
    setShowDocs(false);
    window.scrollTo(0, 0);
  }

  return (
    <ThemeContext.Provider value={isDark}>
    <div className={`min-h-screen ${t.bg} ${t.text} ${t.cls}`}>
      <Header
        account={wallet.account}
        isConnected={wallet.isConnected}
        balance={wallet.balance}
        onConnect={wallet.connect}
        onDisconnect={wallet.disconnect}
        isDark={isDark}
        onToggleTheme={() => setIsDark(!isDark)}
        navItems={NAV_ITEMS}
        activePage={activePage}
        onNavigate={navigate}
        onShowDocs={(tab) => { setDocsTab(tab || "Litepaper"); setShowDocs(true); window.scrollTo(0, 0); }}
      />

      <main className="max-w-screen-xl mx-auto px-6 sm:px-10 lg:px-16 py-6">
        {showDocs ? (
          <Docs initialTab={docsTab} />
        ) : activePage === "Dashboard" ? (
          <Dashboard onStartTrading={() => navigate("Trade")} provider={wallet.provider} />
        ) : activePage === "Trade" ? (
          <div className="space-y-5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <OrderPanel
                onCommit={shieldx.commitOrder}
                isLoading={shieldx.isLoading}
                isConnected={wallet.isConnected}
                phase={phase}
                savedAmount={shieldx.savedAmount}
                lastSettled={lastSettled}
              />
              <EpochTimer
                epoch={epoch}
                phase={phase}
                timeRemaining={timeRemaining}
                pendingCount={pendingCount}
                lastSettled={lastSettled}
              />
            </div>

            <BatchVisualizer epoch={epoch} />

            {shieldx.error && !shieldx.error.includes("could not decode") && !shieldx.error.includes("CALL_EXCEPTION") && (
              <div className={`p-3 rounded-xl text-sm flex items-center gap-2 ${isDark ? "bg-amber-950/30 border border-amber-800/40 text-amber-400" : "bg-amber-50 border border-amber-200 text-amber-600"}`}>
                <span>Transaction failed. Please check your wallet and try again.</span>
              </div>
            )}

            {shieldx.pendingOrders.length > 0 && (
              <div className={`rounded-xl p-5 border ${t.card} ${t.border}`}>
                <h3 className={`text-sm font-semibold mb-3 ${t.text}`}>Your Orders</h3>
                <div className="space-y-2">
                  {shieldx.pendingOrders.map((order, i) => (
                    <div key={i} className={`flex items-center justify-between p-3 rounded-lg border ${isDark ? "bg-gray-800/50 border-gray-700/30" : "bg-gray-50 border-gray-200"}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                          order.params.orderType === 0 ? "bg-emerald-500/15 text-emerald-400" : "bg-red-500/15 text-red-400"
                        }`}>
                          {order.params.orderType === 0 ? "BUY" : "SELL"}
                        </span>
                        <span className={`text-[11px] font-mono truncate ${isDark ? "text-gray-500" : "text-gray-400"}`}>
                          {order.commitHash.slice(0, 14)}...
                        </span>
                      </div>
                      <div className="shrink-0 ml-2">
                        {order.status === "committed" && phase === "commit" && (
                          <span className={`text-[11px] ${isDark ? "text-gray-500" : "text-gray-400"}`}>Waiting...</span>
                        )}
                        {(order.status === "committed" && phase === "reveal") || order.status === "revealing" ? (
                          <span className="text-[11px] text-amber-400 flex items-center gap-1">
                            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                            {order.status === "revealing" ? "Revealing..." : "Auto-revealing..."}
                          </span>
                        ) : null}
                        {order.status === "revealed" && (
                          <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M20 6L9 17L4 12"/></svg>
                            Revealed
                          </span>
                        )}
                        {order.status === "settled" && (
                          <span className="text-[11px] text-emerald-400 font-medium">
                            Filled{order.clearingPrice ? ` @ ${parseFloat(order.clearingPrice).toFixed(2)}` : ""}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : activePage === "History" ? (
          <EpochHistory />
        ) : null}
      </main>

      <footer className={`border-t ${t.navBorder} py-5 mt-12`}>
        <div className="max-w-screen-xl mx-auto px-6 sm:px-10 lg:px-16 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className={`text-[11px] ${isDark ? "text-gray-600" : "text-gray-400"}`}>ShieldX &middot; Polkadot Hackathon 2026</p>
          <div className={`flex gap-4 text-[11px] ${isDark ? "text-gray-500" : "text-gray-400"}`}>
            <button onClick={() => { setShowDocs(true); window.scrollTo(0, 0); }} className="hover:text-emerald-500 transition-colors">Docs</button>
            <a href="https://github.com/FarseenSh/Shieldx" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-500 transition-colors">GitHub</a>
            <a href="https://blockscout-testnet.polkadot.io/" target="_blank" rel="noopener noreferrer" className="hover:text-emerald-500 transition-colors">Explorer</a>
          </div>
        </div>
      </footer>
    </div>
    </ThemeContext.Provider>
  );
}
