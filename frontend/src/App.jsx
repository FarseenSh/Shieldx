import { useState } from "react";
import { Header } from "./components/Header.jsx";
import { EpochTimer } from "./components/EpochTimer.jsx";
import { OrderPanel } from "./components/OrderPanel.jsx";
import { BatchVisualizer } from "./components/BatchVisualizer.jsx";
import { SandwichDemo } from "./components/SandwichDemo.jsx";
import { EpochHistory } from "./components/EpochHistory.jsx";
import { Dashboard } from "./components/Dashboard.jsx";
import { useWallet } from "./hooks/useWallet.js";
import { useEpoch } from "./hooks/useEpoch.js";
import { useShieldX } from "./hooks/useShieldX.js";

const TABS = ["Trade", "MEV Demo", "History", "Dashboard"];

export function App() {
  const [activeTab, setActiveTab] = useState("MEV Demo");
  const wallet = useWallet();
  const { epoch, phase, timeRemaining } = useEpoch(wallet.provider);
  const shieldx = useShieldX(wallet.signer);

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <Header
        account={wallet.account}
        isConnected={wallet.isConnected}
        balance={wallet.balance}
        onConnect={wallet.connect}
        onDisconnect={wallet.disconnect}
      />

      {/* Tab navigation */}
      <nav className="flex border-b border-gray-800 px-6">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 text-sm font-medium transition border-b-2 -mb-px ${
              activeTab === tab
                ? "text-emerald-400 border-emerald-400"
                : "text-gray-500 border-transparent hover:text-gray-300"
            }`}
          >
            {tab}
          </button>
        ))}
      </nav>

      {/* Tab content */}
      <main className="max-w-6xl mx-auto px-6 py-6">
        {activeTab === "Trade" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <OrderPanel
                onCommit={shieldx.commitOrder}
                isLoading={shieldx.isLoading}
                isConnected={wallet.isConnected}
                phase={phase}
              />
              <EpochTimer epoch={epoch} phase={phase} timeRemaining={timeRemaining} />
            </div>

            <BatchVisualizer epoch={epoch} />

            {shieldx.error && (
              <div className="p-4 bg-red-950 border border-red-800 rounded-lg text-red-400 text-sm">
                {shieldx.error}
              </div>
            )}

            {shieldx.pendingOrders.length > 0 && (
              <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
                <h3 className="text-lg font-semibold text-white mb-3">Pending Orders</h3>
                <div className="space-y-2">
                  {shieldx.pendingOrders.map((order, i) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                      <div>
                        <span className={`text-xs font-bold ${order.params.orderType === 0 ? "text-emerald-400" : "text-red-400"}`}>
                          {order.params.orderType === 0 ? "BUY" : "SELL"}
                        </span>
                        <span className="text-xs text-gray-400 ml-2 font-mono">
                          {order.commitHash.slice(0, 16)}...
                        </span>
                      </div>
                      {!order.revealed && phase === "reveal" && (
                        <button
                          onClick={() => shieldx.revealOrder(order.commitHash)}
                          className="px-3 py-1 text-xs bg-amber-600 text-white rounded hover:bg-amber-500 transition"
                        >
                          Reveal
                        </button>
                      )}
                      {order.revealed && (
                        <span className="text-xs text-emerald-400">Revealed</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "MEV Demo" && <SandwichDemo />}

        {activeTab === "History" && <EpochHistory />}

        {activeTab === "Dashboard" && <Dashboard />}
      </main>
    </div>
  );
}
