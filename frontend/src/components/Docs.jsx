import { useState, useEffect } from "react";
import { useTheme } from "../utils/theme.js";

function Code({ children, isDark }) {
  return (
    <pre className={`text-sm font-mono p-5 rounded-lg overflow-x-auto my-4 leading-relaxed ${isDark ? "bg-black/30 text-emerald-400" : "bg-gray-100 text-emerald-700"}`}>
      {children}
    </pre>
  );
}

function Litepaper({ isDark, text, textSec, textMuted }) {
  return (
    <div className="space-y-6">
      <p className={`text-base leading-relaxed ${textSec}`}>ShieldX is a commit-reveal batch auction protocol for MEV-protected trade execution on Polkadot Hub. It combines cryptographic order hiding, uniform clearing price settlement, and XCM cross-chain routing to eliminate sandwich attacks and all ordering-based MEV.</p>

      <div>
        <h3 className={`text-xl font-semibold mb-3 ${text}`}>The problem</h3>
        <p className={`text-base leading-relaxed ${textSec}`}>MEV costs DeFi users over <strong className={text}>$500 million annually</strong> on Ethereum. The most common attack is the sandwich: an attacker front-runs a user's swap, pushes the price up, then sells after. The user pays an inflated price.</p>
        <p className={`text-base leading-relaxed mt-3 ${textSec}`}>As DeFi grows on Polkadot Hub, the same dynamics emerge. There is no protection infrastructure today.</p>
      </div>

      <div>
        <h3 className={`text-xl font-semibold mb-3 ${text}`}>Core insight</h3>
        <p className={`text-base leading-relaxed ${textSec}`}>If all orders — including the attacker's buy and sell — execute at the <strong className={text}>same uniform price</strong>, the attacker's profit is exactly zero. ShieldX enforces this through four phases: commit, reveal, settle, execute.</p>
      </div>

      <div>
        <h3 className={`text-xl font-semibold mb-3 ${text}`}>Commitment format</h3>
        <Code isDark={isDark}>{`commitHash = keccak256(abi.encodePacked(
  orderType,     // uint8
  tokenIn,       // address
  tokenOut,      // address
  amountIn,      // uint256
  minAmountOut,  // uint256
  maxPrice,      // uint256
  salt           // bytes32, random
))`}</Code>
      </div>

      <div>
        <h3 className={`text-xl font-semibold mb-3 ${text}`}>Economics</h3>
        <p className={`text-base leading-relaxed ${textSec}`}>Protocol fee: 0.1% on settled volume (configurable, max 1%). Collateral bond: 0.01 PAS per order, returned after reveal, slashed if unrevealed. At $1M daily volume this generates $365K annual revenue.</p>
      </div>
    </div>
  );
}

function Security({ isDark, text, textSec, textMuted, border }) {
  const threats = [
    { name: "Commitment grinding", severity: "Low", fix: "Random 32-byte salt. 2^256 combinations makes brute-force infeasible." },
    { name: "Selective revelation", severity: "Medium", fix: "Collateral slashed if you don't reveal. Economic cost exceeds optionality value." },
    { name: "Front-running reveals", severity: "None", fix: "All orders get the same clearing price regardless of reveal order." },
    { name: "Price manipulation", severity: "Medium", fix: "On-chain detection algorithms: wash trading (score 70), spoofing (60), market impact (50)." },
    { name: "Mass commit griefing", severity: "Low", fix: "Each commit costs collateral. 1000 fake orders = 10 PAS locked, all slashed if unrevealed." },
    { name: "Vault extraction", severity: "Critical", fix: "ReentrancyGuard + AccessControl (ROUTER_ROLE). Checks-effects-interactions pattern." },
    { name: "Emergency exploit", severity: "Critical", fix: "Pausable circuit breaker. PAUSER_ROLE halts commits/reveals. Settlement still works when paused." },
  ];

  return (
    <div>
      <p className={`text-base leading-relaxed mb-8 ${textSec}`}>Seven attack vectors analyzed. Each has a specific on-chain mitigation. OpenZeppelin AccessControl for RBAC, Pausable for emergency circuit breaker.</p>
      <div className="space-y-4">
        {threats.map((t, i) => (
          <div key={i} className={`pb-4 border-b ${isDark ? "border-gray-800/40" : "border-gray-100"}`}>
            <div className="flex items-baseline gap-3 mb-1">
              <p className={`text-lg font-semibold ${text}`}>{t.name}</p>
              <span className={`text-sm ${t.severity === "None" ? "text-emerald-500" : t.severity === "Low" ? "text-blue-400" : t.severity === "Medium" ? "text-amber-500" : "text-red-400"}`}>{t.severity}</span>
            </div>
            <p className={`text-sm leading-relaxed ${textSec}`}>{t.fix}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function Integration({ isDark, text, textSec }) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className={`text-xl font-semibold mb-3 ${text}`}>1. Import the interface</h3>
        <Code isDark={isDark}>{`import {IShieldXRouter} from "./interfaces/IShieldXRouter.sol";
IShieldXRouter public shieldx = IShieldXRouter(ROUTER_ADDRESS);`}</Code>
      </div>
      <div>
        <h3 className={`text-xl font-semibold mb-3 ${text}`}>2. Submit a protected order</h3>
        <Code isDark={isDark}>{`// Client-side: generate salt + hash
const salt = crypto.getRandomValues(new Uint8Array(32));
const commitHash = ethers.solidityPackedKeccak256(
  ["uint8","address","address","uint256","uint256","uint256","bytes32"],
  [orderType, tokenIn, tokenOut, amountIn, minAmountOut, maxPrice, salt]
);
await router.commitOrder(commitHash, { value: collateral });`}</Code>
      </div>
      <div>
        <h3 className={`text-xl font-semibold mb-3 ${text}`}>3. Reveal and settle</h3>
        <Code isDark={isDark}>{`await router.revealOrder(orderType, tokenIn, tokenOut,
  amountIn, minAmountOut, maxPrice, salt);

// Permissionless — anyone can call
await router.settleEpoch(epochId);
const surplus = await router.getUserSurplus(epochId, userAddress);`}</Code>
      </div>
    </div>
  );
}

function SDK({ isDark, text, textSec, textMuted }) {
  return (
    <div className="space-y-6">
      <Code isDark={isDark}>{`npm install @shieldx/sdk ethers`}</Code>
      <div>
        <h3 className={`text-xl font-semibold mb-3 ${text}`}>Quick start</h3>
        <Code isDark={isDark}>{`const { ShieldX } = require("@shieldx/sdk");

const shieldx = new ShieldX(ROUTER_ADDRESS, signer);
await shieldx.submitProtectedOrder("BUY", DOT, USDC, amount, minOut, price);
const { surplus } = await shieldx.getOrderSurplus(epochId);`}</Code>
      </div>
      <div>
        <h3 className={`text-xl font-semibold mb-3 ${text}`}>API reference</h3>
        <div className="space-y-2">
          {[
            ["submitProtectedOrder()", "Commit with auto-generated salt and hash"],
            ["revealPendingOrders()", "Reveal all unrevealed orders"],
            ["getEpochStatus()", "Current phase, time remaining, order counts"],
            ["getOrderSurplus(epochId)", "MEV savings for your wallet"],
            ["getProtocolStats()", "Cumulative protocol metrics"],
            ["onEpochSettled(callback)", "Listen for settlement events"],
          ].map(([fn, desc]) => (
            <div key={fn} className={`flex flex-col sm:flex-row sm:gap-6 py-3 border-b ${isDark ? "border-gray-800/40" : "border-gray-100"}`}>
              <code className="text-base text-emerald-500 font-mono shrink-0 sm:w-64">{fn}</code>
              <span className={`text-base ${textSec}`}>{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const TABS = ["Litepaper", "Security", "Integration", "SDK"];

export function Docs({ initialTab }) {
  const { isDark, bg, border, text, textSec, textMuted } = useTheme();
  const [active, setActive] = useState(initialTab || "Litepaper");
  useEffect(() => { if (initialTab) setActive(initialTab); }, [initialTab]);

  return (
    <div>
      <div className={`flex gap-6 mb-10 border-b ${border}`}>
        {TABS.map(tab => (
          <button key={tab} onClick={() => setActive(tab)}
            className={`pb-3 text-base font-medium border-b-2 -mb-px transition-colors ${
              active === tab ? "text-emerald-500 border-emerald-500" : `${isDark ? "text-gray-400 hover:text-white" : "text-gray-400 hover:text-gray-900"} border-transparent`
            }`}>
            {tab}
          </button>
        ))}
      </div>

      <div className="max-w-4xl">
        {active === "Litepaper" && <Litepaper isDark={isDark} text={text} textSec={textSec} textMuted={textMuted} />}
        {active === "Security" && <Security isDark={isDark} text={text} textSec={textSec} textMuted={textMuted} border={border} />}
        {active === "Integration" && <Integration isDark={isDark} text={text} textSec={textSec} />}
        {active === "SDK" && <SDK isDark={isDark} text={text} textSec={textSec} textMuted={textMuted} />}
      </div>

      <div className={`mt-10 pt-4 border-t ${border}`}>
        <a href={`https://github.com/FarseenSh/Shieldx/tree/main/${active === "SDK" ? "sdk" : "docs"}`}
          target="_blank" rel="noopener noreferrer"
          className={`text-sm ${textMuted} hover:text-emerald-500 transition-colors`}>
          Full document on GitHub &rarr;
        </a>
      </div>
    </div>
  );
}
