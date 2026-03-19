import { useTheme } from "../utils/theme.js";

export function EpochTimer({ epoch, phase, timeRemaining, pendingCount = 0, lastSettled }) {
  const { isDark, bg, border, text, textMuted } = useTheme();

  const c = {
    commit: { label: "Commit", color: "text-emerald-500" },
    reveal: { label: "Reveal", color: "text-amber-500" },
    settle: { label: "Settle", color: "text-blue-500" },
  }[phase] || { label: "Commit", color: "text-emerald-500" };

  return (
    <div className={`rounded-xl p-5 border ${bg} ${border}`}>
      <div className="flex items-baseline justify-between">
        <span className={`text-sm font-medium ${c.color}`}>{c.label}</span>
        <span className={`text-xs font-mono ${textMuted}`}>Epoch {epoch?.id || "\u2014"}</span>
      </div>

      <div className="mt-6 mb-6">
        <p className={`text-5xl font-mono font-light tabular-nums ${text}`}>
          {timeRemaining > 0 ? String(timeRemaining).padStart(2, "0") : "00"}
          <span className={`text-lg ml-1 ${textMuted}`}>s</span>
        </p>
      </div>

      <div className={`flex gap-4 text-[11px] ${textMuted}`}>
        <span>{epoch?.totalCommitments || 0} committed</span>
        <span>{epoch?.totalRevealed || 0} revealed</span>
      </div>

      {pendingCount > 0 && (
        <p className={`text-xs mt-3 ${phase === "reveal" ? "text-amber-500" : "text-emerald-500"}`}>
          {phase === "reveal" ? `Revealing ${pendingCount}...` : `${pendingCount} pending`}
        </p>
      )}

      {lastSettled && (
        <p className="text-xs mt-3 text-emerald-500">
          Settled at {lastSettled.clearingPrice}
        </p>
      )}
    </div>
  );
}
