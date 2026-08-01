/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx}", "./public/index.html"],
  theme: {
    extend: {
      colors: {
        slate: {
          850: "#111827",
          950: "#060913",
        },
        agent: {
          supervisor: "#a855f7",
          planner: "#06b6d4",
          security: "#f59e0b",
          refactor: "#10b981",
          critic: "#f43f5e",
        },
        terminal: {
          bg: "#090d16",
          panel: "#111726",
          border: "#1e293b",
          text: "#cbd5e1",
          accent: "#38bdf8",
          green: "#22c55e",
          red: "#ef4444",
          amber: "#eab308",
          purple: "#c084fc",
        },
      },
      animation: {
        "pulse-glow": "pulseGlow 2s infinite",
        "spin-slow": "spin 4s linear infinite",
      },
      keyframes: {
        pulseGlow: {
          "0%, 100%": { opacity: 1, boxShadow: "0 0 15px rgba(56, 189, 248, 0.4)" },
          "50%": { opacity: 0.7, boxShadow: "0 0 5px rgba(56, 189, 248, 0.1)" },
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
        sans: ["Inter", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
};

