import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        court: {
          bg: "#040906",
          panel: "#0a130d",
          panel2: "#101f15",
          line: "#1d3325",
        },
        // Alhayat brand: lime accent + pine green
        gold: "#C9D935", // brand accent (kept the name so existing usages rebrand automatically)
        lime: "#C9D935",
        pine: {
          DEFAULT: "#1B8A3E",
          deep: "#0C3B20",
        },
        live: "#FF5A5F",
        east: "#C9D935",
        west: "#3b82f6",
        north: "#22c55e",
        south: "#f59e0b",
        ne: "#a855f7",
        se: "#ec4899",
        nw: "#06b6d4",
        sw: "#eab308",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
      },
      keyframes: {
        "pop-in": {
          "0%": { transform: "scale(0.5)", opacity: "0" },
          "60%": { transform: "scale(1.15)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "flash-glow": {
          "0%": { boxShadow: "0 0 0 rgba(255,209,102,0)" },
          "30%": { boxShadow: "0 0 60px rgba(255,209,102,0.9)" },
          "100%": { boxShadow: "0 0 0 rgba(255,209,102,0)" },
        },
        marquee: {
          "0%": { transform: "translateX(0%)" },
          "100%": { transform: "translateX(-50%)" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
        shimmer: {
          "0%": { transform: "translateX(-160%) skewX(-14deg)" },
          "100%": { transform: "translateX(360%) skewX(-14deg)" },
        },
        "ring-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(201,217,53,0.35)" },
          "50%": { boxShadow: "0 0 28px 4px rgba(201,217,53,0.22)" },
        },
      },
      animation: {
        "pop-in": "pop-in 0.35s cubic-bezier(.34,1.56,.64,1)",
        "flash-glow": "flash-glow 1.1s ease-out",
        marquee: "marquee 30s linear infinite",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        shimmer: "shimmer 3.4s linear infinite",
        "ring-pulse": "ring-pulse 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
export default config;
