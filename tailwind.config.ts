import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx,html}"],
  theme: {
    extend: {
      fontFamily: {
        display: ["Rajdhani", "Inter", "system-ui", "sans-serif"],
        body: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"]
      },
      colors: {
        void: "#07090d",
        hull: "#101722",
        signal: "#39f5c4",
        warning: "#ffb86b",
        danger: "#ff5d73"
      }
    }
  },
  plugins: []
} satisfies Config;
