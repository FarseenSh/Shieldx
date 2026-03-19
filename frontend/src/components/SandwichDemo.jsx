import { useState, useEffect, useCallback, useRef } from "react";
import { useTheme } from "../utils/theme.js";

const DELAY = 2000;

const attack = [
  "Attacker sees pending swap in mempool",
  "Front-runs with buy, pushes price up 3%",
  "Victim swap executes at inflated price",
  "Attacker sells at profit, extracts $2.85",
];

const shielded = [
  "All orders committed as hidden hashes",
  "Epoch ends, everyone reveals simultaneously",
  "Batch auction finds uniform clearing price",
  "Everyone gets the same fair price",
];

export function SandwichDemo() {
  const { isDark, border, text, textSec, textMuted } = useTheme();
  const [step, setStep] = useState(-1);
  const [done, setDone] = useState(false);
  const ref = useRef(null);
  const timers = useRef([]);

  const clear = useCallback(() => { timers.current.forEach(clearTimeout); timers.current = []; }, []);

  const run = useCallback(() => {
    clear(); setStep(-1); setDone(false);
    for (let i = 0; i < 4; i++) {
      const id = setTimeout(() => setStep(i), (i + 1) * DELAY);
      timers.current.push(id);
    }
    timers.current.push(setTimeout(() => setDone(true), 5 * DELAY));
    timers.current.push(setTimeout(() => run(), 14 * DELAY));
  }, [clear]);

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) run(); else { clear(); setStep(-1); setDone(false); }
    }, { threshold: 0.2 });
    if (ref.current) obs.observe(ref.current);
    return () => { clear(); obs.disconnect(); };
  }, [run, clear]);

  function Side({ title, steps, bad }) {
    return (
      <div>
        <p className={`text-base font-semibold mb-4 ${text}`}>{title}</p>
        <div className="space-y-3">
          {steps.map((s, i) => (
            <div key={i} className={`flex gap-3 items-start transition-all duration-500 ${i <= step ? "" : "opacity-15"}`}>
              <span className={`text-xs font-mono mt-0.5 w-4 shrink-0 ${i <= step ? (bad ? "text-red-400" : "text-emerald-500") : textMuted}`}>{i + 1}</span>
              <p className={`text-base leading-snug ${i <= step ? textSec : textMuted}`}>{s}</p>
            </div>
          ))}
        </div>
        <div className={`mt-6 pt-4 border-t transition-all duration-500 ${border} ${done ? "opacity-100" : "opacity-0"}`}>
          <p className={`text-lg font-mono font-semibold ${bad ? "text-red-400" : "text-emerald-500"}`}>
            {bad ? "Victim loses $3.00" : "Victim loses $0.00"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="grid grid-cols-1 sm:grid-cols-2 gap-10 sm:gap-16">
      <Side title="Without protection" steps={attack} bad={true} />
      <Side title="With ShieldX" steps={shielded} bad={false} />
    </div>
  );
}
