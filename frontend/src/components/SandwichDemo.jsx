import { useState, useEffect, useCallback, useRef } from "react";
import { useTheme } from "../utils/theme.js";

const STEP_DELAY = 2200;

const normalSteps = [
  { icon: "\u{1F441}", title: "Attacker sees victim's pending swap", desc: "Transaction visible in public mempool" },
  { icon: "\u2B06\uFE0F", title: "Front-run: buys 50 DOT", desc: "Pushes price up 3% before victim's trade" },
  { icon: "\u{1F614}", title: "Victim gets 97 USDC instead of 100", desc: "Pays inflated price due to front-run" },
  { icon: "\u2B07\uFE0F", title: "Attacker sells at higher price", desc: "Extracts profit from victim's slippage" },
];

const shieldxSteps = [
  { icon: "\u{1F512}", title: "Orders submitted as hidden commitments", desc: "Cryptographic hash hides all trade details" },
  { icon: "\u{1F513}", title: "Epoch ends \u2014 orders revealed at once", desc: "Simultaneous reveal, no ordering advantage" },
  { icon: "\u2696\uFE0F", title: "Batch auction computes uniform price", desc: "Supply-demand intersection determines fair price" },
  { icon: "\u2705", title: "All orders execute at SAME price", desc: "Zero MEV extraction possible" },
];

export function SandwichDemo() {
  const { isDark, bg, border, text, textSec } = useTheme();
  const [activeStep, setActiveStep] = useState(-1);
  const [showResults, setShowResults] = useState(false);
  const [bannerBounce, setBannerBounce] = useState(false);
  const containerRef = useRef(null);
  const timersRef = useRef([]);

  const clearTimers = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  }, []);

  const runAnimation = useCallback(() => {
    clearTimers();
    setActiveStep(-1); setShowResults(false); setBannerBounce(false);
    const t = (fn, ms) => { const id = setTimeout(fn, ms); timersRef.current.push(id); };
    for (let i = 0; i < 4; i++) t(() => setActiveStep(i), (i + 1) * STEP_DELAY);
    t(() => setShowResults(true), 5.5 * STEP_DELAY);
    t(() => setBannerBounce(true), 6 * STEP_DELAY);
    t(() => setBannerBounce(false), 6.5 * STEP_DELAY);
    t(() => runAnimation(), 15 * STEP_DELAY);
  }, [clearTimers]);

  useEffect(() => {
    // Pause animation when not visible
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) runAnimation();
      else { clearTimers(); setActiveStep(-1); setShowResults(false); }
    }, { threshold: 0.2 });
    if (containerRef.current) observer.observe(containerRef.current);
    return () => { clearTimers(); observer.disconnect(); };
  }, [runAnimation, clearTimers]);

  function StepList({ steps, theme }) {
    const isRed = theme === "red";
    return (
      <div className="space-y-2.5">
        {steps.map((step, i) => {
          const active = i <= activeStep;
          const activeBg = isRed
            ? (isDark ? "bg-red-950/50 border-red-800/50" : "bg-red-50 border-red-200")
            : (isDark ? "bg-emerald-950/50 border-emerald-800/50" : "bg-emerald-50 border-emerald-200");
          const inactiveBg = isDark ? "bg-gray-800/10 border-gray-800/30 opacity-20" : "bg-gray-50/50 border-gray-200/50 opacity-20";
          return (
            <div key={i} className={`flex items-start gap-3 p-3 rounded-lg border transition-all duration-700 ${active ? activeBg : inactiveBg}`}>
              <span className={`text-xl mt-0.5 transition-all duration-500 ${active ? "scale-110 opacity-100" : "scale-75 opacity-40"}`}>{step.icon}</span>
              <div className="min-w-0">
                <p className={`text-sm font-medium leading-tight transition-colors duration-500 ${active ? (isDark ? "text-white" : "text-gray-900") : (isDark ? "text-gray-700" : "text-gray-300")}`}>{step.title}</p>
                <p className={`text-xs mt-0.5 transition-colors duration-500 ${active ? textSec : (isDark ? "text-gray-800" : "text-gray-200")}`}>{step.desc}</p>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={`rounded-xl border overflow-hidden ${bg} ${border}`}>
      <div className={`px-6 py-5 border-b text-center ${border}`}>
        <h2 className={`text-xl font-bold ${text}`}>See MEV Protection in Action</h2>
        <p className={`text-xs mt-1 ${isDark ? "text-gray-500" : "text-gray-400"}`}>Side-by-side comparison of a sandwich attack vs ShieldX protection</p>
      </div>

      <div className={`grid grid-cols-1 lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x ${isDark ? "divide-gray-800" : "divide-gray-200"}`}>
        <div className={`p-5 ${isDark ? "bg-red-950/10" : "bg-red-50/30"}`}>
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500"></span>
            <h3 className="text-base font-bold text-red-400">Normal DEX</h3>
            <span className="text-[10px] text-red-400/50 font-medium ml-auto uppercase tracking-wider">Vulnerable</span>
          </div>
          <StepList steps={normalSteps} theme="red" />
          <div className={`mt-4 p-4 rounded-lg border transition-all duration-700 ${showResults ? (isDark ? "bg-red-950/40 border-red-900/50" : "bg-red-50 border-red-200") + " opacity-100" : "bg-transparent border-transparent opacity-0"}`}>
            <p className={`text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>Attacker: <span className="text-emerald-500 font-bold">+$2.85</span></p>
            <p className={`text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>Victim: <span className="text-red-500 font-bold" style={{ textShadow: showResults ? "0 0 12px rgba(239,68,68,0.5)" : "none" }}>-$3.00</span></p>
            <p className="text-sm font-bold text-red-500 mt-1">MEV extracted: $3.00</p>
          </div>
        </div>

        <div className={`p-5 ${isDark ? "bg-emerald-950/10" : "bg-emerald-50/30"}`}>
          <div className="flex items-center gap-2 mb-4">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <h3 className="text-base font-bold text-emerald-500">ShieldX Protected</h3>
            <span className="text-[10px] text-emerald-400/50 font-medium ml-auto uppercase tracking-wider">Safe</span>
          </div>
          <StepList steps={shieldxSteps} theme="green" />
          <div className={`mt-4 p-4 rounded-lg border transition-all duration-700 ${showResults ? (isDark ? "bg-emerald-950/40 border-emerald-900/50" : "bg-emerald-50 border-emerald-200") + " opacity-100" : "bg-transparent border-transparent opacity-0"}`}>
            <p className={`text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>Attacker: <span className="text-gray-400 font-bold">$0.00</span></p>
            <p className={`text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>Victim: <span className="text-emerald-500 font-bold" style={{ textShadow: showResults ? "0 0 12px rgba(16,185,129,0.5)" : "none" }}>$0.00 loss</span></p>
            <p className="text-sm font-bold text-emerald-500 mt-1">MEV extracted: $0.00</p>
          </div>
        </div>
      </div>

      <div className={`py-5 px-6 text-center transition-all duration-500 ${isDark ? "bg-gray-800/50" : "bg-gray-100/80"} ${showResults ? "opacity-100" : "opacity-0"} ${bannerBounce ? "scale-105" : "scale-100"}`}>
        <p className="text-xl font-bold tracking-tight">MEV Protection: <span className="text-red-500">$3.00</span> <span className="text-gray-400 mx-1">&rarr;</span> <span className="text-emerald-500">$0.00</span></p>
        <p className={`text-[11px] mt-1 ${isDark ? "text-gray-500" : "text-gray-400"}`}>Uniform clearing price eliminates all ordering-based MEV</p>
      </div>
    </div>
  );
}
