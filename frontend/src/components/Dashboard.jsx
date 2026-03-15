import { SandwichDemo } from "./SandwichDemo.jsx";
import { EpochHistory } from "./EpochHistory.jsx";

export function Dashboard() {
  const stats = [
    { label: "Total Epochs", value: "3", color: "text-white" },
    { label: "Orders Protected", value: "25", color: "text-emerald-400" },
    { label: "Total Volume", value: "5,240 PAS", color: "text-yellow-400" },
    { label: "MEV Saved", value: "$0.00", color: "text-emerald-400" },
  ];

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s, i) => (
          <div key={i} className="bg-gray-900 rounded-xl p-5 border border-gray-800">
            <p className="text-xs text-gray-500 mb-1">{s.label}</p>
            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Sandwich demo */}
      <SandwichDemo />

      {/* Epoch history */}
      <EpochHistory />
    </div>
  );
}
