import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        "bg-elevated": "var(--bg-elevated)",
        ink: "var(--text)",
        "ink-muted": "var(--text-muted)",
        accent: "var(--accent)",
        border: "var(--border)",
      },
      fontFamily: {
        heading: "var(--font-heading)",
        active: "var(--font-body-active)",
      },
      keyframes: {
        drift: {
          "0%": { transform: "translateY(0) translateX(0)", opacity: "0" },
          "10%": { opacity: "var(--particle-opacity, 0.7)" },
          "90%": { opacity: "var(--particle-opacity, 0.7)" },
          "100%": {
            transform: "translateY(-110vh) translateX(var(--drift-x, 20px))",
            opacity: "0",
          },
        },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        pulseGlow: {
          "0%, 100%": { opacity: "0.5" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        drift: "drift linear infinite",
        "fade-up": "fade-up 0.5s ease-out both",
        shimmer: "shimmer 2.2s linear infinite",
        pulseGlow: "pulseGlow 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
