import { useState, useEffect, useCallback } from "react";

const STEP_DURATION = 1500; // ms per step

const normalSteps = [
  { icon: "\u{1F441}", title: "Attacker sees victim's pending swap", desc: "Transaction visible in mempool" },
  { icon: "\u2B06", title: "Front-run: buys 50 DOT", desc: "Price pushed up 3%" },
  { icon: "\u{1F614}", title: "Victim swap executes at inflated price", desc: "Gets 97 USDC instead of 100" },
  { icon: "\u2B07", title: "Attacker sells at higher price", desc: "Profit extracted from victim" },
];

const shieldxSteps = [
  { icon: "\u{1F512}", title: "Orders submitted as hidden commitments", desc: "No one sees order details" },
  { icon: "\u{1F513}", title: "Epoch ends \u2014 orders revealed simultaneously", desc: "All at once, no advantage" },
  { icon: "\u2696", title: "Batch auction computes uniform price", desc: "Fair clearing price for all" },
  { icon: "\u2705", title: "All orders execute at SAME price", desc: "Zero MEV extraction possible" },
];

export function SandwichDemo() {
  const [activeStep, setActiveStep] = useState(-1);
  const [showResults, setShowResults] = useState(false);

  const runAnimation = useCallback(() => {
    setActiveStep(-1);
    setShowResults(false);

    for (let i = 0; i < 4; i++) {
      setTimeout(() => setActiveStep(i), (i + 1) * STEP_DURATION);
    }
    setTimeout(() => setShowResults(true), 5 * STEP_DURATION);
    setTimeout(() => runAnimation(), 12 * STEP_DURATION);
  }, []);

  useEffect(() => {
    runAnimation();
    return () => {
      setActiveStep(-1);
      setShowResults(false);
    };
  }, [runAnimation]);

  function StepList({ steps, theme }) {
    const isRed = theme === "red";
    return (
      <div className="space-y-3">
        {steps.map((step, i) => {
          const active = i <= activeStep;
          return (
            <div
              key={i}
              className={`flex items-start gap-3 p-3 rounded-lg transition-all duration-500 ${
                active
                  ? isRed ? "bg-red-950/50 border border-red-800" : "bg-emerald-950/50 border border-emerald-800"
                  : "bg-gray-800/30 border border-gray-800 opacity-40"
              }`}
            >
              <span className="text-2xl">{step.icon}</span>
              <div>
                <p className={`text-sm font-semibold ${active ? "text-white" : "text-gray-500"}`}>
                  {step.title}
                </p>
                <p className={`text-xs ${active ? "text-gray-400" : "text-gray-600"}`}>
                  {step.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-2">
        {/* Left: Normal DEX */}
        <div className="p-6 border-b lg:border-b-0 lg:border-r border-gray-800">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-3 h-3 rounded-full bg-red-500"></span>
            <h3 className="text-lg font-bold text-red-400">Normal DEX</h3>
          </div>
          <StepList steps={normalSteps} theme="red" />

          <div className={`mt-4 p-4 rounded-lg bg-red-950/30 border border-red-900 transition-all duration-500 ${showResults ? "opacity-100" : "opacity-0"}`}>
            <div className="space-y-1">
              <p className="text-sm">Attacker: <span className="text-emerald-400 font-bold">+$2.85 profit</span></p>
              <p className="text-sm">Victim: <span className="text-red-400 font-bold">-$3.00 loss</span></p>
              <p className="text-sm font-bold text-red-400">MEV extracted: $3.00</p>
            </div>
          </div>
        </div>

        {/* Right: ShieldX */}
        <div className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
            <h3 className="text-lg font-bold text-emerald-400">ShieldX Protected</h3>
          </div>
          <StepList steps={shieldxSteps} theme="green" />

          <div className={`mt-4 p-4 rounded-lg bg-emerald-950/30 border border-emerald-900 transition-all duration-500 ${showResults ? "opacity-100" : "opacity-0"}`}>
            <div className="space-y-1">
              <p className="text-sm">Attacker: <span className="text-gray-400 font-bold">$0.00 profit</span></p>
              <p className="text-sm">Victim: <span className="text-emerald-400 font-bold">$0.00 loss</span></p>
              <p className="text-sm font-bold text-emerald-400">MEV extracted: $0.00</p>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom banner */}
      <div className={`p-4 bg-gray-800 text-center transition-all duration-500 ${showResults ? "opacity-100" : "opacity-0"}`}>
        <p className="text-lg font-bold">
          MEV Protection: <span className="text-red-400">$3.00</span>{" "}
          <span className="text-gray-500">&rarr;</span>{" "}
          <span className="text-emerald-400">$0.00</span>
        </p>
      </div>
    </div>
  );
}
