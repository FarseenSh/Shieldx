import { createContext, useContext } from "react";

export const ThemeContext = createContext(true);

export function useTheme() {
  const isDark = useContext(ThemeContext);
  return {
    isDark,
    bg: isDark ? "bg-gray-900" : "bg-white",
    bgPage: isDark ? "bg-slate-950" : "bg-gray-50",
    bgInput: isDark ? "bg-gray-800/80" : "bg-gray-100",
    bgHover: isDark ? "hover:bg-gray-800/20" : "hover:bg-gray-50",
    border: isDark ? "border-gray-800" : "border-gray-200",
    borderSubtle: isDark ? "border-gray-800/60" : "border-gray-200",
    text: isDark ? "text-white" : "text-gray-900",
    textSec: isDark ? "text-gray-400" : "text-gray-500",
    textMuted: isDark ? "text-gray-500" : "text-gray-400",
    textFaint: isDark ? "text-gray-600" : "text-gray-300",
  };
}
