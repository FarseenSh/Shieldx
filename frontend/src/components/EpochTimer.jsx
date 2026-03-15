import { useTheme } from "../utils/theme.js";

export function EpochTimer({ epoch, phase, timeRemaining, pendingCount = 0, lastSettled }) {
  const { isDark, bg, border, text, textMuted } = useTheme();

  const phaseConfig = {
    commit: { label: "COMMIT", color: "text-emerald-400", ring: "stroke-emerald-500", bg: isDark ? "bg-emerald-500/10" : "bg-emerald-50", border: isDark ? "border-emerald-500/20" : "border-emerald-200" },
    reveal: { label: "REVEAL", color: "text-amber-400", ring: "stroke-amber-500", bg: isDark ? "bg-amber-500/10" : "bg-amber-50", border: isDark ? "border-amber-500/20" : "border-amber-200" },
    settle: { label: "SETTLE", color: "text-blue-400", ring: "stroke-blue-500", bg: isDark ? "bg-blue-500/10" : "bg-blue-50", border: isDark ? "border-blue-500/20" : "border-blue-200" },
  };

  const config = phaseConfig[phase] || phaseConfig.commit;
  const totalDuration = phase === "commit" ? (epoch?.duration || 30) : (epoch?.revealWindow || 30);
  const progress = totalDuration > 0 ? Math.max(0, Math.min(1, (totalDuration - timeRemaining) / totalDuration)) : 0;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  return (
    <div className={`rounded-xl p-6 border transition-colors duration-300 ${bg} ${config.border}`}>
      <div className="flex items-center justify-between mb-2">
        <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold tracking-wider ${config.color} ${config.bg}`}>{config.label} PHASE</span>
        <span className={`text-xs font-mono ${textMuted}`}>Epoch #{epoch?.id || "\u2014"}</span>
      </div>
      <div className="flex justify-center py-4">
        <div className="relative w-36 h-36">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r={radius} fill="none" stroke={isDark ? "#1e293b" : "#e2e8f0"} strokeWidth="6" />
            <circle cx="60" cy="60" r={radius} fill="none" className={`${config.ring} transition-all duration-1000`} strokeWidth="6" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-4xl font-mono font-bold tabular-nums ${config.color}`}>{timeRemaining > 0 ? timeRemaining : "0"}</span>
            <span className={`text-[10px] uppercase tracking-widest mt-0.5 ${textMuted}`}>seconds</span>
          </div>
        </div>
      </div>
      <div className={`flex justify-between text-[11px] border-t pt-3 ${textMuted} ${border}`}>
        <span>{epoch?.totalCommitments || 0} commitments</span>
        <span>{epoch?.totalRevealed || 0} revealed</span>
      </div>

      {pendingCount > 0 && (
        <div className={`mt-3 text-center text-[11px] py-1.5 rounded-md ${
          phase === "reveal"
            ? "text-amber-400 bg-amber-500/10"
            : "text-emerald-400 bg-emerald-500/10"
        }`}>
          {phase === "reveal"
            ? `Auto-revealing ${pendingCount} order${pendingCount > 1 ? "s" : ""}...`
            : `${pendingCount} order${pendingCount > 1 ? "s" : ""} pending`
          }
        </div>
      )}

      {lastSettled && (
        <div className="mt-3 text-center text-[11px] py-1.5 rounded-md text-emerald-400 bg-emerald-500/10">
          Epoch #{lastSettled.epochId} settled at {lastSettled.clearingPrice}
        </div>
      )}
    </div>
  );
}
