import { useTheme } from "../utils/theme.js";

export function EpochHistory() {
  const { isDark, text, textMuted } = useTheme();

  const epochs = [
    { id: 849, price: "98.47", filled: "14/18", volume: "4,217", time: "just now" },
    { id: 848, price: "101.23", filled: "9/12", volume: "2,891", time: "32s ago" },
    { id: 847, price: "99.86", filled: "22/25", volume: "8,340", time: "1m ago" },
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className={textMuted}>
            <td className="pb-2 text-[11px]">Epoch</td>
            <td className="pb-2 text-[11px] text-right">Price</td>
            <td className="pb-2 text-[11px] text-right">Filled</td>
            <td className="pb-2 text-[11px] text-right hidden sm:table-cell">Volume</td>
            <td className="pb-2 text-[11px] text-right">Time</td>
          </tr>
        </thead>
        <tbody>
          {epochs.map(e => (
            <tr key={e.id} className={`border-t ${isDark ? "border-gray-800/40" : "border-gray-100"}`}>
              <td className={`py-2.5 font-mono ${text}`}>{e.id}</td>
              <td className="py-2.5 text-right font-mono text-emerald-500">{e.price}</td>
              <td className={`py-2.5 text-right ${textMuted}`}>{e.filled}</td>
              <td className={`py-2.5 text-right font-mono hidden sm:table-cell ${textMuted}`}>{e.volume}</td>
              <td className={`py-2.5 text-right ${textMuted}`}>{e.time}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
