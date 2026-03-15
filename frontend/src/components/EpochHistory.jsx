import { useTheme } from "../utils/theme.js";

export function EpochHistory() {
  const { isDark, bg, border, text, textMuted, bgHover } = useTheme();

  const epochs = [
    { id: 849, clearingPrice: "98.47", filled: 14, total: 18, volume: "4,217", time: "just now" },
    { id: 848, clearingPrice: "101.23", filled: 9, total: 12, volume: "2,891", time: "32s ago" },
    { id: 847, clearingPrice: "99.86", filled: 22, total: 25, volume: "8,340", time: "1m ago" },
  ];

  return (
    <div className={`rounded-xl border overflow-hidden ${bg} ${border}`}>
      <div className={`px-5 py-3 border-b flex items-center justify-between ${border}`}>
        <h3 className={`text-sm font-semibold ${text}`}>Epoch History</h3>
        <span className={`text-[10px] ${textMuted}`}>{epochs.length} recent</span>
      </div>

      <div className="hidden sm:block overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className={`text-[11px] border-b ${textMuted} ${border}`}>
              <th className="px-5 py-2.5 text-left font-medium">Epoch</th>
              <th className="px-5 py-2.5 text-right font-medium">Clearing Price</th>
              <th className="px-5 py-2.5 text-right font-medium">Filled</th>
              <th className="px-5 py-2.5 text-right font-medium">Volume (PAS)</th>
              <th className="px-5 py-2.5 text-right font-medium">Time</th>
            </tr>
          </thead>
          <tbody>
            {epochs.map(e => (
              <tr key={e.id} className={`border-b transition-colors duration-100 ${isDark ? "border-gray-800/30 hover:bg-gray-800/20" : "border-gray-100 hover:bg-gray-50"}`}>
                <td className={`px-5 py-3 text-sm font-mono ${text}`}>#{e.id}</td>
                <td className="px-5 py-3 text-sm text-yellow-500 text-right font-mono">{e.clearingPrice}</td>
                <td className="px-5 py-3 text-sm text-right"><span className="text-emerald-500 font-medium">{e.filled}</span><span className={textMuted}>/{e.total}</span></td>
                <td className={`px-5 py-3 text-sm text-right font-mono ${isDark ? "text-gray-300" : "text-gray-600"}`}>{e.volume}</td>
                <td className={`px-5 py-3 text-[11px] text-right ${textMuted}`}>{e.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={`sm:hidden divide-y ${isDark ? "divide-gray-800/40" : "divide-gray-100"}`}>
        {epochs.map(e => (
          <div key={e.id} className="px-5 py-3 flex items-center justify-between">
            <div><span className={`text-sm font-mono ${text}`}>#{e.id}</span><span className={`text-xs ml-2 ${textMuted}`}>{e.time}</span></div>
            <div className="text-right"><p className="text-sm text-yellow-500 font-mono">{e.clearingPrice}</p><p className={`text-[11px] ${textMuted}`}>{e.filled}/{e.total} filled</p></div>
          </div>
        ))}
      </div>
    </div>
  );
}
