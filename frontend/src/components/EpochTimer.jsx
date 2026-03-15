export function EpochTimer({ epoch, phase, timeRemaining }) {
  const phaseConfig = {
    commit: { label: "COMMIT PHASE", color: "bg-emerald-600", text: "text-emerald-400" },
    reveal: { label: "REVEAL PHASE", color: "bg-amber-600", text: "text-amber-400" },
    settle: { label: "SETTLING...", color: "bg-blue-600", text: "text-blue-400" },
  };

  const config = phaseConfig[phase] || phaseConfig.commit;
  const totalDuration = phase === "commit" ? (epoch?.duration || 30) : (epoch?.revealWindow || 30);
  const progress = totalDuration > 0 ? Math.max(0, Math.min(100, ((totalDuration - timeRemaining) / totalDuration) * 100)) : 0;

  return (
    <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
      <div className="flex items-center justify-between mb-4">
        <span className={`px-3 py-1 rounded-full text-xs font-bold text-white ${config.color}`}>
          {config.label}
        </span>
        <span className="text-sm text-gray-400">
          Epoch #{epoch?.id || "—"}
        </span>
      </div>

      <div className="text-center mb-4">
        <span className={`text-5xl font-mono font-bold ${config.text}`}>
          {timeRemaining > 0 ? timeRemaining : "0"}
        </span>
        <span className="text-gray-500 text-lg ml-1">s</span>
      </div>

      <div className="w-full bg-gray-800 rounded-full h-2">
        <div
          className={`h-2 rounded-full transition-all duration-1000 ${config.color}`}
          style={{ width: `${progress}%` }}
        />
      </div>

      <div className="flex justify-between mt-3 text-xs text-gray-500">
        <span>{epoch?.totalCommitments || 0} commitments</span>
        <span>{epoch?.totalRevealed || 0} revealed</span>
      </div>
    </div>
  );
}
