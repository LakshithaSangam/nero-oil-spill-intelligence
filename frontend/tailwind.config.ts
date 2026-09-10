import type { Config } from "tailwindcss";

/** Every colour resolves to an RGB-channel CSS variable from src/styles/tokens.css,
 *  so `bg-surface-2`, `text-accent/70`, `border-border` all work with opacity. */
const rgb = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: rgb("--bg"),
        surface: {
          1: rgb("--surface-1"),
          2: rgb("--surface-2"),
          3: rgb("--surface-3"),
          inset: rgb("--surface-inset"),
        },
        panel: rgb("--panel"),
        border: rgb("--border"),
        "border-strong": rgb("--border-strong"),
        text: {
          DEFAULT: rgb("--text"),
          muted: rgb("--text-muted"),
          subtle: rgb("--text-subtle"),
        },
        accent: {
          DEFAULT: rgb("--accent"),
          strong: rgb("--accent-strong"),
          contrast: rgb("--accent-contrast"),
        },
        kelp: rgb("--kelp"),
        sand: rgb("--sand-200"),
        success: rgb("--success"),
        warning: rgb("--warning"),
        danger: rgb("--danger"),
        layer: {
          spill: rgb("--layer-spill"),
          "spill-edge": rgb("--layer-spill-edge"),
          "spill-sheen": rgb("--layer-spill-sheen"),
          origin: rgb("--layer-origin"),
          forecast: rgb("--layer-forecast"),
          hindcast: rgb("--layer-hindcast"),
          ais: rgb("--layer-ais"),
          suspect: rgb("--layer-suspect"),
          protected: rgb("--layer-protected"),
        },
      },
      fontFamily: {
        sans: "var(--font-sans)",
        serif: "var(--font-serif)",
        display: "var(--font-display)",
        mono: "var(--font-mono)",
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius)",
        lg: "var(--radius-lg)",
      },
      boxShadow: {
        1: "var(--shadow-1)",
        2: "var(--shadow-2)",
      },
      backdropBlur: {
        glass: "var(--glass-blur)",
      },
      transitionTimingFunction: {
        ocean: "var(--ease)",
      },
      transitionDuration: {
        fast: "var(--dur-fast)",
        DEFAULT: "var(--dur)",
      },
      keyframes: {
        "ripple-out": {
          "0%": { transform: "scale(0.4)", opacity: "0.5" },
          "100%": { transform: "scale(2.4)", opacity: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.55" },
        },
      },
      animation: {
        "ripple-out": "ripple-out 1.6s var(--ease) forwards",
        "fade-in": "fade-in var(--dur) var(--ease)",
        "pulse-soft": "pulse-soft 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
