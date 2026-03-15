export function Header({ account, isConnected, balance, onConnect, onDisconnect }) {
  const truncated = account ? `${account.slice(0, 6)}...${account.slice(-4)}` : "";

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-950">
      <div className="flex items-center gap-2">
        <span className="text-2xl">&#x1f6e1;</span>
        <h1 className="text-xl font-bold text-white tracking-tight">ShieldX</h1>
        <span className="text-xs text-gray-500 ml-2">MEV Protection</span>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-800 text-xs text-gray-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block"></span>
          Polkadot Hub TestNet
        </div>

        {isConnected ? (
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">{parseFloat(balance).toFixed(2)} PAS</span>
            <button
              onClick={onDisconnect}
              className="px-3 py-1.5 rounded-lg bg-gray-800 text-sm text-white hover:bg-gray-700 transition font-mono"
            >
              {truncated}
            </button>
          </div>
        ) : (
          <button
            onClick={onConnect}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-sm text-white font-semibold hover:bg-emerald-500 transition"
          >
            Connect Wallet
          </button>
        )}
      </div>
    </header>
  );
}
