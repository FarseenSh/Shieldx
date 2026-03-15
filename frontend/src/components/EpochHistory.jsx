export function EpochHistory() {
  // Demo data — in production, this would read from contract events
  const epochs = [
    { id: 1, clearingPrice: "95.00", filled: 6, total: 8, volume: "1,250.00", time: "2m ago" },
    { id: 2, clearingPrice: "102.50", filled: 4, total: 5, volume: "890.00", time: "4m ago" },
    { id: 3, clearingPrice: "98.75", filled: 10, total: 12, volume: "3,100.00", time: "7m ago" },
  ];

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-800">
        <h3 className="text-lg font-semibold text-white">Epoch History</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-xs text-gray-500 border-b border-gray-800">
              <th className="px-6 py-3 text-left">Epoch</th>
              <th className="px-6 py-3 text-right">Clearing Price</th>
              <th className="px-6 py-3 text-right">Filled</th>
              <th className="px-6 py-3 text-right">Volume (PAS)</th>
              <th className="px-6 py-3 text-right">Time</th>
            </tr>
          </thead>
          <tbody>
            {epochs.map(e => (
              <tr key={e.id} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition">
                <td className="px-6 py-3 text-sm text-white font-mono">#{e.id}</td>
                <td className="px-6 py-3 text-sm text-yellow-400 text-right font-mono">{e.clearingPrice}</td>
                <td className="px-6 py-3 text-sm text-right">
                  <span className="text-emerald-400">{e.filled}</span>
                  <span className="text-gray-500">/{e.total}</span>
                </td>
                <td className="px-6 py-3 text-sm text-gray-300 text-right font-mono">{e.volume}</td>
                <td className="px-6 py-3 text-sm text-gray-500 text-right">{e.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
